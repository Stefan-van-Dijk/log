(function(){
'use strict';

const BUILD='0.39-test.3';
const TIME='urenregistratie.test.pwa.v1';
const IDENTITY='log-test-identity-sync-v2';
const ENDPOINT='https://sharon.life/log/api/sync.php';
const PENDING='log-person-card-link-target';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const CODE=/^log-person-v1:([A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{32,})$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let queued=false;
let patchAttempts=0;

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function randomId(){const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);return Array.from(bytes,b=>ALPHABET[b&63]).join('');}
function randomBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes;}
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function mask(value){const text=String(value||'');return text.length>4?`••••••••${text.slice(-4)}`:'••••••••';}
function timeData(){return read(TIME,{});}
function identityRaw(){return read(IDENTITY,{});}
function saveCardMeta(card){const value=identityRaw();value.self=value.self&&typeof value.self==='object'?value.self:{};value.self.personCard=card;write(IDENTITY,value);window.dispatchEvent(new CustomEvent('log-identity-sync-change'));return card;}
function selfProfile(){const time=timeData(),localId=String(time.settings?.selfPersonId||''),person=(Array.isArray(time.colleagues)?time.colleagues:[]).find(p=>String(p.id)===localId)||{};return{personId:window.LogIdentitySync?.personId?.()||'',displayName:String(person.name||'Mijn Log-profiel').trim().slice(0,120),organization:String(person.organization||'').trim().slice(0,160)};}
function profileSignature(profile){return JSON.stringify([profile.personId,profile.displayName,profile.organization]);}
function parseCode(value){const match=String(value||'').trim().match(CODE);return match?{alias:match[1],contentKey:match[2],code:String(value).trim()}:null;}
function makeCode(alias,key){return`log-person-v1:${alias}.${key}`;}

async function importSecret(secret){return crypto.subtle.importKey('raw',fromB64url(secret),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encrypt(value,secret){const iv=randomBytes(12),key=await importSecret(secret),plain=new TextEncoder().encode(JSON.stringify(value)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{v:1,alg:'A256GCM',iv:b64url(iv),data:b64url(data)};}
async function decrypt(envelope,secret){if(Number(envelope?.v)!==1)throw Error('Onbekende persoonskaartversleuteling.');try{const key=await importSecret(secret),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(envelope.iv)},key,fromB64url(envelope.data));return JSON.parse(new TextDecoder().decode(plain));}catch(_){throw Error('Deze persoonskaart is ongeldig of beschadigd.');}}
async function api(method,id='',body=null,token=''){
  const url=id?`${ENDPOINT}?id=${encodeURIComponent(id)}`:ENDPOINT,options={method,cache:'no-store',headers:{Accept:'application/json'}};
  if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}if(token)options.headers['X-Log-Access-Token']=token;
  const response=await fetch(url,options);let result={};try{result=await response.json();}catch(_){}
  if(!response.ok){const error=Error(result.error||`Persoonskaartserver reageerde met ${response.status}.`);error.status=response.status;throw error;}return result;
}
async function ensurePublished(force=false){
  if(!window.LogIdentitySync)throw Error('Log-identiteit is nog niet beschikbaar.');
  const profile=selfProfile();if(!VALID.test(profile.personId))throw Error('Er is nog geen geldige PersonId beschikbaar.');
  const raw=identityRaw(),saved=raw.self?.personCard&&typeof raw.self.personCard==='object'?raw.self.personCard:{};
  let card={...saved};
  if(!VALID.test(String(card.alias||''))||String(card.contentKey||'').length<32||String(card.ownerToken||'').length<32){card={alias:randomId(),contentKey:b64url(randomBytes(32)),ownerToken:b64url(randomBytes(32)),revision:0};force=true;}
  const signature=profileSignature(profile);
  let remote=null;
  if(!force&&card.signature===signature){
    try{remote=await api('GET',card.alias,null,card.ownerToken);if(remote.revoked)force=true;else if(remote.payload&&!remote.offline)return{...card,code:makeCode(card.alias,card.contentKey),profile};else force=true;}catch(_){force=true;}
  }
  if(force&&remote?.revoked){card={alias:randomId(),contentKey:b64url(randomBytes(32)),ownerToken:b64url(randomBytes(32)),revision:0};remote=null;}
  if(!remote&&Number(card.revision)>0){try{remote=await api('GET',card.alias,null,card.ownerToken);}catch(_){card={alias:randomId(),contentKey:b64url(randomBytes(32)),ownerToken:b64url(randomBytes(32)),revision:0};}}
  const document={schema:'log.person-card.v1',version:1,personId:profile.personId,displayName:profile.displayName,organization:profile.organization,updatedAt:new Date().toISOString()};
  const payload=await encrypt(document,card.contentKey),baseRevision=Math.max(0,Number(remote?.revision??card.revision)||0);
  let result;
  try{result=await api('POST','',{action:'put',id:card.alias,kind:'collaboration',baseRevision,ownerPersonId:profile.personId,payload},card.ownerToken);}catch(error){
    if(error.status!==409)throw error;
    remote=await api('GET',card.alias,null,card.ownerToken);
    result=await api('POST','',{action:'put',id:card.alias,kind:'collaboration',baseRevision:Number(remote.revision)||0,ownerPersonId:profile.personId,payload},card.ownerToken);
  }
  card={...card,revision:Number(result.revision)||baseRevision+1,signature,updatedAt:result.updatedAt||new Date().toISOString()};saveCardMeta(card);
  return{...card,code:makeCode(card.alias,card.contentKey),profile};
}
async function fetchCard(code){const parsed=parseCode(code);if(!parsed)throw Error('Dit is geen geldige Log-persoonskaart.');const remote=await api('GET',parsed.alias);if(remote.revoked)throw Error('Deze persoonskaart is ingetrokken.');if(remote.offline||!remote.payload)throw Error('Deze persoonskaart staat momenteel niet online.');const profile=await decrypt(remote.payload,parsed.contentKey);if(profile?.schema!=='log.person-card.v1'||profile.version!==1||!VALID.test(String(profile.personId||'')))throw Error('De persoonskaart bevat geen geldige Log-identiteit.');return{alias:parsed.alias,profile};}

function qrSvg(value){if(typeof window.qrcode!=='function')return'';try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(value,'Byte');qr.make();return qr.createSvgTag({cellSize:5,margin:16,scalable:true});}catch(_){return'';}}
async function copy(text){try{await navigator.clipboard.writeText(String(text));return true;}catch(_){return false;}}
function sheet(title,body){if(window.LogCardsUI?.sheet)return window.LogCardsUI.sheet(title,body);const d=document.createElement('dialog');d.className='log-person-card-dialog';d.innerHTML=`<header><strong>${esc(title)}</strong><button data-pc-close>×</button></header>${body}`;document.body.appendChild(d);d.querySelector('[data-pc-close]').onclick=()=>d.remove();d.showModal();return d;}
function closeSheet(){window.LogCardsUI?.close?.();document.querySelectorAll('.log-person-card-dialog').forEach(d=>d.remove());}
async function showOwnCard(){
  const panel=sheet('Mijn persoonskaart','<p role="status" data-pc-own-status>Persoonskaart voorbereiden…</p>');
  try{
    const current=await ensurePublished(false);if(!panel.isConnected)return;
    panel.innerHTML=`<div class="log-pc-profile"><strong>${esc(current.profile.displayName)}</strong>${current.profile.organization?`<span>${esc(current.profile.organization)}</span>`:''}</div><div class="log-pc-qr">${qrSvg(current.code)}</div><p class="cards-notice">Laat deze QR door de andere persoon in Log scannen. De vaste PersonId staat niet leesbaar in de QR; de kaart gebruikt een willekeurige publieke alias en een leessleutel.</p><button class="btn secondary full" data-pc-copy>Persoonskaartcode kopiëren</button><button class="btn secondary full" data-pc-refresh>Kaart vernieuwen</button><p role="status" data-pc-own-status></p>`;
    panel.querySelector('[data-pc-copy]').onclick=async()=>{panel.querySelector('[data-pc-own-status]').textContent=await copy(current.code)?'Persoonskaartcode gekopieerd.':'Kopiëren wordt op dit apparaat niet ondersteund.';};
    panel.querySelector('[data-pc-refresh]').onclick=async event=>{event.currentTarget.disabled=true;const status=panel.querySelector('[data-pc-own-status]');status.textContent='Persoonskaart bijwerken…';try{await ensurePublished(true);status.textContent='Persoonskaart is bijgewerkt. De QR blijft hetzelfde.';}catch(error){status.textContent=error.message;}finally{event.currentTarget.disabled=false;}};
  }catch(error){if(panel.isConnected)panel.innerHTML=`<p class="cards-notice">${esc(error.message)}</p><button class="btn secondary full" data-pc-retry>Opnieuw proberen</button>`;panel.querySelector('[data-pc-retry]')?.addEventListener('click',()=>{closeSheet();showOwnCard();});}
}

