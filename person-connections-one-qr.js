(function(){
'use strict';

const BUILD='0.40.6';
const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-person-connections-v1';
const ENDPOINT='https://sharon.life/log/api/connections.php';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const CODE=/^log-connect-v2:([A-Za-z0-9_-]{12})$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REQUEST_TIMEOUT_MS=10000;
const CRYPTO_TIMEOUT_MS=5000;
let scanPatchAttempts=0;
let syncBusy=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function timeData(){const value=read(TIME,{});return{...value,settings:value.settings||{},colleagues:Array.isArray(value.colleagues)?value.colleagues:[]};}
function state(){const value=read(STORE,{});return{version:1,items:value.items&&typeof value.items==='object'?value.items:{}};}
function saveItem(id,patch){const value=state(),previous=value.items[id]||{};value.items[id]={...previous,...patch,connectionId:id,updatedAt:new Date().toISOString()};write(STORE,value);window.dispatchEvent(new CustomEvent('log-person-connections-change'));return value.items[id];}
function randomId(){const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);return Array.from(bytes,b=>ALPHABET[b&63]).join('');}
function randomBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes;}
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function selfId(){return String(window.LogIdentitySync?.personId?.()||timeData().settings.selfPersonId||'');}
function personById(id){return timeData().colleagues.find(person=>String(person.id)===String(id))||null;}
function selfProfile(){const data=timeData(),id=String(data.settings.selfPersonId||''),person=data.colleagues.find(row=>String(row.id)===id)||{};return{displayName:String(person.name||'Log-gebruiker').trim().slice(0,120),organization:String(person.organization||'').trim().slice(0,160)};}
function currentForLocal(localId){const person=personById(localId),ids=new Set([String(localId||''),String(person?.id||''),String(person?.logPersonId||'')].filter(Boolean));return Object.values(state().items).filter(item=>ids.has(String(item.otherPersonId||''))||ids.has(String(item.pendingLocalId||''))).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))).find(item=>['connected','pending_out','pending_in'].includes(item.status)&&!item.revoked)||null;}
function sheet(title,body){return window.LogCardsUI?.sheet?.(title,body)||null;}
function closeSheet(){window.LogCardsUI?.close?.();}
function qrSvg(value){if(typeof window.qrcode!=='function')return'';try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(String(value),'Byte');qr.make();return qr.createSvgTag({cellSize:6,margin:16,scalable:true});}catch(_){return'';}}
async function copy(value){try{await navigator.clipboard.writeText(String(value));return true;}catch(_){return false;}}
function withTimeout(promise,ms,message){return new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>{if(settled)return;settled=true;reject(Error(message));},ms);Promise.resolve(promise).then(value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);},error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});});}
function panelBody(panel){return panel?.querySelector?.('.cards-dialog-body')||panel||null;}
function progress(panel,text){const host=panel?.querySelector?.('[data-oneqr-progress]');if(host)host.textContent=text;}
function startPanel(person){return sheet('Verbinden',`<div class="log-oneqr-profile"><strong>${esc(person?.name||'Persoon')}</strong><span>verbinding voorbereiden…</span></div><p class="cards-notice">De 12-teken verbindingscode wordt veilig aangemaakt.</p><p role="status" data-oneqr-progress>Verbindingscode voorbereiden…</p>`);}
function showStartError(panel,person,localId,error){
  const target=panel?.isConnected?panel:document.querySelector('.cards-dialog');
  const body=panelBody(target);if(!body)return;
  let message=String(error?.message||'De verbinding kon niet worden aangemaakt.');
  if(Number(error?.status)===422&&/(ontvanger|memberpersonid|member person|personid)/i.test(message))message='De verbindingsserver gebruikt nog niet de nieuwste één-QR-versie. Werk /log/api/connections.php op sharon.life bij en probeer daarna opnieuw.';
  body.innerHTML=`<div class="log-oneqr-profile"><strong>${esc(person?.name||'Persoon')}</strong><span>verbinding niet aangemaakt</span></div><p class="cards-notice">${esc(message)}</p><button type="button" class="btn primary full" data-oneqr-retry>Opnieuw proberen</button><button type="button" class="btn secondary full" data-oneqr-close>Sluiten</button>`;
  body.querySelector('[data-oneqr-retry]')?.addEventListener('click',()=>createOpenRequest(localId).catch(()=>{}));
  body.querySelector('[data-oneqr-close]')?.addEventListener('click',closeSheet);
}

