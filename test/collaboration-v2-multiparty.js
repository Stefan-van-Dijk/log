(function(){
'use strict';

const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-collaboration-v2';
const ENDPOINT='https://sharon.life/log/api/sync.php';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let augmentQueued=false;

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));window.dispatchEvent(new CustomEvent('log-collaboration-v2-change'));}
function randomBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes;}
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function state(){const value=read(STORE,{});return{...value,items:value.items&&typeof value.items==='object'?value.items:{},inbox:value.inbox&&typeof value.inbox==='object'?value.inbox:{},locked:value.locked&&typeof value.locked==='object'?value.locked:{}};}
function contacts(){const time=read(TIME,{}),self=window.LogIdentitySync?.personId?.()||'';return(Array.isArray(time.colleagues)?time.colleagues:[]).filter(p=>VALID.test(String(p.logPersonId||''))&&p.logPersonId!==self);}
function rights(kind){return kind==='vehicle'?['view','use','write','offline']:kind==='conversation'?['view','write','offline']:['view'];}
async function importSecret(secret){return crypto.subtle.importKey('raw',fromB64url(secret),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encrypt(value,secret){const iv=randomBytes(12),key=await importSecret(secret),plain=new TextEncoder().encode(JSON.stringify(value)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{v:1,alg:'A256GCM',iv:b64url(iv),data:b64url(data)};}
async function decrypt(envelope,secret){const key=await importSecret(secret),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(envelope.iv)},key,fromB64url(envelope.data));return JSON.parse(new TextDecoder().decode(plain));}
async function api(method,id='',body=null,token=''){const url=id?`${ENDPOINT}?id=${encodeURIComponent(id)}`:ENDPOINT,options={method,cache:'no-store',headers:{Accept:'application/json'}};if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}if(token)options.headers['X-Log-Access-Token']=token;const response=await fetch(url,options);let result={};try{result=await response.json();}catch(_){}if(!response.ok)throw Error(result.error||`Samenwerkingsserver reageerde met ${response.status}.`);return result;}
function invite(alias,token,key){return`log-share-v2:${alias}.${token}.${key}`;}
function saveLocal(alias,local){const s=state();s.items[alias]=local;write(STORE,s);}

async function addParticipant(alias,localPersonId){
  const s=state(),local=s.items[alias];
  if(!local||local.role!=='owner')throw Error('Alleen de eigenaar kan deelnemers toevoegen.');
  if(!['vehicle','conversation'].includes(local.kind))throw Error('Voor uren wordt per persoon een aparte voorlegging gemaakt.');
  const person=contacts().find(p=>String(p.id)===String(localPersonId));
  if(!person)throw Error('Deze persoon heeft geen gekoppelde PersonId.');
  const personId=String(person.logPersonId),members=local.members&&typeof local.members==='object'?local.members:{};
  if(members[personId])throw Error('Deze persoon doet al mee aan deze samenwerking.');

  const remote=await api('GET',alias,null,local.ownerToken);
  if(remote.revoked)throw Error('Deze samenwerking is beëindigd.');
  let doc=local.cache?clone(local.cache):null;
  if(remote.payload)doc=await decrypt(remote.payload,local.contentKey);
  if(!doc)throw Error('De samenwerkingsinhoud ontbreekt op dit apparaat.');

  doc.participants=Array.isArray(doc.participants)?doc.participants:[];
  if(doc.participants.some(p=>p.personId===personId))throw Error('Deze persoon staat al in de deelnemerslijst.');
  const memberRights=rights(local.kind),memberToken=b64url(randomBytes(32));
  await api('POST','',{action:'member',id:alias,memberToken,personId,rights:memberRights},local.ownerToken);
  doc.participants.push({personId,role:'member',rights:memberRights});
  doc.updatedAt=new Date().toISOString();
  const payload=await encrypt(doc,local.contentKey),published=await api('POST','',{action:'put',id:alias,kind:local.kind,baseRevision:Number(remote.revision)||Number(local.revision)||0,ownerPersonId:local.ownerPersonId,payload},local.ownerToken);
  local.members={...members,[personId]:{accessToken:memberToken,rights:memberRights,name:person.name,addedAt:new Date().toISOString()}};
  local.cache=doc;local.revision=Number(published.revision)||Number(remote.revision)+1;local.offline=false;local.updatedAt=new Date().toISOString();
  saveLocal(alias,local);
  return{alias,personId,name:person.name,code:invite(alias,memberToken,local.contentKey)};
}