function localPeople(){const time=timeData(),self=String(time.settings?.selfPersonId||'');return(Array.isArray(time.colleagues)?time.colleagues:[]).filter(p=>String(p.id)!==self);}
function person(localId){return localPeople().find(p=>String(p.id)===String(localId))||null;}
function linkedByPersonId(personId){return localPeople().find(p=>String(p.logPersonId||'')===String(personId))||null;}
function recordPair(localId,profile,alias){const time=timeData();time.colleagues=Array.isArray(time.colleagues)?time.colleagues:[];const target=time.colleagues.find(p=>String(p.id)===String(localId));if(!target)return;target.logPersonCardAlias=alias;target.logPersonLinkedAt=new Date().toISOString();target.logPersonCardName=String(profile.displayName||'').slice(0,120);write(TIME,time);window.dispatchEvent(new Event('log-time-state-change'));}
function linkTo(localId,profile,alias){if(!window.LogIdentitySync)throw Error('Log-identiteit is nog niet beschikbaar.');const existing=linkedByPersonId(profile.personId);if(existing&&String(existing.id)!==String(localId))throw Error(`Deze persoonskaart is al gekoppeld aan ${existing.name}.`);window.LogIdentitySync.linkContact(localId,profile.personId);recordPair(localId,profile,alias);return person(localId);}
function createPerson(profile,alias){if(!window.LogPeopleModule?.save)throw Error('Personen is nog niet beschikbaar.');const created=window.LogPeopleModule.save('',{name:profile.displayName||'Nieuwe persoon',relationship:'',organization:profile.organization||'',email:'',phone:'',note:'',color:'#4da3ff'},false);window.LogIdentitySync.linkContact(created.id,profile.personId);recordPair(created.id,profile,alias);return created;}
function connectionSuccess(local,profile){const panel=sheet('Persoon verbonden',`<div class="log-pc-profile"><strong>${esc(local?.name||profile.displayName)}</strong>${profile.organization?`<span>${esc(profile.organization)}</span>`:''}</div><p class="cards-notice">De persoonsidentiteit is gekoppeld. Deze relatie kan nu worden gebruikt voor chat, urenvalidatie en gedeeld autogebruik.</p><button class="btn full" data-pc-done>Gereed</button>`);panel.querySelector('[data-pc-done]').onclick=closeSheet;queue();}
async function previewCard(code){
  const loading=sheet('Persoonskaart','<p role="status">Persoonskaart ophalen…</p>');
  try{
    const {alias,profile}=await fetchCard(code);if(!loading.isConnected)return true;
    if(String(profile.personId)===String(window.LogIdentitySync?.personId?.())){loading.innerHTML='<p class="cards-notice">Dit is jouw eigen persoonskaart.</p>';return true;}
    const already=linkedByPersonId(profile.personId),pendingId=sessionStorage.getItem(PENDING)||'',pending=person(pendingId);
    if(already&&(!pending||String(already.id)!==String(pending.id))){sessionStorage.removeItem(PENDING);loading.innerHTML=`<div class="log-pc-profile"><strong>${esc(profile.displayName||already.name)}</strong>${profile.organization?`<span>${esc(profile.organization)}</span>`:''}</div><p class="cards-notice">Deze persoonskaart is al gekoppeld aan <strong>${esc(already.name)}</strong>.</p>`;return true;}
    if(pending){
      loading.innerHTML=`<div class="log-pc-profile"><strong>${esc(profile.displayName||'Log-gebruiker')}</strong>${profile.organization?`<span>${esc(profile.organization)}</span>`:''}</div><p class="cards-notice">Koppel deze Log-identiteit aan <strong>${esc(pending.name)}</strong> op dit apparaat.</p><button class="btn full" data-pc-link>Koppel aan ${esc(pending.name)}</button><button class="btn secondary full" data-pc-cancel>Annuleren</button><p role="status" data-pc-status></p>`;
      loading.querySelector('[data-pc-link]').onclick=()=>{try{const linked=linkTo(pending.id,profile,alias);sessionStorage.removeItem(PENDING);closeSheet();connectionSuccess(linked,profile);}catch(error){loading.querySelector('[data-pc-status]').textContent=error.message;}};
      loading.querySelector('[data-pc-cancel]').onclick=()=>{sessionStorage.removeItem(PENDING);closeSheet();};return true;
    }
    const choices=localPeople().filter(p=>!VALID.test(String(p.logPersonId||''))||String(p.logPersonId)===String(profile.personId));
    loading.innerHTML=`<div class="log-pc-profile"><strong>${esc(profile.displayName||'Log-gebruiker')}</strong>${profile.organization?`<span>${esc(profile.organization)}</span>`:''}</div><label class="log-pc-field"><span>Koppelen aan</span><select data-pc-person><option value="__new__">Nieuwe persoon aanmaken</option>${choices.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><button class="btn full" data-pc-link>Verbinden</button><p role="status" data-pc-status></p>`;
    loading.querySelector('[data-pc-link]').onclick=()=>{const select=loading.querySelector('[data-pc-person]');try{const linked=select.value==='__new__'?createPerson(profile,alias):linkTo(select.value,profile,alias);closeSheet();connectionSuccess(linked,profile);}catch(error){loading.querySelector('[data-pc-status]').textContent=error.message;}};
  }catch(error){if(loading.isConnected)loading.innerHTML=`<p class="cards-notice">${esc(error.message)}</p>`;}return true;
}