async function digestBytes(text){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));}
async function memberToken(connectionId){return b64url(await digestBytes(`log.connection.member.v1:${connectionId}`));}
async function contentSecret(connectionId){return b64url(await digestBytes(`log.connection.content.v1:${connectionId}`));}
async function importSecret(secret){return crypto.subtle.importKey('raw',fromB64url(secret),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encrypt(value,connectionId){const key=await importSecret(await contentSecret(connectionId)),iv=randomBytes(12),plain=new TextEncoder().encode(JSON.stringify(value)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{v:1,alg:'A256GCM',iv:b64url(iv),data:b64url(data)};}
async function decrypt(envelope,connectionId){if(Number(envelope?.v)!==1)throw Error('Onbekende verbindingsversleuteling.');try{const key=await importSecret(await contentSecret(connectionId)),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(envelope.iv)},key,fromB64url(envelope.data));return JSON.parse(new TextDecoder().decode(plain));}catch(_){throw Error('Deze verbindingscode hoort niet bij dit verzoek of is beschadigd.');}}
async function api(method,id='',body=null,token=''){
  const url=id?`${ENDPOINT}?id=${encodeURIComponent(id)}`:ENDPOINT,options={method,cache:'no-store',headers:{Accept:'application/json'}};
  if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  if(token)options.headers['X-Log-Access-Token']=token;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);options.signal=controller.signal;
  let response;
  try{response=await fetch(url,options);}
  catch(error){
    if(error?.name==='AbortError')throw Error('De verbindingsserver reageert te langzaam. Probeer opnieuw.');
    throw Error('De verbindingsserver is niet bereikbaar.');
  }finally{clearTimeout(timer);}
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok){const error=Error(result.error||`Verbindingsserver reageerde met ${response.status}.`);error.status=response.status;throw error;}
  return result;
}
function makeCode(id){return`log-connect-v2:${id}`;}
function parseCode(value){const match=String(value||'').trim().match(CODE);return match?{connectionId:match[1],code:String(value).trim()}:null;}

function showOutgoing(item,person,panel=null){
  const code=makeCode(item.connectionId),target=panel?.isConnected?panel:null;
  const body=target?panelBody(target):null;
  const content=`<div class="log-oneqr-profile"><strong>${esc(person?.name||'Persoon')}</strong><span>één QR · één bevestiging</span></div><div class="log-oneqr-qr">${qrSvg(code)}</div><div class="log-oneqr-code"><small>ConnectionId</small><strong>${esc(item.connectionId)}</strong></div><p class="cards-notice">Laat de andere persoon deze QR één keer scannen in Log. Die persoon hoeft jou niet eerst apart te koppelen. Na bevestigen wordt de echte PersonId automatisch aan deze persoon gekoppeld.</p><button type="button" class="btn secondary full" data-oneqr-copy>Verbindingscode kopiëren</button><p role="status" data-oneqr-status></p>`;
  const host=target||sheet('Verbinden',content);if(!host)return;
  if(body)body.innerHTML=content;
  const status=host.querySelector('[data-oneqr-status]');host.querySelector('[data-oneqr-copy]')?.addEventListener('click',async()=>{if(status)status.textContent=await copy(code)?'Verbindingscode gekopieerd.':'Kopiëren wordt op dit apparaat niet ondersteund.';});
}
async function createOpenRequest(localId){
  const person=personById(localId);if(!person)throw Error('Persoon niet gevonden.');
  const existing=currentForLocal(localId);if(existing){showOutgoing(existing,person);return existing;}
  const panel=startPanel(person);
  try{
    const ownerPersonId=selfId();if(!VALID.test(ownerPersonId))throw Error('Eigen PersonId is nog niet beschikbaar. Open Instellingen → Mijn Log & samenwerking één keer en probeer opnieuw.');
    const connectionId=randomId(),ownerToken=b64url(randomBytes(32)),now=new Date().toISOString(),profile=selfProfile();
    progress(panel,'Veilige toegangssleutel maken…');
    const member=await withTimeout(memberToken(connectionId),CRYPTO_TIMEOUT_MS,'De beveiliging van de verbindingscode reageert niet. Probeer opnieuw.');
    const document={schema:'log.connection.v1',version:1,connectionId,fromPersonId:ownerPersonId,toPersonId:null,openInvite:true,fromProfile:profile,targetHint:String(person.name||'').slice(0,120),confirmations:{[ownerPersonId]:true},status:'pending',createdAt:now,updatedAt:now};
    progress(panel,'Verbindingsgegevens versleutelen…');
    const payload=await withTimeout(encrypt(document,connectionId),CRYPTO_TIMEOUT_MS,'Het versleutelen duurt te lang. Probeer opnieuw.');
    progress(panel,'Verbinding online vastleggen…');
    const remote=await api('POST','',{action:'create',id:connectionId,ownerPersonId,memberPersonId:'',memberToken:member,payload},ownerToken);
    const item=saveItem(connectionId,{role:'owner',otherPersonId:String(person.id),pendingLocalId:String(person.id),ownerPersonId,ownerToken,accessToken:ownerToken,revision:Number(remote.revision)||1,status:'pending_out',cache:document,createdAt:now,revoked:false,oneQr:true});
    progress(panel,'Verbindingscode gereed.');
    showOutgoing(item,person,panel);return item;
  }catch(error){
    showStartError(panel,person,localId,error);
    error.__logConnectionShown=true;
    throw error;
  }
}

