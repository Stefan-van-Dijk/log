(function(){
'use strict';

const BUILD='0.39-test.3';
const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-collaboration-v2';
const ENDPOINT='https://sharon.life/log/api/sync.php';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let queued=false;

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readJson(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value));}
function state(){const value=readJson(STORE,{});return{version:2,items:value.items&&typeof value.items==='object'?value.items:{},inbox:value.inbox&&typeof value.inbox==='object'?value.inbox:{},locked:value.locked&&typeof value.locked==='object'?value.locked:{}};}
function save(value){writeJson(STORE,value);window.dispatchEvent(new CustomEvent('log-collaboration-v2-change'));}
function timeData(){return readJson(TIME,{});}
function contacts(){return Array.isArray(timeData().colleagues)?timeData().colleagues:[];}
function selfId(){return window.LogIdentitySync?.personId?.()||'';}
function linkedContacts(){return contacts().filter(person=>VALID.test(String(person.logPersonId||''))&&String(person.logPersonId)!==selfId());}
function contactByPersonId(personId){return contacts().find(person=>String(person.logPersonId||'')===String(personId))||null;}
function randomBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes;}
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function rightsFor(kind){if(kind==='vehicle')return['view','use','write','offline'];if(kind==='conversation')return['view','write','offline'];return['view'];}
function memberIds(local){return [...new Set([...Object.keys(local?.members||{}),local?.participantPersonId].filter(id=>VALID.test(String(id||''))))];}
function inviteCode(alias,memberToken,contentKey){return `log-share-v2:${alias}.${memberToken}.${contentKey}`;}
function kindLabel(kind){return kind==='vehicle'?'Auto':kind==='conversation'?'Gesprek':'Samenwerking';}

async function importSecret(secret){return crypto.subtle.importKey('raw',fromB64url(secret),{name:'AES-GCM'},false,['encrypt']);}
async function encryptSecret(value,secret){const iv=randomBytes(12),key=await importSecret(secret),plain=new TextEncoder().encode(JSON.stringify(value)),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{v:1,alg:'A256GCM',iv:b64url(iv),data:b64url(encrypted)};}
async function api(method,id='',body=null,token=''){
  const url=id?`${ENDPOINT}?id=${encodeURIComponent(id)}`:ENDPOINT,options={method,cache:'no-store',headers:{Accept:'application/json'}};
  if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  if(token)options.headers['X-Log-Access-Token']=token;
  const response=await fetch(url,options);let result={};try{result=await response.json();}catch(_){}
  if(!response.ok)throw Error(result.error||`Samenwerkingsserver reageerde met ${response.status}.`);return result;
}
function sheet(title,body){if(window.LogCardsUI?.sheet)return window.LogCardsUI.sheet(title,body);const dialog=document.createElement('dialog');dialog.className='log-collab-v2-dialog';dialog.innerHTML=`<header><strong>${esc(title)}</strong><button data-c2g-close>×</button></header>${body}`;document.body.appendChild(dialog);dialog.querySelector('[data-c2g-close]').onclick=()=>dialog.remove();dialog.showModal();return dialog;}
function closeSheet(){window.LogCardsUI?.close?.();document.querySelectorAll('.log-collab-v2-dialog').forEach(dialog=>dialog.remove());}
function qrSvg(value){if(typeof window.qrcode!=='function')return'';try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(value,'Byte');qr.make();return qr.createSvgTag({cellSize:4,margin:16,scalable:true});}catch(_){return'';}}
async function copy(text){try{await navigator.clipboard.writeText(String(text));return true;}catch(_){return false;}}
function showInvite(code,personName){const panel=sheet(`Uitnodiging voor ${personName||'deelnemer'}`,`<div class="log-c2-qr">${qrSvg(code)}</div><p class="cards-notice">Deze uitnodiging geeft alleen toegang tot deze samenwerking. De zichtbare alias is niet de private bronidentiteit.</p><button type="button" class="btn full" data-c2g-copy>Kopieer samenwerkingscode</button><p class="log-c2-code">${esc(code)}</p><p role="status" data-c2g-status></p>`);panel.querySelector('[data-c2g-copy]').onclick=async()=>{panel.querySelector('[data-c2g-status]').textContent=await copy(code)?'Samenwerkingscode gekopieerd.':'Kopiëren wordt op dit apparaat niet ondersteund.';};return panel;}