function openScannerFor(localId){
  sessionStorage.setItem(PENDING,String(localId));closeSheet();
  setTimeout(()=>{
    const action=document.querySelector('.log-bottom-scan-action');if(action){action.click();return;}
    let scan=document.querySelector('#kmShellPlaceholderView [data-cards-scan]');
    if(!scan&&window.LogCardsModule?.mount){let host=document.getElementById('logPersonCardScannerHost');if(!host){host=document.createElement('div');host.id='logPersonCardScannerHost';host.hidden=true;document.body.appendChild(host);}window.LogCardsModule.mount(host);scan=host.querySelector('[data-cards-scan]');}
    if(scan){scan.click();document.querySelector('.cards-dialog [data-camera-start]')?.click();return;}
    sessionStorage.removeItem(PENDING);sheet('Persoonskaart koppelen','<p class="cards-notice">De QR-scanner kon niet worden geopend. Gebruik de Scan-knop onderin en scan daarna de persoonskaart.</p>');
  },140);
}
function manualLink(localId){const target=person(localId);if(!target)return;const value=prompt(`PersonId van ${target.name}:`,target.logPersonId||'');if(value===null)return;try{window.LogIdentitySync.linkContact(localId,value.trim());recordPair(localId,{displayName:target.name},'');queue();}catch(error){sheet('PersonId niet opgeslagen',`<p>${esc(error.message)}</p>`);}}