function normalized(value){return String(value||'').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g,' ');}
function linkedContact(personId){return timeData().colleagues.find(person=>String(person.id)===String(personId)||String(person.logPersonId||'')===String(personId))||null;}
function provisionalMatch(profile){const data=timeData(),self=String(data.settings.selfPersonId||''),name=normalized(profile?.displayName);if(!name)return null;const rows=data.colleagues.filter(person=>String(person.id)!==self&&person.identityStatus!=='linked'&&!VALID.test(String(person.logPersonId||''))&&normalized(person.name)===name);return rows.length===1?rows[0]:null;}
function ensureSenderContact(document){
  const personId=String(document.fromPersonId||''),profile=document.fromProfile&&typeof document.fromProfile==='object'?document.fromProfile:{};
  let person=linkedContact(personId);if(person)return person;
  person=provisionalMatch(profile);
  if(!person){if(!window.LogPeopleModule?.save)throw Error('Personen is nog niet beschikbaar.');person=window.LogPeopleModule.save('',{name:String(profile.displayName||'Nieuwe persoon').slice(0,120),relationship:'',organization:String(profile.organization||'').slice(0,160),email:'',phone:'',note:'',color:'#4da3ff'},false);}
  if(window.LogIdentitySync?.linkContact)window.LogIdentitySync.linkContact(person.id,personId);else if(window.LogPersonIdentity?.merge)window.LogPersonIdentity.merge(person.id,personId);else throw Error('De persoonsidentiteit kan nog niet worden gekoppeld.');
  return person;
}
async function fetchInvite(connectionId){const token=await memberToken(connectionId),remote=await api('GET',connectionId,null,token);if(remote.revoked)throw Error('Deze verbindingsuitnodiging is ingetrokken.');if(!remote.payload)throw Error('Het verbindingsverzoek bevat geen inhoud.');const document=await decrypt(remote.payload,connectionId);if(document?.schema!=='log.connection.v1'||document.version!==1||document.connectionId!==connectionId||!VALID.test(String(document.fromPersonId||'')))throw Error('Dit is geen geldig Log-verbindingsverzoek.');return{token,remote,document};}
async function acceptInvite(token,remote,document){
  const me=selfId();if(!VALID.test(me))throw Error('Eigen PersonId is nog niet beschikbaar.');if(String(document.fromPersonId)===me)throw Error('Je kunt niet met je eigen Log-identiteit verbinden.');
  if(remote.memberPersonId&&String(remote.memberPersonId)!==me)throw Error('Deze uitnodiging is al door een andere Log-identiteit bevestigd.');
  let claimed=remote;if(!remote.memberPersonId)claimed=await api('POST','',{action:'claim',id:document.connectionId,memberPersonId:me},token);
  document.toPersonId=me;document.openInvite=false;document.status='connected';document.confirmations=document.confirmations&&typeof document.confirmations==='object'?document.confirmations:{};document.confirmations[me]=true;document.acceptedAt=new Date().toISOString();document.updatedAt=document.acceptedAt;
  const payload=await encrypt(document,document.connectionId),published=await api('POST','',{action:'put',id:document.connectionId,baseRevision:Number(claimed.revision)||Number(remote.revision)||0,status:'connected',payload},token);
  const local=ensureSenderContact(document);
  saveItem(document.connectionId,{role:'member',otherPersonId:String(document.fromPersonId),linkedLocalId:String(local?.id||document.fromPersonId),accessToken:token,revision:Number(published.revision)||Number(claimed.revision)+1,status:'connected',cache:document,createdAt:document.createdAt||new Date().toISOString(),revoked:false,oneQr:true});
  return local;
}
async function rejectInvite(token,remote,document){document.status='rejected';document.rejectedByPersonId=selfId();document.rejectedAt=new Date().toISOString();document.updatedAt=document.rejectedAt;const payload=await encrypt(document,document.connectionId),published=await api('POST','',{action:'put',id:document.connectionId,baseRevision:Number(remote.revision)||0,status:'rejected',payload},token);saveItem(document.connectionId,{role:'member',otherPersonId:String(document.fromPersonId),accessToken:token,revision:Number(published.revision)||Number(remote.revision)+1,status:'rejected',cache:document,createdAt:document.createdAt||new Date().toISOString(),revoked:false,oneQr:true});}
async function previewInvite(value){
  const parsed=parseCode(value);if(!parsed)return false;const panel=sheet('Verbinden','<p role="status">Verbindingsverzoek controleren…</p>');if(!panel)return true;
  try{
    const {token,remote,document}=await fetchInvite(parsed.connectionId),profile=document.fromProfile&&typeof document.fromProfile==='object'?document.fromProfile:{},existing=linkedContact(document.fromPersonId)||provisionalMatch(profile),host=panel.querySelector('.cards-dialog-body')||panel;
    if(document.status==='connected'&&String(document.toPersonId||'')===selfId()){host.innerHTML='<p class="cards-notice">Deze verbinding is al bevestigd op dit apparaat.</p>';return true;}
    if(document.status==='rejected'){host.innerHTML='<p class="cards-notice">Dit verbindingsverzoek is al afgewezen.</p>';return true;}
    const name=String(profile.displayName||existing?.name||'Log-gebruiker'),organization=String(profile.organization||existing?.organization||'');
    host.innerHTML=`<div class="log-oneqr-profile"><strong>${esc(name)}</strong>${organization?`<span>${esc(organization)}</span>`:'<span>wil met jou verbinden in Log</span>'}</div><p class="cards-notice">Met één bevestiging koppel je deze Log-identiteit aan ${existing?`<strong>${esc(existing.name)}</strong>`:'een nieuwe persoon op dit apparaat'}. Daarna kunnen jullie afzonderlijk chatten of items met elkaar delen.</p><button type="button" class="btn primary full" data-oneqr-accept>Verbinden</button><button type="button" class="btn secondary full" data-oneqr-reject>Weigeren</button><p role="status" data-oneqr-message></p>`;
    const message=host.querySelector('[data-oneqr-message]');
    host.querySelector('[data-oneqr-accept]').onclick=async event=>{event.currentTarget.disabled=true;message.textContent='Verbinding bevestigen…';try{const local=await acceptInvite(token,remote,document);closeSheet();setTimeout(()=>{const done=sheet('Verbonden',`<div class="log-oneqr-profile"><strong>${esc(local?.name||name)}</strong><span>Log-identiteit bevestigd</span></div><p class="cards-notice">De persoonsverbinding is actief. Je kunt deze persoon nu gebruiken voor chat, urenvalidatie en gedeelde objecten.</p><button type="button" class="btn primary full" data-oneqr-done>Gereed</button>`);done?.querySelector('[data-oneqr-done]')?.addEventListener('click',closeSheet);},80);}catch(error){message.textContent=error.message;event.currentTarget.disabled=false;}};
    host.querySelector('[data-oneqr-reject]').onclick=async event=>{event.currentTarget.disabled=true;message.textContent='Verzoek weigeren…';try{await rejectInvite(token,remote,document);closeSheet();}catch(error){message.textContent=error.message;event.currentTarget.disabled=false;}};
  }catch(error){const host=panel.querySelector('.cards-dialog-body')||panel;host.innerHTML=`<p class="cards-notice">${esc(error.message)}</p>`;}
  return true;
}

