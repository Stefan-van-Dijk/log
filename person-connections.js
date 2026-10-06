(function(){
'use strict';

const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-person-connections-v1';
const ENDPOINT='https://sharon.life/log/api/connections.php';
const SCAN_TARGET='log-person-connection-scan-target';
const PERSON_SCAN_TARGET='log-person-card-link-target';
const AFTER_PERSON_LINK='log-person-connect-after-link';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const SHARE_INVITE=/^log-share-v2:/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let decorateQueued=false;
let peopleObserver=null;
let scanPatchAttempts=0;
let syncTimer=null;
let collabPromise=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function timeData(){const value=read(TIME,{});return{...value,settings:value.settings||{},colleagues:Array.isArray(value.colleagues)?value.colleagues:[]};}
function state(){const value=read(STORE,{});return{version:1,items:value.items&&typeof value.items==='object'?value.items:{}};}
function saveState(value){write(STORE,value);window.dispatchEvent(new CustomEvent('log-person-connections-change'));queueDecorate();}
function saveItem(id,patch){const s=state(),previous=s.items[id]||{};s.items[id]={...previous,...patch,connectionId:id,updatedAt:new Date().toISOString()};saveState(s);return s.items[id];}
function randomId(){const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);return Array.from(bytes,b=>ALPHABET[b&63]).join('');}
function randomBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes;}
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function selfId(){const value=window.LogIdentitySync?.personId?.()||timeData().settings.selfPersonId||'';return String(value);}
function personById(id){return timeData().colleagues.find(person=>String(person.id)===String(id))||null;}
function realPersonId(person){
  if(!person)return'';
  if(person.identityStatus==='self'||person.identityStatus==='linked')return VALID.test(String(person.id||''))?String(person.id):String(person.logPersonId||'');
  if(VALID.test(String(person.logPersonId||''))&&person.logPersonId!==selfId())return String(person.logPersonId);
  return'';
}
function recordsForPerson(personId){return Object.values(state().items).filter(item=>String(item.otherPersonId||'')===String(personId)).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||'')));}
function currentForPerson(personId){
  const rows=recordsForPerson(personId),active=rows.find(item=>['connected','pending_out','pending_in'].includes(item.status)&&!item.revoked);
  return active||rows[0]||null;
}
function isConnected(personId){return currentForPerson(personId)?.status==='connected';}
function statusForLocal(localId){const person=personById(localId);if(!person)return{key:'none',item:null};const item=currentForPerson(String(person.id));return{key:item?.status||'none',item};}
function statusText(status){return status==='connected'?'Verbonden':status==='pending_out'?'Wacht op bevestiging':status==='pending_in'?'Bevestiging nodig':status==='rejected'?'Verzoek afgewezen':status==='revoked'?'Verbinding verbroken':'Nog niet verbonden';}
function actionText(status){return status==='connected'?'Verbinding':status==='pending_out'?'Verzoek':status==='pending_in'?'Bevestigen':status==='rejected'||status==='revoked'?'Opnieuw':'Verbinden';}

