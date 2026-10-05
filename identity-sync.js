(function(){
'use strict';

const BUILD='0.39-test.3';
const KM='kmreg-test-v4-data';
const TIME='urenregistratie.test.pwa.v1';
const LEGACY_IDENTITIES='registratie-test-identiteiten-v1';
const STORE='log-test-identity-sync-v2';
const ENDPOINT='https://sharon.life/log/api/sync.php';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let mutating=false;
let mountQueued=false;

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function readJson(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function writeJson(key,value){localStorage.setItem(key,JSON.stringify(value));}
function randomId(){const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);return Array.from(bytes,b=>ALPHABET[b&63]).join('');}
function randomBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes;}
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const padded=text+'='.repeat((4-text.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function state(){const current=readJson(STORE,{});return{
  version:2,
  self:current.self&&typeof current.self==='object'?current.self:{},
  vehicle:current.vehicle&&typeof current.vehicle==='object'?current.vehicle:{},
  contacts:current.contacts&&typeof current.contacts==='object'?current.contacts:{},
  collaborations:current.collaborations&&typeof current.collaborations==='object'?current.collaborations:{},
  backup:current.backup&&typeof current.backup==='object'?current.backup:{}
};}
function saveState(value){writeJson(STORE,value);window.dispatchEvent(new CustomEvent('log-identity-sync-change'));}

function ensureSelfIdentity(){
  const s=state(),time=readJson(TIME,{}),settings=time.settings&&typeof time.settings==='object'?time.settings:{},colleagues=Array.isArray(time.colleagues)?time.colleagues:[];
  const selfLocalId=String(settings.selfPersonId||'');
  const selfPerson=colleagues.find(person=>String(person.id)===selfLocalId)||null;
  let personId=String(selfPerson?.logPersonId||s.self.personId||'');
  if(!VALID.test(personId))personId=randomId();
  let changed=false;
  if(s.self.personId!==personId){s.self={...s.self,personId,createdAt:s.self.createdAt||new Date().toISOString()};changed=true;}
  if(selfPerson&&selfPerson.logPersonId!==personId){selfPerson.logPersonId=personId;changed=true;}
  if(changed){
    if(selfPerson){time.settings=settings;time.colleagues=colleagues;writeJson(TIME,time);}
    saveState(s);
  }
  return personId;
}
function vehicleFingerprint(settings={}){return [settings.plate,settings.vehicleBrand,settings.vehicleModel].map(v=>String(v||'').trim().toLocaleLowerCase('nl')).join('|');}
function ensureVehicleIdentity(){
  const s=state(),km=readJson(KM,{});km.settings=km.settings&&typeof km.settings==='object'?km.settings:{};
  const fingerprint=vehicleFingerprint(km.settings);
  let vehicleId=String(km.settings.logVehicleId||'');
  if(!VALID.test(vehicleId)&&s.vehicle.fingerprint===fingerprint&&VALID.test(String(s.vehicle.vehicleId||'')))vehicleId=s.vehicle.vehicleId;
  if(!VALID.test(vehicleId))vehicleId=randomId();
  let changed=false;
  if(km.settings.logVehicleId!==vehicleId){km.settings.logVehicleId=vehicleId;writeJson(KM,km);changed=true;}
  if(s.vehicle.vehicleId!==vehicleId||s.vehicle.fingerprint!==fingerprint){s.vehicle={...s.vehicle,vehicleId,fingerprint,createdAt:s.vehicle.createdAt||new Date().toISOString()};changed=true;}
  if(changed)saveState(s);
  return vehicleId;
}
function personIdForLocal(localId){
  const time=readJson(TIME,{}),person=(Array.isArray(time.colleagues)?time.colleagues:[]).find(item=>String(item.id)===String(localId));
  if(person&&VALID.test(String(person.logPersonId||'')))return person.logPersonId;
  return '';
}
function validationFor(entry,participantIds){
  if(!participantIds.length)return entry.validation||undefined;
  const existing=entry.validation&&typeof entry.validation==='object'?entry.validation:{};
  const required=[...new Set([...(Array.isArray(existing.requiredFrom)?existing.requiredFrom:[]),...participantIds])].filter(VALID.test.bind(VALID));
  const accepted=(Array.isArray(existing.acceptedBy)?existing.acceptedBy:[]).filter(id=>required.includes(id));
  const rejected=(Array.isArray(existing.rejectedBy)?existing.rejectedBy:[]).filter(id=>required.includes(id));
  return{status:rejected.length?'rejected':required.every(id=>accepted.includes(id))?'accepted':'pending',requiredFrom:required,acceptedBy:accepted,rejectedBy:rejected,updatedAt:existing.updatedAt||new Date().toISOString()};
}
function tagLocalRegistrations(){
  if(mutating)return;mutating=true;
  try{
    const personId=ensureSelfIdentity(),vehicleId=ensureVehicleIdentity();
    const km=readJson(KM,{}),time=readJson(TIME,{});let kmChanged=false,timeChanged=false;
    if(Array.isArray(km.trips))for(const trip of km.trips){if(!VALID.test(String(trip.driverPersonId||''))){trip.driverPersonId=personId;kmChanged=true;}if(!VALID.test(String(trip.createdByPersonId||''))){trip.createdByPersonId=personId;kmChanged=true;}if(!VALID.test(String(trip.vehicleId||''))){trip.vehicleId=vehicleId;kmChanged=true;}}
    if(km.activeTrip&&typeof km.activeTrip==='object'){if(!VALID.test(String(km.activeTrip.driverPersonId||''))){km.activeTrip.driverPersonId=personId;kmChanged=true;}if(!VALID.test(String(km.activeTrip.createdByPersonId||''))){km.activeTrip.createdByPersonId=personId;kmChanged=true;}if(!VALID.test(String(km.activeTrip.vehicleId||''))){km.activeTrip.vehicleId=vehicleId;kmChanged=true;}}
    if(Array.isArray(km.events))for(const event of km.events){if(!VALID.test(String(event.actorPersonId||''))){event.actorPersonId=personId;kmChanged=true;}if(!VALID.test(String(event.vehicleId||''))){event.vehicleId=vehicleId;kmChanged=true;}}
    if(Array.isArray(time.entries))for(const entry of time.entries){
      if(!VALID.test(String(entry.ownerPersonId||''))){entry.ownerPersonId=personId;timeChanged=true;}
      if(!VALID.test(String(entry.createdByPersonId||''))){entry.createdByPersonId=personId;timeChanged=true;}
      const localPeople=Array.isArray(entry.people)?entry.people:[];
      const participants=[...new Set(localPeople.map(value=>typeof value==='object'?(value.personId||value.id):value).map(personIdForLocal).filter(id=>VALID.test(id)&&id!==personId))];
      const previous=JSON.stringify(entry.participantPersonIds||[]),next=JSON.stringify(participants);
      if(previous!==next){entry.participantPersonIds=participants;timeChanged=true;}
      const validation=validationFor(entry,participants);
      if(validation&&JSON.stringify(validation)!==JSON.stringify(entry.validation)){entry.validation=validation;timeChanged=true;}
    }
    if(kmChanged)writeJson(KM,km);if(timeChanged)writeJson(TIME,time);
  }finally{mutating=false;}
}
function linkContact(localPersonId,remotePersonId){
  if(!VALID.test(String(remotePersonId||'')))throw Error('PersonId moet exact 12 geldige tekens bevatten.');
  const time=readJson(TIME,{}),people=Array.isArray(time.colleagues)?time.colleagues:[],person=people.find(item=>String(item.id)===String(localPersonId));
  if(!person)throw Error('Persoon niet gevonden.');
  person.logPersonId=String(remotePersonId);writeJson(TIME,time);
  const s=state();s.contacts[String(localPersonId)]={personId:String(remotePersonId),linkedAt:new Date().toISOString()};saveState(s);tagLocalRegistrations();return person;
}
function assignEntry(entryId,remotePersonId){
  if(!VALID.test(String(remotePersonId||'')))throw Error('Ongeldige PersonId.');
  const time=readJson(TIME,{}),entry=(Array.isArray(time.entries)?time.entries:[]).find(item=>String(item.id)===String(entryId));if(!entry)throw Error('Tijdregistratie niet gevonden.');
  const self=ensureSelfIdentity(),participants=[...new Set([...(Array.isArray(entry.participantPersonIds)?entry.participantPersonIds:[]),String(remotePersonId)])].filter(id=>id!==self);
  entry.participantPersonIds=participants;entry.validation=validationFor(entry,participants);entry.validation.acceptedBy=(entry.validation.acceptedBy||[]).filter(id=>id!==remotePersonId);entry.validation.rejectedBy=(entry.validation.rejectedBy||[]).filter(id=>id!==remotePersonId);entry.validation.status='pending';entry.validation.updatedAt=new Date().toISOString();writeJson(TIME,time);window.dispatchEvent(new Event('log-time-state-change'));return entry;
}
function respondToEntry(entryId,decision){
  if(!['accept','reject'].includes(decision))throw Error('Onbekende validatiekeuze.');
  const self=ensureSelfIdentity(),time=readJson(TIME,{}),entry=(Array.isArray(time.entries)?time.entries:[]).find(item=>String(item.id)===String(entryId));if(!entry)throw Error('Tijdregistratie niet gevonden.');
  const required=Array.isArray(entry.validation?.requiredFrom)?entry.validation.requiredFrom:[];if(!required.includes(self))throw Error('Deze registratie vraagt geen validatie van jouw PersonId.');
  const accepted=new Set(Array.isArray(entry.validation.acceptedBy)?entry.validation.acceptedBy:[]),rejected=new Set(Array.isArray(entry.validation.rejectedBy)?entry.validation.rejectedBy:[]);
  accepted.delete(self);rejected.delete(self);if(decision==='accept')accepted.add(self);else rejected.add(self);
  entry.validation={...entry.validation,acceptedBy:[...accepted],rejectedBy:[...rejected],status:rejected.size?'rejected':required.every(id=>accepted.has(id))?'accepted':'pending',updatedAt:new Date().toISOString()};
  writeJson(TIME,time);window.dispatchEvent(new Event('log-time-state-change'));return entry;
}

async function deriveKey(password,salt){
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encryptJson(value,password){
  const salt=randomBytes(16),iv=randomBytes(12),key=await deriveKey(password,salt),plain=new TextEncoder().encode(JSON.stringify(value));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
  return{v:1,alg:'PBKDF2-SHA256+A256GCM',iterations:210000,salt:b64url(salt),iv:b64url(iv),data:b64url(encrypted)};
}
async function decryptJson(envelope,password){
  if(Number(envelope?.v)!==1)throw Error('Onbekende versleutelde back-upversie.');
  const salt=fromB64url(envelope.salt),iv=fromB64url(envelope.iv),cipher=fromB64url(envelope.data),key=await deriveKey(password,salt);
  try{return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,cipher)));}catch(_){throw Error('Wachtwoord is onjuist of de back-up is beschadigd.');}
}
function buildBackup(){
  tagLocalRegistrations();
  if(typeof window.buildCompleteRegistrationExport!=='function')throw Error('De complete Log-back-up is nog niet beschikbaar.');
  const bundle=window.buildCompleteRegistrationExport(new Date().toISOString());
  bundle.recovery=bundle.recovery&&typeof bundle.recovery==='object'?bundle.recovery:{};bundle.recovery.sources=bundle.recovery.sources&&typeof bundle.recovery.sources==='object'?bundle.recovery.sources:{};
  bundle.recovery.sources.identity_sync={storage_key:STORE,present:true,data:clone(state())};
  bundle.identity={personId:ensureSelfIdentity(),vehicleId:ensureVehicleIdentity()};
  return bundle;
}
async function api(method,id,body=null,token=''){
  const url=id?`${ENDPOINT}?id=${encodeURIComponent(id)}`:ENDPOINT;
  const options={method,cache:'no-store',headers:{Accept:'application/json'}};
  if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  if(token)options.headers['X-Log-Access-Token']=token;
  const response=await fetch(url,options);let result={};try{result=await response.json();}catch(_){}
  if(!response.ok)throw Error(result.error||`Synchronisatieserver reageerde met ${response.status}.`);return result;
}
async function publishBackup(password){
  if(String(password||'').length<8)throw Error('Gebruik voor de back-up een wachtwoord van minimaal 8 tekens.');
  const s=state(),id=VALID.test(String(s.backup.id||''))?s.backup.id:randomId(),token=String(s.backup.ownerToken||'')||b64url(randomBytes(32)),baseRevision=Number(s.backup.revision)||0,nextRevision=baseRevision+1;
  const bundle=buildBackup();
  const identitySource=bundle?.recovery?.sources?.identity_sync;
  if(identitySource?.data&&typeof identitySource.data==='object')identitySource.data.backup={...(identitySource.data.backup||{}),id,ownerToken:token,revision:nextRevision,updatedAt:new Date().toISOString()};
  const payload=await encryptJson(bundle,password),result=await api('POST','',{action:'put',id,kind:'person-backup',baseRevision,ownerPersonId:ensureSelfIdentity(),payload},token);
  s.backup={id,ownerToken:token,revision:Number(result.revision)||nextRevision,updatedAt:result.updatedAt||new Date().toISOString()};saveState(s);return{...s.backup,code:id};
}
async function fetchBackup(id,password){
  if(!VALID.test(String(id||'')))throw Error('Herstelcode moet exact 12 geldige tekens bevatten.');
  const remote=await api('GET',String(id));if(remote.revoked)throw Error('Deze back-up is ingetrokken.');if(remote.offline||!remote.payload)throw Error('Deze back-up staat momenteel niet online.');
  return decryptJson(remote.payload,password);
}
async function restoreBackup(id,password){
  const bundle=await fetchBackup(id,password),sources=bundle?.recovery?.sources;if(!sources||typeof sources!=='object')throw Error('De back-up bevat geen herstelgegevens.');
  if(!window.LogBackupHost?.restore||!window.LogBackupState?.plan)throw Error('De veilige herstelroute ontbreekt. Vernieuw Log voordat je herstelt.');
  const prepared=window.LogBackupState.plan(bundle);
  if(!confirm(`Je huidige Log-gegevens vervangen door deze online back-up? Bewaar eerst een lokale back-up. ${prepared.hasAdditional?'Ook aanvullende gegevens worden teruggezet.':'Dit is een oudere back-up; ontbrekende aanvullende gegevens blijven behouden.'} Online rechten kunnen inmiddels zijn gewijzigd.`))throw Error('Herstel geannuleerd; je gegevens zijn ongewijzigd.');
  await window.LogBackupHost.restore(bundle);return bundle;
}
async function setBackupOffline(){const s=state();if(!VALID.test(String(s.backup.id||''))||!s.backup.ownerToken)throw Error('Er is op dit apparaat nog geen beheerde online back-up.');return api('POST','',{action:'offline',id:s.backup.id},s.backup.ownerToken);}
async function revokeBackup(){const s=state();if(!VALID.test(String(s.backup.id||''))||!s.backup.ownerToken)throw Error('Er is op dit apparaat nog geen beheerde online back-up.');const result=await api('POST','',{action:'revoke',id:s.backup.id},s.backup.ownerToken);s.backup={...s.backup,revoked:true,revokedAt:new Date().toISOString()};saveState(s);return result;}

function dialog(title,body){const ui=window.LogCardsUI;if(ui?.sheet)return ui.sheet(title,body);const d=document.createElement('dialog');d.className='log-identity-dialog';d.innerHTML=`<header><strong>${esc(title)}</strong><button type="button" data-id-close>×</button></header><div>${body}</div>`;document.body.appendChild(d);d.querySelector('[data-id-close]').onclick=()=>d.remove();d.showModal();return d;}
function askPassword(title='Back-upwachtwoord'){const value=prompt(`${title}\n\nMinimaal 8 tekens. Het wachtwoord wordt niet online opgeslagen.`,'');return value===null?'':String(value);}
function showIdentity(){
  const personId=ensureSelfIdentity(),vehicleId=ensureVehicleIdentity(),s=state(),backup=VALID.test(String(s.backup.id||''))?s.backup.id:'';
  const panel=dialog('Mijn Log',`<div class="log-identity-card"><span>PersonId</span><strong>${esc(personId)}</strong><span>VehicleId</span><strong>${esc(vehicleId)}</strong>${backup?`<span>Herstelcode</span><strong>${esc(backup)}</strong>`:''}</div><p class="cards-notice">De zichtbare codes zijn identiteiten/aliassen, geen wachtwoorden. Rechten worden apart gecontroleerd.</p><div class="log-identity-actions"><button type="button" class="btn full" data-id-backup>${backup?'Back-up bijwerken':'Versleutelde back-up maken'}</button><button type="button" class="btn secondary full" data-id-restore>Mijn Log herstellen</button>${backup?'<button type="button" class="btn secondary full" data-id-offline>Online back-up tijdelijk verwijderen</button>':''}</div><p role="status" data-id-status></p>`);
  const status=panel.querySelector('[data-id-status]');
  panel.querySelector('[data-id-backup]').onclick=async event=>{const password=askPassword();if(!password)return;event.currentTarget.disabled=true;status.textContent='Back-up versleutelen en publiceren…';try{const result=await publishBackup(password);status.textContent=`Back-up gepubliceerd · revisie ${result.revision} · herstelcode ${result.code}`;}catch(error){status.textContent=error.message;}finally{event.currentTarget.disabled=false;}};
  panel.querySelector('[data-id-restore]').onclick=async event=>{const code=prompt('Herstelcode (12 tekens):','')||'';if(!code)return;const password=askPassword('Wachtwoord van de back-up');if(!password)return;event.currentTarget.disabled=true;status.textContent='Back-up ophalen en herstellen…';try{await restoreBackup(code.trim(),password);status.textContent='Hersteld. Log wordt opnieuw geladen.';setTimeout(()=>location.reload(),350);}catch(error){status.textContent=error.message;event.currentTarget.disabled=false;}};
  const offline=panel.querySelector('[data-id-offline]');if(offline)offline.onclick=async()=>{offline.disabled=true;try{await setBackupOffline();status.textContent='De versleutelde payload is online verwijderd. De herstelcode blijft gereserveerd.';}catch(error){status.textContent=error.message;offline.disabled=false;}};
}
function settingsMarkup(){const personId=ensureSelfIdentity(),vehicleId=ensureVehicleIdentity(),backup=state().backup;return `<details class="km-shell-settings-accordion" id="kmShellIdentitySync"><summary><span class="km-shell-settings-accordion-title"><strong>Mijn Log & samenwerking</strong><small>Persoon ${esc(personId)} · auto ${esc(vehicleId)}</small></span><span class="km-shell-settings-accordion-arrow">›</span></summary><div class="km-shell-settings-accordion-body"><p class="cards-notice">Vaste identiteit voor back-up, takenvalidatie en gedeeld autogebruik.</p><button type="button" class="btn secondary full" data-log-identity-open>${VALID.test(String(backup.id||''))?'Back-up en identiteit beheren':'Identiteit en back-up openen'}</button></div></details>`;}
function mountSettings(){mountQueued=false;tagLocalRegistrations();const title=document.querySelector('#kmShellAppSettingsTitle'),group=title?.closest('.km-shell-settings-group');if(group&&!group.querySelector('#kmShellIdentitySync')){group.insertAdjacentHTML('beforeend',settingsMarkup());group.querySelector('[data-log-identity-open]').onclick=showIdentity;}}
function queueMount(){if(mountQueued)return;mountQueued=true;requestAnimationFrame(mountSettings);}
function installStyles(){if(document.getElementById('logIdentitySyncStyles'))return;const style=document.createElement('style');style.id='logIdentitySyncStyles';style.textContent=`.log-identity-card{display:grid;grid-template-columns:auto 1fr;gap:7px 12px;align-items:center;margin:8px 0 14px;padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--card2)}.log-identity-card span{font-size:11px;color:var(--muted)}.log-identity-card strong{font-family:"SFMono-Regular",Consolas,monospace;font-size:12px;text-align:right;overflow-wrap:anywhere}.log-identity-actions{display:grid;gap:8px}.log-identity-dialog{max-width:520px;width:calc(100% - 32px);border:1px solid var(--line);border-radius:18px;background:var(--card);color:var(--text);padding:16px}.log-identity-dialog::backdrop{background:rgba(0,0,0,.5)}.log-identity-dialog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.log-identity-dialog header button{border:0;background:transparent;color:var(--text);font-size:24px}`;document.head.appendChild(style);}
function init(){window.LOG_TEST_BUILD=BUILD;installStyles();tagLocalRegistrations();queueMount();new MutationObserver(queueMount).observe(document.documentElement,{childList:true,subtree:true});['log-time-state-change','log-km-state-change','pageshow'].forEach(name=>window.addEventListener(name,()=>{tagLocalRegistrations();queueMount();}));window.LogIdentitySync={personId:ensureSelfIdentity,vehicleId:ensureVehicleIdentity,linkContact,assignEntry,respondToEntry,tagLocalRegistrations,buildBackup,publishBackup,fetchBackup,restoreBackup,setBackupOffline,revokeBackup,state};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