async function syncOwners(){
  if(syncBusy||document.hidden||!navigator.onLine)return;syncBusy=true;
  try{
    const items=Object.values(state().items).filter(item=>item.role==='owner'&&!item.revoked&&item.status==='pending_out'&&item.connectionId&&item.ownerToken);
    for(const item of items){
      try{
        const remote=await api('GET',item.connectionId,null,item.ownerToken);if(remote.revoked){saveItem(item.connectionId,{status:'revoked',revoked:true,cache:null,revision:Number(remote.revision)||item.revision});continue;}if(!remote.payload||Number(remote.revision)===Number(item.revision))continue;
        const document=await decrypt(remote.payload,item.connectionId),status=document.status==='connected'?'connected':document.status==='rejected'?'rejected':'pending_out';saveItem(item.connectionId,{revision:Number(remote.revision)||item.revision,status,cache:document,revoked:false});
        if(status==='connected'&&VALID.test(String(document.toPersonId||''))){const localId=String(item.pendingLocalId||item.otherPersonId||'');if(localId&&localId!==String(document.toPersonId)){try{if(window.LogIdentitySync?.linkContact)window.LogIdentitySync.linkContact(localId,String(document.toPersonId));else window.LogPersonIdentity?.merge?.(localId,String(document.toPersonId));}catch(error){console.warn('PersonId uit bevestigde verbinding kon niet worden samengevoegd',error);}}}
      }catch(error){if(error.status===404||error.status===410)saveItem(item.connectionId,{status:'revoked',revoked:true,cache:null});}
    }
  }finally{syncBusy=false;}
}