async function addParticipant(alias,localPersonId){
  const current=state(),local=current.items[alias],person=contacts().find(item=>String(item.id)===String(localPersonId));
  if(!local||local.role!=='owner')throw Error('Alleen de eigenaar kan deelnemers toevoegen.');
  if(!['vehicle','conversation'].includes(local.kind))throw Error('Meerdere deelnemers zijn hier niet van toepassing.');
  if(local.revoked)throw Error('Deze samenwerking is beëindigd.');
  const personId=String(person?.logPersonId||'');
  if(!VALID.test(personId))throw Error('Koppel deze persoon eerst aan een geldige PersonId.');
  if(memberIds(local).includes(personId))throw Error('Deze persoon doet al mee aan deze samenwerking.');
  if(!local.ownerToken||!local.contentKey)throw Error('Beheersleutel van deze samenwerking ontbreekt.');

  const memberToken=b64url(randomBytes(32)),rights=rightsFor(local.kind);
  await api('POST','',{action:'member',id:alias,memberToken,personId,rights},local.ownerToken);
  const remote=await api('GET',alias,null,local.ownerToken),document=clone(local.cache||{});
  document.participants=Array.isArray(document.participants)?document.participants:[];
  document.participants=document.participants.filter(participant=>participant.personId!==personId);
  document.participants.push({personId,role:'member',rights});
  document.updatedAt=new Date().toISOString();
  const payload=await encryptSecret(document,local.contentKey);
  const published=await api('POST','',{action:'put',id:alias,kind:local.kind,baseRevision:Number(remote.revision)||Number(local.revision)||0,ownerPersonId:local.ownerPersonId,payload},local.ownerToken);

  local.members=local.members&&typeof local.members==='object'?local.members:{};
  local.members[personId]={accessToken:memberToken,rights,addedAt:new Date().toISOString()};
  local.cache=document;
  local.revision=Number(published.revision)||Number(remote.revision)||local.revision;
  local.offline=false;
  local.updatedAt=new Date().toISOString();
  current.items[alias]=local;
  save(current);
  return{alias,personId,code:inviteCode(alias,memberToken,local.contentKey),revision:local.revision};
}

function ownerCollaborations(){return Object.values(state().items).filter(local=>local?.role==='owner'&&!local.revoked&&['vehicle','conversation'].includes(local.kind));}
function participantName(personId){return contactByPersonId(personId)?.name||personId;}
function collaborationTitle(local){return local.title||kindLabel(local.kind);}
function managerMarkup(){const items=ownerCollaborations();if(!items.length)return'<p class="cards-notice">Maak eerst een gesprek of deel een auto. Daarna kun je aan dezelfde samenwerking extra personen toevoegen.</p>';return items.map(local=>`<button type="button" class="log-c2-item" data-c2g-manage="${esc(local.alias)}"><span><strong>${esc(collaborationTitle(local))}</strong><small>${esc(kindLabel(local.kind))} · ${memberIds(local).length} deelnemer${memberIds(local).length===1?'':'s'}</small></span><span>›</span></button>`).join('');}
function showManager(){const panel=sheet('Deelnemers beheren',`<p class="cards-notice">Een gesprek of auto kan dezelfde samenwerking met meerdere personen delen. Iedere deelnemer krijgt een eigen toegangssleutel; de eigenaar kan de hele samenwerking in één keer beëindigen.</p>${managerMarkup()}`);panel.querySelectorAll('[data-c2g-manage]').forEach(button=>button.onclick=()=>showParticipants(button.dataset.c2gManage));return panel;}
function showParticipants(alias){
  const local=state().items[alias];if(!local)return sheet('Samenwerking','<p>Niet gevonden.</p>');
  const ids=memberIds(local),available=linkedContacts().filter(person=>!ids.includes(String(person.logPersonId||'')));
  const members=ids.length?ids.map(personId=>`<div class="log-c2-person"><span><strong>${esc(participantName(personId))}</strong><small>Deelnemer</small></span><span>✓</span></div>`).join(''):'<p class="cards-notice">Nog geen deelnemers.</p>';
  const add=available.length?available.map(person=>`<div class="log-c2-person"><span><strong>${esc(person.name)}</strong><small>${esc(person.logPersonId)}</small></span><button type="button" data-c2g-add="${esc(person.id)}">Toevoegen</button></div>`).join(''):'<p class="cards-notice">Alle gekoppelde personen doen al mee.</p>';
  const panel=sheet(collaborationTitle(local),`<div class="log-c2-section"><h3>Deelnemers</h3>${members}</div><div class="log-c2-section"><h3>Persoon toevoegen</h3>${add}</div><p class="cards-notice">Een afzonderlijke deelnemer verwijderen vereist sleutelrotatie en is daarom nog niet beschikbaar. De eigenaar kan de volledige samenwerking wel direct beëindigen.</p><button type="button" class="btn secondary full" data-c2g-back>Terug</button><p role="status" data-c2g-status></p>`),status=panel.querySelector('[data-c2g-status]');
  panel.querySelector('[data-c2g-back]').onclick=()=>showManager();
  panel.querySelectorAll('[data-c2g-add]').forEach(button=>button.onclick=async()=>{button.disabled=true;const person=contacts().find(item=>String(item.id)===String(button.dataset.c2gAdd));try{const result=await addParticipant(alias,button.dataset.c2gAdd);showInvite(result.code,person?.name||'deelnemer');}catch(error){status.textContent=error.message;button.disabled=false;}});
  return panel;
}

function decorateSettings(){
  const section=document.querySelector('#kmShellCollaborationV2 .km-shell-settings-accordion-body');if(!section||section.querySelector('[data-c2g-manager]'))return;
  const button=document.createElement('button');button.type='button';button.className='btn secondary full';button.dataset.c2gManager='1';button.textContent='Deelnemers beheren';button.style.marginTop='8px';button.onclick=showManager;section.appendChild(button);
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorateSettings();});}
function install(){window.LOG_TEST_BUILD=BUILD;queue();new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});['log-collaboration-v2-change','log-time-state-change','log-shell-view-refresh','pageshow'].forEach(name=>window.addEventListener(name,queue));window.LogCollaborationV2Groups={addParticipant,showManager,showParticipants};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();