async function digestBytes(text){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));}
async function memberToken(connectionId){return b64url(await digestBytes(`log.connection.member.v1:${connectionId}`));}
async function contentSecret(connectionId){return b64url(await digestBytes(`log.connection.content.v1:${connectionId}`));}
async function importSecret(secret){return crypto.subtle.importKey('raw',fromB64url(secret),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encrypt(value,connectionId){const secret=await contentSecret(connectionId),key=await importSecret(secret),iv=randomBytes(12),plain=new TextEncoder().encode(JSON.stringify(value)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{v:1,alg:'A256GCM',iv:b64url(iv),data:b64url(data)};}
async function decrypt(envelope,connectionId){if(Number(envelope?.v)!==1)throw Error('Onbekende verbindingsversleuteling.');try{const secret=await contentSecret(connectionId),key=await importSecret(secret),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(envelope.iv)},key,fromB64url(envelope.data));return JSON.parse(new TextDecoder().decode(plain));}catch(_){throw Error('Dit verbindingsverzoek hoort niet bij deze code of is beschadigd.');}}
async function api(method,id='',body=null,token=''){
  const url=id?`${ENDPOINT}?id=${encodeURIComponent(id)}`:ENDPOINT,options={method,cache:'no-store',headers:{Accept:'application/json'}};
  if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  if(token)options.headers['X-Log-Access-Token']=token;
  let response;
  try{response=await fetch(url,options);}catch(_){throw Error('De verbindingsserver is nog niet bereikbaar. Plaats connections.php eerst op de server.');}
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok){const error=Error(result.error||`Verbindingsserver reageerde met ${response.status}.`);error.status=response.status;throw error;}
  return result;
}
function qrSvg(value,cellSize=7){if(typeof window.qrcode!=='function')return'';try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(String(value),'Byte');qr.make();return qr.createSvgTag({cellSize,margin:16,scalable:true});}catch(_){return'';}}
async function copy(value){try{await navigator.clipboard.writeText(String(value));return true;}catch(_){return false;}}
function sheet(title,body){return window.LogCardsUI?.sheet?.(title,body)||null;}
function closeSheet(){window.LogCardsUI?.close?.();}
function openScanner(){
  closeSheet();
  setTimeout(()=>{
    const bottom=document.querySelector('.log-bottom-scan-action');if(bottom){bottom.click();return;}
    let scan=document.querySelector('#kmShellPlaceholderView [data-cards-scan]');
    if(!scan&&window.LogCardsModule?.mount){let host=document.getElementById('logPersonConnectionScannerHost');if(!host){host=document.createElement('div');host.id='logPersonConnectionScannerHost';host.hidden=true;document.body.appendChild(host);}window.LogCardsModule.mount(host);scan=host.querySelector('[data-cards-scan]');}
    if(scan){scan.click();document.querySelector('.cards-dialog [data-camera-start]')?.click();return;}
    sheet('Scannen','<p class="cards-notice">De QR-scanner kon niet worden geopend. Gebruik de Scan-knop onderin.</p>');
  },120);
}
function openPersonCardScanner(localId){sessionStorage.setItem(PERSON_SCAN_TARGET,String(localId));sessionStorage.setItem(AFTER_PERSON_LINK,String(localId));openScanner();}
function openConnectionScanner(localId){sessionStorage.setItem(SCAN_TARGET,String(localId));openScanner();}