function installScanBridge(){
  const code=window.LogCode,dispatcher=window.LogScanDispatcher;if(!code?.parse||!code?.preview||!dispatcher?.classify){if(scanPatchAttempts++<240)setTimeout(installScanBridge,50);return;}
  if(!code.parse.__oneQrConnection){const oldParse=code.parse.bind(code),parse=value=>{const parsed=parseCode(value);return parsed?{kind:'log-person-connection-v2',version:2,code:parsed.code}:oldParse(value);};parse.__oneQrConnection=true;parse.__original=oldParse;code.parse=parse;const oldPreview=code.preview.bind(code),preview=payload=>payload?.kind==='log-person-connection-v2'?(previewInvite(payload.code),true):oldPreview(payload);preview.__oneQrConnection=true;preview.__original=oldPreview;code.preview=preview;}
  if(!dispatcher.classify.__oneQrConnection){const old=dispatcher.classify.bind(dispatcher),classify=value=>{const parsed=parseCode(value);return parsed?{kind:'payload',payload:{kind:'log-person-connection-v2',version:2,code:parsed.code},value:parsed.code}:old(value);};classify.__oneQrConnection=true;classify.__original=old;dispatcher.classify=classify;}
}
function installStyles(){if(document.getElementById('logOneQrConnectionStyles'))return;const style=document.createElement('style');style.id='logOneQrConnectionStyles';style.textContent=`.log-oneqr-qr{display:grid;place-items:center;max-width:300px;margin:8px auto 12px;padding:8px;background:#fff;border-radius:14px}.log-oneqr-qr svg{width:100%;height:auto}.log-oneqr-code{display:grid;place-items:center;gap:3px;margin:8px 0 14px}.log-oneqr-code small{font-size:10px;color:var(--muted)}.log-oneqr-code strong{font:700 19px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.08em}.log-oneqr-profile{display:grid;gap:3px;text-align:center;margin:4px 0 12px}.log-oneqr-profile strong{font-size:18px}.log-oneqr-profile span{font-size:12px;color:var(--muted)}`;document.head.appendChild(style);}
function interceptConnectionStart(event){
  const button=event.target.closest?.('[data-person-connection-swipe]');if(!button||button.dataset.connectionSelf==='1')return;
  const localId=String(button.dataset.personConnectionSwipe||'');if(!localId)return;
  const current=currentForLocal(localId);if(current&&['connected','pending_out','pending_in'].includes(current.status)&&!current.revoked)return;
  event.preventDefault();event.stopImmediatePropagation();
  try{window.LogPersonConnectionSwipe?.setSide?.(button.closest('[data-person-row]'),'closed');}catch(_){}
  createOpenRequest(localId).catch(error=>{if(!error?.__logConnectionShown)sheet('Verbinden',`<p class="cards-notice">${esc(error.message)}</p>`);});
}
function init(){window.LOG_TEST_BUILD=BUILD;installStyles();document.addEventListener('click',interceptConnectionStart,true);installScanBridge();window.addEventListener('online',()=>syncOwners());window.addEventListener('pageshow',()=>syncOwners());window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncOwners();});setTimeout(syncOwners,1200);setInterval(()=>{if(document.visibilityState==='visible')syncOwners();},5000);window.LogOneQrConnections={createOpenRequest,previewInvite,syncOwners,parseCode};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