function decoratePersonDetails(){
  const time=timeData(),selfLocal=String(time.settings?.selfPersonId||'');
  document.querySelectorAll('.people-detail').forEach(detail=>{
    const edit=detail.parentElement?.querySelector('[data-person-edit]'),localId=String(edit?.dataset.personEdit||'');if(!localId)return;
    const block=detail.querySelector('[data-c2-person-link]');if(!block)return;
    const p=(Array.isArray(time.colleagues)?time.colleagues:[]).find(x=>String(x.id)===localId)||{},isSelf=localId===selfLocal,linked=VALID.test(String(p.logPersonId||''));
    const signature=JSON.stringify([isSelf,p.logPersonId||'',p.logPersonLinkedAt||'']);
    if(block.dataset.personCardSignature===signature&&block.querySelector(isSelf?'[data-pc-own]':'[data-pc-scan]'))return;
    block.dataset.personCardSignature=signature;if(isSelf)block.dataset.selfProtected='1';
    block.innerHTML=isSelf?`<small>Mijn Log-profiel</small><p>Persoonskaart actief via een afgeschermde deelcode</p><button type="button" class="btn secondary full" data-pc-own>Mijn persoonskaart tonen</button>`:`<small>Log-verbinding</small><p>${linked?`Verbonden · ${esc(mask(p.logPersonId))}`:'Nog niet gekoppeld'}</p><button type="button" class="btn secondary full" data-pc-scan>${linked?'Persoonskaart opnieuw scannen':'Persoonskaart scannen'}</button><details class="log-pc-manual"><summary>Handmatig koppelen</summary><button type="button" class="btn secondary full" data-pc-manual>PersonId invoeren</button></details>`;
    block.querySelector('[data-pc-own]')?.addEventListener('click',showOwnCard);
    block.querySelector('[data-pc-scan]')?.addEventListener('click',()=>openScannerFor(localId));
    block.querySelector('[data-pc-manual]')?.addEventListener('click',()=>manualLink(localId));
  });
}
function decorateIdentityDialog(){
  document.querySelectorAll('.log-identity-card').forEach(card=>{const children=[...card.children];for(let i=0;i<children.length-1;i++){const label=children[i],value=children[i+1];if(label.tagName==='SPAN'&&value.tagName==='STRONG'&&['PersonId','VehicleId'].includes(label.textContent.trim())&&!value.dataset.pcMasked){value.dataset.pcMasked='1';value.dataset.pcValue=value.textContent;value.textContent=mask(value.textContent);value.title='Technische identifier afgeschermd';}}const actions=card.parentElement?.querySelector('.log-identity-actions');if(actions&&!actions.querySelector('[data-pc-own]')){const button=document.createElement('button');button.type='button';button.className='btn secondary full';button.dataset.pcOwn='1';button.textContent='Mijn persoonskaart tonen';button.onclick=showOwnCard;actions.prepend(button);}});
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decoratePersonDetails();decorateIdentityDialog();});}

