(function(){
'use strict';

const BUILD='0.39-test.7';
const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-person-connections-v1';
const ENDPOINT='https://sharon.life/log/api/connections.php';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const REQUEST_TIMEOUT_MS=10000;
let busy=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function timeData(){const value=read(TIME,{});return{...value,settings:value.settings||{},colleagues:Array.isArray(value.colleagues)?value.colleagues:[]};}
function state(){const value=read(STORE,{});return{version:1,items:value.items&&typeof value.items==='object'?value.items:{}};}
function saveItem(id,patch){const value=state(),previous=value.items[id]||{};value.items[id]={...previous,...patch,connectionId:id,updatedAt:new Date().toISOString()};write(STORE,value);window.dispatchEvent(new CustomEvent('log-person-connections-change'));return value.items[id];}
function personById(id){return timeData().colleagues.find(person=>String(person.id)===String(id))||null;}
function selfId(){return String(window.LogIdentitySync?.personId?.()||timeData().settings.selfPersonId||'');}
function selfProfile(){const data=timeData(),id=String(data.settings.selfPersonId||''),person=data.colleagues.find(row=>String(row.id)===id)||{};return{displayName:String(person.name||'Log-gebruiker').trim().slice(0,120),organization:String(person.organization||'').trim().slice(0,160)};}
function currentForLocal(localId){const person=personById(localId),ids=new Set([String(localId||''),String(person?.id||''),String(person?.logPersonId||'')].filter(Boolean));return Object.values(state().items).filter(item=>ids.has(String(item?.otherPersonId||''))||ids.has(String(item?.pendingLocalId||''))||ids.has(String(item?.linkedLocalId||''))).sort((a,b)=>String(b?.updatedAt||b?.createdAt||'').localeCompare(String(a?.updatedAt||a?.createdAt||''))).find(item=>['connected','pending_out','pending_in'].includes(String(item?.status||''))&&!item?.revoked)||null;}
function randomId(){const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);return Array.from(bytes,b=>ALPHABET[b&63]).join('');}
function randomBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes;}
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
async function digestBytes(text){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));}
async function memberToken(connectionId){return b64url(await digestBytes(`log.connection.member.v1:${connectionId}`));}
async function contentSecret(connectionId){return b64url(await digestBytes(`log.connection.content.v1:${connectionId}`));}
async function importSecret(secret){return crypto.subtle.importKey('raw',fromB64url(secret),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encrypt(value,connectionId){const key=await importSecret(await contentSecret(connectionId)),iv=randomBytes(12),plain=new TextEncoder().encode(JSON.stringify(value)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{v:1,alg:'A256GCM',iv:b64url(iv),data:b64url(data)};}
function sheet(title,body){return window.LogCardsUI?.sheet?.(title,body)||null;}
function qrSvg(value){if(typeof window.qrcode!=='function')return'';try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(String(value),'Byte');qr.make();return qr.createSvgTag({cellSize:6,margin:16,scalable:true});}catch(_){return'';}}
async function copy(value){try{await navigator.clipboard.writeText(String(value));return true;}catch(_){return false;}}
function closeSwipe(row){if(!row)return;row.classList.remove('actions-open');const surface=row.querySelector('.code-card-surface'),actions=row.querySelector('.code-card-actions');if(surface)surface.style.transform='';if(actions){actions.setAttribute('inert','');actions.setAttribute('aria-hidden','true');}}
function panelBody(panel){return panel?.querySelector?.('.cards-dialog-body')||panel||null;}
function renderOutgoing(panel,item,person){
  if(!VALID.test(String(item?.connectionId||'')))return;
  const id=String(item.connectionId),body=panelBody(panel)||panelBody(sheet('Verbinden',''));
  if(!body)return;
  body.innerHTML=`<div class="log-oneqr-profile"><strong>${esc(person?.name||'Persoon')}</strong><span>één QR · één bevestiging</span></div><div class="log-oneqr-qr" data-bare-identifier="${esc(id)}">${qrSvg(id)}</div><div class="log-oneqr-code"><small>Verbindingscode</small><strong>${esc(id)}</strong></div><p class="cards-notice">Laat de andere persoon deze 12-teken QR één keer scannen in Log en bevestigen. Daarna is de persoonsverbinding actief.</p><button type="button" class="btn secondary full" data-startfix-copy>12-teken code kopiëren</button><p role="status" data-startfix-status></p>`;
  const status=body.querySelector('[data-startfix-status]');
  body.querySelector('[data-startfix-copy]')?.addEventListener('click',async()=>{if(status)status.textContent=await copy(id)?'12-teken verbindingscode gekopieerd.':'Kopiëren wordt op dit apparaat niet ondersteund.';});
}
async function apiCreate(body,token){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const response=await fetch(ENDPOINT,{method:'POST',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json','Content-Type':'application/json','X-Log-Access-Token':token},body:JSON.stringify(body)});
    let result={};try{result=await response.json();}catch(_){}
    if(!response.ok){const error=Error(result.error||`Verbindingsserver reageerde met ${response.status}.`);error.status=response.status;throw error;}
    return result;
  }catch(error){
    if(error?.name==='AbortError')throw Error('De verbindingsserver reageert te langzaam. Probeer opnieuw.');
    if(error?.status)throw error;
    throw Error('De verbindingsserver is niet bereikbaar.');
  }finally{clearTimeout(timer);}
}
async function createRequest(localId,panel){
  const person=personById(localId);if(!person)throw Error('Persoon niet gevonden.');
  const existing=currentForLocal(localId);if(existing){renderOutgoing(panel,existing,person);return existing;}
  const ownerPersonId=selfId();if(!VALID.test(ownerPersonId))throw Error('Eigen PersonId is nog niet beschikbaar. Open Mijn Log één keer en probeer opnieuw.');
  const connectionId=randomId(),ownerToken=b64url(randomBytes(32)),member=await memberToken(connectionId),now=new Date().toISOString(),profile=selfProfile();
  const document={schema:'log.connection.v1',version:1,connectionId,fromPersonId:ownerPersonId,toPersonId:null,openInvite:true,fromProfile:profile,targetHint:String(person.name||'').slice(0,120),confirmations:{[ownerPersonId]:true},status:'pending',createdAt:now,updatedAt:now};
  const payload=await encrypt(document,connectionId);
  const remote=await apiCreate({action:'create',id:connectionId,ownerPersonId,memberPersonId:'',memberToken:member,payload},ownerToken);
  const item=saveItem(connectionId,{role:'owner',otherPersonId:String(person.id),pendingLocalId:String(person.id),ownerPersonId,ownerToken,accessToken:ownerToken,revision:Number(remote.revision)||1,status:'pending_out',cache:document,createdAt:now,revoked:false,oneQr:true});
  renderOutgoing(panel,item,person);return item;
}
function showExisting(localId,item){const person=personById(localId),panel=sheet('Verbinden','<p role="status">Verbindingscode openen…</p>');renderOutgoing(panel,item,person);}
function start(localId){
  if(busy)return;
  const person=personById(localId);if(!person){sheet('Verbinden','<p class="cards-notice">Persoon niet gevonden.</p>');return;}
  const current=currentForLocal(localId);
  if(current?.status==='pending_out'){showExisting(localId,current);return;}
  busy=true;
  const panel=sheet('Verbinden',`<div class="log-oneqr-profile"><strong>${esc(person.name||'Persoon')}</strong><span>verbinding voorbereiden…</span></div><p class="cards-notice">De 12-teken verbindingscode wordt aangemaakt.</p><p role="status" data-startfix-progress>Even geduld…</p>`);
  createRequest(localId,panel).catch(error=>{const body=panelBody(panel);if(body)body.innerHTML=`<p class="cards-notice">${esc(error.message)}</p><button type="button" class="btn secondary full" data-startfix-close>Sluiten</button>`;body?.querySelector?.('[data-startfix-close]')?.addEventListener('click',()=>window.LogCardsUI?.close?.());}).finally(()=>{busy=false;});
}
function intercept(event){
  const button=event.target.closest?.('[data-person-connection-swipe]');if(!button||button.dataset.connectionSelf==='1')return;
  const localId=String(button.dataset.personConnectionSwipe||'');if(!localId)return;
  const current=currentForLocal(localId);
  if(current?.status==='connected'||current?.status==='pending_in')return;
  event.preventDefault();event.stopImmediatePropagation();closeSwipe(button.closest('[data-person-row]'));start(localId);
}
function install(){window.LOG_TEST_BUILD=BUILD;window.addEventListener('click',intercept,true);window.LogConnectionStartFix={start,currentForLocal,showExisting};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