function showRequestCode(item,person){
  const panel=sheet('Verbindingsverzoek',`<div class="log-connection-qr">${qrSvg(item.connectionId)}</div><div class="log-connection-code"><small>ConnectionId</small><strong>${esc(item.connectionId)}</strong></div><p class="cards-notice">Laat ${esc(person?.name||'de andere persoon')} deze 12-teken code scannen via Personen → Verbinden → Verbindingsverzoek scannen. De verbinding is pas actief nadat de andere persoon bevestigt.</p><button type="button" class="btn secondary full" data-connection-copy>12-teken code kopiëren</button><p role="status" data-connection-status></p>`);
  if(!panel)return;const status=panel.querySelector('[data-connection-status]');panel.querySelector('[data-connection-copy]').onclick=async()=>{status.textContent=await copy(item.connectionId)?'ConnectionId gekopieerd.':'Kopiëren wordt op dit apparaat niet ondersteund.';};
}
async function createRequest(localId){
  const person=personById(localId);if(!person)throw Error('Persoon niet gevonden.');
  const otherPersonId=realPersonId(person);if(!VALID.test(otherPersonId)){openPersonCardScanner(localId);return null;}
  const existing=currentForPerson(otherPersonId);if(existing&&['connected','pending_out','pending_in'].includes(existing.status)&&!existing.revoked){showConnection(localId);return existing;}
  const connectionId=randomId(),ownerToken=b64url(randomBytes(32)),member=await memberToken(connectionId),ownerPersonId=selfId(),now=new Date().toISOString();
  if(!VALID.test(ownerPersonId)||ownerPersonId===otherPersonId)throw Error('Eigen PersonId is nog niet beschikbaar of ongeldig.');
  const document={schema:'log.connection.v1',version:1,connectionId,fromPersonId:ownerPersonId,toPersonId:otherPersonId,confirmations:{[ownerPersonId]:true,[otherPersonId]:false},status:'pending',renewedFrom:existing?.connectionId||null,createdAt:now,updatedAt:now};
  const payload=await encrypt(document,connectionId),remote=await api('POST','',{action:'create',id:connectionId,ownerPersonId,memberPersonId:otherPersonId,memberToken:member,payload},ownerToken);
  const item=saveItem(connectionId,{role:'owner',otherPersonId,ownerToken,accessToken:ownerToken,revision:Number(remote.revision)||1,status:'pending_out',cache:document,createdAt:now,renewedFrom:document.renewedFrom,revoked:false});
  showRequestCode(item,person);return item;
}
async function fetchRequest(connectionId){const token=await memberToken(connectionId),remote=await api('GET',connectionId,null,token);if(remote.revoked)throw Error('Dit verbindingsverzoek is ingetrokken.');if(!remote.payload)throw Error('Het verbindingsverzoek bevat geen inhoud.');const document=await decrypt(remote.payload,connectionId);if(document?.schema!=='log.connection.v1'||document.version!==1||document.connectionId!==connectionId)throw Error('Dit is geen geldig Log-verbindingsverzoek.');return{remote,document,token};}
function targetForIncoming(document){const targetId=sessionStorage.getItem(SCAN_TARGET)||'',target=personById(targetId);if(!target)throw Error('Open eerst de betreffende persoon en kies Verbinden → Verbindingsverzoek scannen.');if(document.toPersonId!==selfId())throw Error('Dit verbindingsverzoek is voor een andere PersonId bedoeld.');const known=realPersonId(target);if(known&&known!==document.fromPersonId)throw Error('Dit verbindingsverzoek hoort niet bij deze persoon.');return target;}
async function publishIncomingDecision(item,document,status){document.status=status;document.updatedAt=new Date().toISOString();if(status==='connected'){document.confirmations=document.confirmations&&typeof document.confirmations==='object'?document.confirmations:{};document.confirmations[selfId()]=true;document.acceptedAt=document.updatedAt;}else{document.rejectedByPersonId=selfId();document.rejectedAt=document.updatedAt;}const payload=await encrypt(document,item.connectionId),remote=await api('POST','',{action:'put',id:item.connectionId,baseRevision:Number(item.revision)||0,status,payload},item.accessToken);return saveItem(item.connectionId,{...item,revision:Number(remote.revision)||Number(item.revision)+1,status:status==='connected'?'connected':'rejected',cache:document,revoked:false});}
async function acceptIncoming(item,target,document){
  const updated=await publishIncomingDecision(item,document,'connected');
  if(!realPersonId(target)||realPersonId(target)!==document.fromPersonId){if(window.LogIdentitySync?.linkContact)window.LogIdentitySync.linkContact(target.id,document.fromPersonId);else window.LogPersonIdentity?.merge?.(target.id,document.fromPersonId);}
  sessionStorage.removeItem(SCAN_TARGET);queueDecorate();return updated;
}
async function rejectIncoming(item,document){const updated=await publishIncomingDecision(item,document,'rejected');sessionStorage.removeItem(SCAN_TARGET);queueDecorate();return updated;}
function renderIncoming(panel,item,target,document){
  const host=panel.querySelector('.cards-dialog-body')||panel;host.innerHTML=`<div class="log-connection-request"><strong>${esc(target.name||'Persoon')}</strong><span>wil een Log-verbinding bevestigen</span></div><p class="cards-notice">Beide kanten moeten akkoord zijn. Accepteren koppelt de bevestigde PersonId aan deze persoon. Weigeren laat de lokale contactkaart bestaan.</p><button type="button" class="btn primary full" data-connection-accept>Verbinden</button><button type="button" class="btn secondary full" data-connection-reject>Weigeren</button><p role="status" data-connection-message></p>`;
  const message=host.querySelector('[data-connection-message]');
  host.querySelector('[data-connection-accept]').onclick=async event=>{event.currentTarget.disabled=true;message.textContent='Verbinding bevestigen…';try{await acceptIncoming(item,target,document);closeSheet();}catch(error){message.textContent=error.message;event.currentTarget.disabled=false;}};
  host.querySelector('[data-connection-reject]').onclick=async event=>{event.currentTarget.disabled=true;message.textContent='Verzoek weigeren…';try{await rejectIncoming(item,document);closeSheet();}catch(error){message.textContent=error.message;event.currentTarget.disabled=false;}};
}
async function previewRequest(value){
  const connectionId=String(value||'').trim();if(!VALID.test(connectionId)||!sessionStorage.getItem(SCAN_TARGET))return false;
  const panel=sheet('Verbindingsverzoek','<p role="status">Verbindingsverzoek controleren…</p>');if(!panel)return true;
  try{const {remote,document,token}=await fetchRequest(connectionId),target=targetForIncoming(document);const item=saveItem(connectionId,{role:'member',otherPersonId:document.fromPersonId,accessToken:token,revision:Number(remote.revision)||1,status:document.status==='connected'?'connected':document.status==='rejected'?'rejected':'pending_in',cache:document,createdAt:document.createdAt||new Date().toISOString(),revoked:false});if(document.status==='connected'){panel.querySelector('.cards-dialog-body').innerHTML='<p class="cards-notice">Deze verbinding is al bevestigd.</p>';return true;}if(document.status==='rejected'){panel.querySelector('.cards-dialog-body').innerHTML='<p class="cards-notice">Dit verbindingsverzoek is al afgewezen.</p>';return true;}renderIncoming(panel,item,target,document);}catch(error){const host=panel.querySelector('.cards-dialog-body')||panel;host.innerHTML=`<p class="cards-notice">${esc(error.message)}</p>`;}return true;
}
async function syncOne(item){
  if(!item?.connectionId||item.status==='revoked')return item;
  try{const remote=await api('GET',item.connectionId,null,item.accessToken||item.ownerToken||'');if(remote.revoked)return saveItem(item.connectionId,{status:'revoked',revoked:true,endedAt:remote.updatedAt||new Date().toISOString(),revision:Number(remote.revision)||item.revision,cache:null});if(!remote.payload||Number(remote.revision)===Number(item.revision)&&item.cache)return item;const doc=await decrypt(remote.payload,item.connectionId),status=doc.status==='connected'?'connected':doc.status==='rejected'?'rejected':item.role==='owner'?'pending_out':'pending_in';return saveItem(item.connectionId,{revision:Number(remote.revision)||item.revision,status,cache:doc,revoked:false});}catch(error){if(error.status===404||error.status===410)return saveItem(item.connectionId,{status:'revoked',revoked:true,endedAt:new Date().toISOString()});return item;}
}
async function syncAll(){for(const item of Object.values(state().items)){if(item.status!=='revoked')await syncOne(item);}queueDecorate();}
async function revoke(item){if(!item?.connectionId)return;if(!confirm('Verbinding verbreken? De lokale contactkaart en historische registraties blijven behouden. Voor opnieuw verbinden wordt later een nieuwe ConnectionId gemaakt.'))return;const remote=await api('POST','',{action:'revoke',id:item.connectionId},item.accessToken||item.ownerToken||'');saveItem(item.connectionId,{status:'revoked',revoked:true,endedAt:remote.updatedAt||new Date().toISOString(),revision:Number(remote.revision)||Number(item.revision)+1,cache:null});}