function installScanBridge(){
  const code=window.LogCode,dispatcher=window.LogScanDispatcher;if(!code?.parse||!code?.preview||!dispatcher?.classify){if(patchAttempts++<240)setTimeout(installScanBridge,50);return;}
  if(!code.parse.__personCardV2){const oldParse=code.parse.bind(code);const parse=value=>parseCode(value)?{kind:'log-person-card',version:1,code:String(value).trim()}:oldParse(value);parse.__personCardV2=true;parse.__original=oldParse;code.parse=parse;const oldPreview=code.preview.bind(code),preview=payload=>payload?.kind==='log-person-card'?(previewCard(payload.code),true):oldPreview(payload);preview.__personCardV2=true;preview.__original=oldPreview;code.preview=preview;}
  if(!dispatcher.classify.__personCardV2){const old=dispatcher.classify.bind(dispatcher);const classify=value=>parseCode(value)?{kind:'payload',payload:{kind:'log-person-card',version:1,code:String(value).trim()},value:String(value)}:old(value);classify.__personCardV2=true;classify.__original=old;dispatcher.classify=classify;}
}
function installStyles(){if(document.getElementById('logPersonCardV2Styles'))return;const style=document.createElement('style');style.id='logPersonCardV2Styles';style.textContent=`.log-pc-profile{display:grid;gap:3px;text-align:center;margin:4px 0 10px}.log-pc-profile strong{font-size:18px}.log-pc-profile span{font-size:12px;color:var(--muted)}.log-pc-qr{display:grid;place-items:center;max-width:300px;margin:8px auto 12px;padding:8px;background:#fff;border-radius:14px}.log-pc-qr svg{width:100%;height:auto}.log-pc-field{display:grid;gap:5px;margin:12px 0}.log-pc-field span{font-size:11px;color:var(--muted)}.log-pc-field select{width:100%;min-height:44px;padding:9px;border:1px solid var(--line);border-radius:10px;background:var(--card2);color:var(--text)}.log-pc-manual{margin-top:8px}.log-pc-manual summary{font-size:11px;color:var(--muted);cursor:pointer}.log-pc-manual .btn{margin-top:7px}.log-person-card-dialog{max-width:520px;width:calc(100% - 32px);border:1px solid var(--line);border-radius:18px;background:var(--card);color:var(--text);padding:16px}.log-person-card-dialog::backdrop{background:rgba(0,0,0,.5)}.log-person-card-dialog header{display:flex;justify-content:space-between}.log-person-card-dialog header button{border:0;background:transparent;color:var(--text);font-size:24px}`;document.head.appendChild(style);}
function install(){window.LOG_TEST_BUILD=BUILD;installStyles();queue();installScanBridge();new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});['log-time-state-change','log-identity-sync-change','log-shell-view-refresh','pageshow'].forEach(name=>window.addEventListener(name,queue));window.LogPersonCardV2={showOwnCard,ensurePublished,fetchCard,previewCard,openScannerFor,parseCode};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