function qrSvg(value){if(typeof window.qrcode!=='function')return'';try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(value,'Byte');qr.make();return qr.createSvgTag({cellSize:4,margin:16,scalable:true});}catch(_){return'';}}
async function copy(text){try{await navigator.clipboard.writeText(text);return true;}catch(_){return false;}}
function showInvite(result){const ui=window.LogCardsUI;if(!ui?.sheet)return;const panel=ui.sheet(`Uitnodiging voor ${result.name}`,`<div class="log-c2-qr">${qrSvg(result.code)}</div><p class="cards-notice">Deze uitnodiging geeft alleen ${esc(result.name)} toegang tot deze samenwerking.</p><button class="btn full" data-c2-multi-copy>Code kopiëren</button><p class="log-c2-code">${esc(result.code)}</p><p role="status" data-c2-multi-status></p>`);panel.querySelector('[data-c2-multi-copy]').onclick=async()=>{panel.querySelector('[data-c2-multi-status]').textContent=await copy(result.code)?'Uitnodiging gekopieerd.':'Kopiëren wordt niet ondersteund.';};}

function ownerCollaborations(){return Object.values(state().items).filter(item=>item.role==='owner'&&!item.revoked&&['vehicle','conversation'].includes(item.kind));}
function availablePeople(item){const used=new Set(Object.keys(item?.members||{}));for(const p of item?.cache?.participants||[])if(p.personId)used.add(p.personId);return contacts().filter(p=>!used.has(String(p.logPersonId)));}
function options(items,value,title){return items.map(item=>`<option value="${esc(value(item))}">${esc(title(item))}</option>`).join('');}
function augmentManager(){
  augmentQueued=false;
  const input=document.querySelector('[data-c2-invite-input]');
  const root=input?.closest('.log-sheet-body,.log-card-sheet-body,.log-public-dialog-body,dialog')||input?.parentElement?.parentElement?.parentElement;
  if(!input||!root||root.querySelector('[data-c2-multiparty]'))return;
  const collaborations=ownerCollaborations();if(!collaborations.length)return;
  const section=document.createElement('div');section.className='log-c2-section';section.dataset.c2Multiparty='1';
  section.innerHTML=`<h3>Deelnemer toevoegen</h3><label class="log-c2-multi-field"><span>Samenwerking</span><select data-c2-multi-collab>${options(collaborations,x=>x.alias,x=>x.title||x.kind)}</select></label><label class="log-c2-multi-field"><span>Persoon</span><select data-c2-multi-person></select></label><button type="button" class="btn secondary full" data-c2-multi-add>Uitnodiging maken</button><p role="status" data-c2-multi-message></p>`;
  const active=[...root.querySelectorAll('.log-c2-section')].pop();if(active)active.before(section);else root.appendChild(section);
  const collab=section.querySelector('[data-c2-multi-collab]'),people=section.querySelector('[data-c2-multi-person]'),message=section.querySelector('[data-c2-multi-message]');
  const syncPeople=()=>{const current=state().items[collab.value],list=availablePeople(current);people.innerHTML=list.length?options(list,p=>p.id,p=>p.name):'<option value="">Geen nieuwe gekoppelde personen</option>';section.querySelector('[data-c2-multi-add]').disabled=!list.length;};
  collab.onchange=syncPeople;syncPeople();
  section.querySelector('[data-c2-multi-add]').onclick=async event=>{if(!people.value)return;event.currentTarget.disabled=true;message.textContent='Uitnodiging maken…';try{const result=await addParticipant(collab.value,people.value);showInvite(result);}catch(error){message.textContent=error.message;event.currentTarget.disabled=false;}};
}
function queueAugment(){if(augmentQueued)return;augmentQueued=true;requestAnimationFrame(augmentManager);}
function installStyles(){if(document.getElementById('logCollaborationV2MultipartyStyles'))return;const style=document.createElement('style');style.id='logCollaborationV2MultipartyStyles';style.textContent=`.log-c2-multi-field{display:grid;gap:4px;margin:8px 0}.log-c2-multi-field span{font-size:10px;color:var(--muted)}.log-c2-multi-field select{width:100%;min-height:40px;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--card2);color:var(--text)}`;document.head.appendChild(style);}
function install(){let attempts=0;const ready=()=>{if(!window.LogCollaborationV2||!window.LogIdentitySync){if(attempts++<200)return setTimeout(ready,50);return;}installStyles();window.LogCollaborationV2.addParticipant=addParticipant;queueAugment();new MutationObserver(queueAugment).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('log-collaboration-v2-change',queueAugment);};ready();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