function ensureScript(src,key){return new Promise((resolve,reject)=>{const existing=[...document.scripts].find(script=>script.dataset[key]==='1');if(existing){if(existing.dataset.loaded==='1'||(key==='logConnectionCollaborationV2'&&window.LogCollaborationV2)){resolve();return;}existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',()=>reject(Error(`${src} kon niet worden geladen.`)),{once:true});return;}const script=document.createElement('script');script.src=src;script.async=false;script.dataset[key]='1';script.onload=()=>{script.dataset.loaded='1';resolve();};script.onerror=()=>reject(Error(`${src} kon niet worden geladen.`));document.head.appendChild(script);});}
function waitFor(test,timeout=5000){return new Promise((resolve,reject)=>{const start=Date.now(),tick=()=>{if(test()){resolve();return;}if(Date.now()-start>timeout){reject(Error('Samenwerkingsmodule is niet beschikbaar.'));return;}setTimeout(tick,50);};tick();});}
async function ensureCollaboration(){
  if(window.LogCollaborationV2?.createConversation&&window.LogCollaborationV2?.addParticipant)return window.LogCollaborationV2;
  if(collabPromise)return collabPromise;
  collabPromise=(async()=>{await ensureScript('./collaboration-v2.js?v=0.39-test.3-connection1','logConnectionCollaborationV2');await waitFor(()=>window.LogCollaborationV2?.createConversation);await ensureScript('./collaboration-v2-consistency.js?v=0.39-test.3-connection1','logConnectionCollaborationConsistency');await ensureScript('./collaboration-v2-multiparty.js?v=0.39-test.3-connection1','logConnectionCollaborationMultiparty');await waitFor(()=>window.LogCollaborationV2?.addParticipant);await ensureScript('./collaboration-v2-awareness.js?v=0.39-test.3-connection1','logConnectionCollaborationAwareness');return window.LogCollaborationV2;})();
  try{return await collabPromise;}finally{collabPromise=null;}
}
function showCollaborationInvites(title,rows){
  const panel=sheet(title,`<p class="cards-notice">Iedere deelnemer krijgt een eigen uitnodiging. De gespreksinhoud blijft één gedeelde versleutelde ConversationId.</p><div class="log-connection-invites">${rows.map((row,index)=>`<details${index===0?' open':''}><summary>${esc(row.name)}</summary><div class="log-connection-qr small">${qrSvg(row.code,4)}</div><button type="button" class="btn secondary full" data-chat-copy="${index}">Uitnodiging kopiëren</button></details>`).join('')}</div><p role="status" data-chat-status></p>`);if(!panel)return;const status=panel.querySelector('[data-chat-status]');panel.querySelectorAll('[data-chat-copy]').forEach(button=>button.onclick=async()=>{status.textContent=await copy(rows[Number(button.dataset.chatCopy)]?.code||'')?'Uitnodiging gekopieerd.':'Kopiëren wordt niet ondersteund.';});
}
async function startChat(localId){
  const person=personById(localId);
  if(!person||!isConnected(person.id))throw Error('Een chat kan pas na wederzijdse bevestiging van de persoonsverbinding.');
  if(window.LogPersonChat?.open)return window.LogPersonChat.open(person.id);
  if(window.LogConnectionChat?.open)return window.LogConnectionChat.open(person.id);
  await ensureScript('./connection-chat.js?v=0.40.7','logConnectionDirectChat');
  await waitFor(()=>window.LogConnectionChat?.open,5000);
  return window.LogConnectionChat.open(person.id);
}
function connectedPeople(){return timeData().colleagues.filter(person=>String(person.id)!==selfId()&&isConnected(person.id));}
function groupChatPicker(preselectedId){
  const people=connectedPeople();if(people.length<2){sheet('Groepschat','<p class="cards-notice">Voor een groepschat heb je minimaal twee bevestigde persoonsverbindingen nodig.</p>');return;}
  const panel=sheet('Groepschat starten',`<p class="cards-notice">Kies de bevestigde verbindingen die aan dit gesprek deelnemen.</p><div class="log-connection-group-list">${people.map(person=>`<label><input type="checkbox" value="${esc(person.id)}"${String(person.id)===String(preselectedId)?' checked':''}><span>${esc(person.name)}</span></label>`).join('')}</div><button type="button" class="btn primary full" data-group-chat-create>Gesprek maken</button><p role="status" data-group-chat-status></p>`);if(!panel)return;const status=panel.querySelector('[data-group-chat-status]');panel.querySelector('[data-group-chat-create]').onclick=async event=>{const ids=[...panel.querySelectorAll('.log-connection-group-list input:checked')].map(input=>input.value);if(ids.length<2){status.textContent='Kies minimaal twee andere personen.';return;}event.currentTarget.disabled=true;status.textContent='Groepsgesprek maken…';try{const api=await ensureCollaboration(),first=personById(ids[0]),result=await api.createConversation(first.id),rows=[{name:first.name,code:result.code}];for(const id of ids.slice(1)){const person=personById(id),invite=await api.addParticipant(result.alias,person.id);rows.push({name:person.name,code:invite.code});}closeSheet();showCollaborationInvites('Groepschat uitnodigen',rows);}catch(error){status.textContent=error.message;event.currentTarget.disabled=false;}};
}
function installLazyCollabScanBridge(){
  const code=window.LogCode,dispatcher=window.LogScanDispatcher;if(!code?.parse||!code?.preview||!dispatcher?.classify){if(scanPatchAttempts++<200)setTimeout(installScanBridges,50);return;}
  if(!code.parse.__connectionLazyCollab){const oldParse=code.parse.bind(code),parse=value=>SHARE_INVITE.test(String(value||'').trim())?{kind:'log-collaboration-invite',version:2,code:String(value).trim()}:oldParse(value);parse.__connectionLazyCollab=true;code.parse=parse;const oldPreview=code.preview.bind(code),preview=payload=>{if(payload?.kind!=='log-collaboration-invite')return oldPreview(payload);ensureCollaboration().then(api=>api.showInvitePreview(payload.code)).catch(error=>sheet('Samenwerking',`<p class="cards-notice">${esc(error.message)}</p>`));return true;};preview.__connectionLazyCollab=true;code.preview=preview;}
  if(!dispatcher.classify.__connectionLazyCollab){const old=dispatcher.classify.bind(dispatcher),classify=value=>SHARE_INVITE.test(String(value||'').trim())?{kind:'payload',payload:{kind:'log-collaboration-invite',version:2,code:String(value).trim()},value:String(value)}:old(value);classify.__connectionLazyCollab=true;dispatcher.classify=classify;}
}
function installConnectionScanBridge(){
  const code=window.LogCode,dispatcher=window.LogScanDispatcher;if(!code?.parse||!code?.preview||!dispatcher?.classify){if(scanPatchAttempts++<200)setTimeout(installScanBridges,50);return;}
  if(!code.parse.__personConnection){const oldParse=code.parse.bind(code),parse=value=>{const text=String(value||'').trim();return sessionStorage.getItem(SCAN_TARGET)&&VALID.test(text)?{kind:'log-person-connection-request',version:1,code:text}:oldParse(value);};parse.__personConnection=true;code.parse=parse;const oldPreview=code.preview.bind(code),preview=payload=>payload?.kind==='log-person-connection-request'?(previewRequest(payload.code),true):oldPreview(payload);preview.__personConnection=true;code.preview=preview;}
  if(!dispatcher.classify.__personConnection){const old=dispatcher.classify.bind(dispatcher),classify=value=>{const text=String(value||'').trim();return sessionStorage.getItem(SCAN_TARGET)&&VALID.test(text)?{kind:'payload',payload:{kind:'log-person-connection-request',version:1,code:text},value:text}:old(value);};classify.__personConnection=true;dispatcher.classify=classify;}
}
function installScanBridges(){installConnectionScanBridge();installLazyCollabScanBridge();}

function incomingFromItem(item,person){const doc=item?.cache;if(!doc)return;const panel=sheet('Verbindingsverzoek','<p role="status">Verbindingsverzoek openen…</p>');if(panel)renderIncoming(panel,item,person,doc);}
function showConnection(localId){
  const person=personById(localId);if(!person)return;const current=currentForPerson(person.id),status=current?.status||'none',identity=realPersonId(person);let body=`<div class="log-connection-heading"><strong>${esc(person.name)}</strong><span>${esc(statusText(status))}</span></div>`;
  if(status==='connected')body+=`<p class="cards-notice">Deze persoonsverbinding is bevestigd. De één-op-éénchat hoort direct bij deze verbinding en is meteen beschikbaar.</p><button type="button" class="btn primary full" data-connection-chat>Chat</button><button type="button" class="btn secondary full" data-connection-group>Groepschat starten</button><button type="button" class="log-connection-danger" data-connection-revoke>Verbinding verbreken</button>`;
  else if(status==='pending_out')body+=`<p class="cards-notice">Jij hebt dit verzoek bevestigd. De andere persoon moet de 12-teken ConnectionId nog scannen en accepteren.</p><button type="button" class="btn primary full" data-connection-show-request>Verzoek tonen</button><button type="button" class="log-connection-danger" data-connection-revoke>Verzoek intrekken</button>`;
  else if(status==='pending_in')body+=`<p class="cards-notice">Deze persoon wacht op jouw bevestiging.</p><button type="button" class="btn primary full" data-connection-confirm>Verzoek bekijken</button>`;
  else{body+=`<p class="cards-notice">${identity?'De PersonId is bekend, maar er is nog geen wederzijds bevestigde verbinding.':'Deze persoon is nog voorlopig. Je kunt eerst de persoonskaart scannen, of een ontvangen verbindingsverzoek scannen.'}</p><button type="button" class="btn primary full" data-connection-create>${identity?(status==='revoked'||status==='rejected'?'Opnieuw verbinden':'Verbindingsverzoek maken'):'Persoonskaart scannen en verbinden'}</button><button type="button" class="btn secondary full" data-connection-scan>Verbindingsverzoek scannen</button>`;}
  body+='<p role="status" data-connection-message></p>';const panel=sheet('Persoonsverbinding',body);if(!panel)return;const message=panel.querySelector('[data-connection-message]');
  panel.querySelector('[data-connection-create]')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;message.textContent=identity?'Verbindingsverzoek maken…':'Persoonskaart openen…';try{if(identity)await createRequest(person.id);else openPersonCardScanner(person.id);}catch(error){message.textContent=error.message;event.currentTarget.disabled=false;}});
  panel.querySelector('[data-connection-scan]')?.addEventListener('click',()=>openConnectionScanner(person.id));
  panel.querySelector('[data-connection-show-request]')?.addEventListener('click',()=>showRequestCode(current,person));
  panel.querySelector('[data-connection-confirm]')?.addEventListener('click',()=>incomingFromItem(current,person));
  panel.querySelector('[data-connection-revoke]')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await revoke(current);closeSheet();}catch(error){message.textContent=error.message;event.currentTarget.disabled=false;}});
  panel.querySelector('[data-connection-chat]')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;message.textContent='Chat openen…';try{await startChat(person.id);}catch(error){message.textContent=error.message;event.currentTarget.disabled=false;}});
  panel.querySelector('[data-connection-group]')?.addEventListener('click',()=>groupChatPicker(person.id));
}
function shareOwn(){if(window.LogPeoplePersonCardNetworkFix?.show){window.LogPeoplePersonCardNetworkFix.show();return;}window.LogPeopleModule?.showOwnPersonCard?.();}
function closeSwipe(row){if(!row)return;row.classList.remove('actions-open');const surface=row.querySelector('.code-card-surface'),actions=row.querySelector('.code-card-actions');if(surface)surface.style.transform='';if(actions){actions.setAttribute('inert','');actions.setAttribute('aria-hidden','true');}}
function dotClass(status){return status==='connected'?'connected':status==='pending_out'?'pending-out':status==='pending_in'?'pending-in':'';}
function decoratePeople(){
  decorateQueued=false;const module=document.querySelector('.people-module');if(!module)return;
  for(const row of module.querySelectorAll('[data-person-row]')){
    const open=row.querySelector('[data-person-open]'),actions=row.querySelector('.code-card-actions'),surface=row.querySelector('.code-card-surface');if(!open||!actions||!surface)continue;
    const localId=String(open.dataset.personOpen||''),self=open.hasAttribute('data-person-self'),status=self?'self':statusForLocal(localId).key;
    let action=actions.querySelector('[data-person-connection-swipe]');if(!action){action=document.createElement('button');action.type='button';action.dataset.personConnectionSwipe=localId;actions.prepend(action);}action.dataset.personConnectionSwipe=localId;action.dataset.connectionSelf=self?'1':'0';action.className=`log-person-connection-action ${self?'share':status.replace('_','-')}`;action.textContent=self?'Delen':actionText(status);row.style.setProperty('--card-action-count',String(actions.children.length));
    let dot=surface.querySelector('.log-person-connection-dot');if(!dot){dot=document.createElement('span');dot.className='log-person-connection-dot';dot.setAttribute('aria-hidden','true');surface.appendChild(dot);}dot.className=`log-person-connection-dot ${self?'':dotClass(status)}`;dot.hidden=self||!dotClass(status);
  }
  if(!peopleObserver){const host=module.parentElement;if(host){peopleObserver=new MutationObserver(queueDecorate);peopleObserver.observe(host,{childList:true,subtree:true});}}
}
function queueDecorate(){if(decorateQueued)return;decorateQueued=true;requestAnimationFrame(decoratePeople);}
function installStyles(){if(document.getElementById('logPersonConnectionsStyles'))return;const style=document.createElement('style');style.id='logPersonConnectionsStyles';style.textContent=`
  .code-card-surface{position:relative}.log-person-connection-dot{position:absolute;z-index:4;left:8px;top:8px;width:8px;height:8px;border-radius:50%;pointer-events:none;box-shadow:0 0 0 2px var(--card,#fff)}.log-person-connection-dot.connected{background:#34c759}.log-person-connection-dot.pending-in{background:#ff9f0a}.log-person-connection-dot.pending-out{background:#8aa89a;animation:logConnectionPulse 1.55s ease-in-out infinite}.log-person-connection-dot[hidden]{display:none!important}@keyframes logConnectionPulse{0%,100%{opacity:.42;transform:scale(.88)}50%{opacity:1;transform:scale(1.14)}}
  .code-card-actions .log-person-connection-action{background:#198754!important}.code-card-actions .log-person-connection-action.pending-in{background:#b86a00!important}.code-card-actions .log-person-connection-action.pending-out{background:#607d70!important}.code-card-actions .log-person-connection-action.revoked,.code-card-actions .log-person-connection-action.rejected{background:#2869b6!important}
  .log-connection-qr{display:grid;place-items:center;max-width:300px;margin:8px auto 12px;padding:8px;background:#fff;border-radius:14px}.log-connection-qr.small{max-width:230px}.log-connection-qr svg{width:100%;height:auto}.log-connection-code{display:grid;place-items:center;gap:3px;margin:8px 0 14px}.log-connection-code small{font-size:10px;color:var(--muted)}.log-connection-code strong{font:700 19px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.08em}.log-connection-heading,.log-connection-request{display:grid;gap:3px;margin-bottom:12px}.log-connection-heading strong,.log-connection-request strong{font-size:18px}.log-connection-heading span,.log-connection-request span{font-size:12px;color:var(--muted)}.log-connection-danger{width:100%;padding:11px;border:0;background:transparent;color:var(--bad,#ff6767);font-weight:750}.log-connection-group-list{display:grid;gap:8px;margin:12px 0}.log-connection-group-list label{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:12px}.log-connection-group-list input{width:20px;height:20px}.log-connection-invites details{padding:8px 0;border-bottom:1px solid var(--line)}
`;document.head.appendChild(style);}
function onConnectionSwipe(event){const button=event.target.closest?.('[data-person-connection-swipe]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();const row=button.closest('[data-person-row]');closeSwipe(row);if(button.dataset.connectionSelf==='1'){shareOwn();return;}showConnection(button.dataset.personConnectionSwipe);}
function onPersonMerged(event){const from=String(event.detail?.from||''),to=String(event.detail?.to||''),pending=sessionStorage.getItem(AFTER_PERSON_LINK)||'';if(!pending||pending!==from)return;sessionStorage.removeItem(AFTER_PERSON_LINK);setTimeout(()=>createRequest(to).catch(error=>sheet('Verbinden',`<p class="cards-notice">${esc(error.message)}</p>`)),120);}
function install(){installStyles();installScanBridges();document.addEventListener('click',onConnectionSwipe,true);['log-time-state-change','log-person-connections-change','log-shell-view-refresh','pageshow'].forEach(name=>window.addEventListener(name,queueDecorate));window.addEventListener('log-person-id-merged',onPersonMerged);window.addEventListener('online',()=>syncAll().catch(()=>{}));queueDecorate();setTimeout(()=>syncAll().catch(()=>{}),900);syncTimer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)syncAll().catch(()=>{});},60000);window.LogPersonConnections={state,statusForLocal,currentForPerson,isConnected,createRequest,previewRequest,show:showConnection,syncAll,revoke,startChat,groupChat:groupChatPicker};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
