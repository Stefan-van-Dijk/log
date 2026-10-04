(function(){
'use strict';

const CONNECTION_ENDPOINT='https://sharon.life/log/api/connections.php';
const SYNC_ENDPOINT='https://sharon.life/log/api/sync.php';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let attempts=0;
let basePreview=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
async function memberToken(id){const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`log.connection.member.v1:${id}`)));return b64url(digest);}
async function personKey(id){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`log-person-v1:${id}`));return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['decrypt']);}
async function decryptPersonPayload(envelope,id){
  if(Number(envelope?.v)!==2||!envelope?.iv||!envelope?.data)throw Error('Onbekende persoonskaartversleuteling.');
  try{
    const key=await personKey(id),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(envelope.iv)},key,fromB64url(envelope.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }catch(_){throw Error('De persoonskaart kan niet met deze code worden geopend.');}
}
async function fetchJson(url,options={}){
  let response;
  try{response=await fetch(url,{cache:'no-store',...options});}
  catch(error){error.identifierNetwork=true;throw error;}
  let result={};try{result=await response.json();}catch(_){}
  return{response,result};
}
async function probeConnection(id){
  if(!VALID.test(String(id||'')))return null;
  const token=await memberToken(id),{response,result}=await fetchJson(`${CONNECTION_ENDPOINT}?id=${encodeURIComponent(id)}`,{method:'GET',headers:{Accept:'application/json','X-Log-Access-Token':token}});
  if(response.status===404||response.status===403)return null;
  if(!response.ok){const error=Error(result.error||`Verbindingsserver reageerde met ${response.status}.`);error.status=response.status;throw error;}
  return String(result.connectionId||'')===String(id)?result:null;
}
async function probePersonCard(id){
  if(!VALID.test(String(id||'')))return null;
  const {response,result}=await fetchJson(`${SYNC_ENDPOINT}?id=${encodeURIComponent(id)}`,{method:'GET',headers:{Accept:'application/json'}});
  if(response.status===404)return null;
  if(!response.ok){const error=Error(result.error||`Synchronisatieserver reageerde met ${response.status}.`);error.status=response.status;throw error;}
  if(result.revoked||result.offline||!result.active||result.kind!=='collaboration'||!result.payload)return null;
  const document=await decryptPersonPayload(result.payload,id);
  if(document?.schema!=='log.person-card.v2'||document.version!==2||!VALID.test(String(document.personId||'')))return null;
  return{remote:result,document};
}
function locallyConfiguredAction(id){
  try{return !!window.LogLocationActions?.snapshot?.().rules?.some(rule=>String(rule?.logCodeId||'')===String(id));}catch(_){return false;}
}
function normalized(value){return String(value||'').trim().toLocaleLowerCase('nl-NL').replace(/\s+/g,' ');}
function timePeople(){try{const raw=JSON.parse(localStorage.getItem('urenregistratie.test.pwa.v1')||'{}');return Array.isArray(raw.colleagues)?raw.colleagues:[];}catch(_){return[];}}
function existingPersonFor(document){
  const personId=String(document.personId||''),people=timePeople();
  const linked=people.find(person=>String(person.id)===personId||String(person.logPersonId||'')===personId);if(linked)return linked;
  const name=normalized(document.displayName),matches=people.filter(person=>person.identityStatus!=='self'&&person.identityStatus!=='linked'&&normalized(person.name)===name);
  return matches.length===1?matches[0]:null;
}
function linkPerson(localId,personId){
  if(window.LogIdentitySync?.linkContact)return window.LogIdentitySync.linkContact(localId,personId);
  if(window.LogPersonIdentity?.merge)return window.LogPersonIdentity.merge(localId,personId);
  throw Error('De persoonsidentiteit kan nog niet worden gekoppeld.');
}
function savePersonFromCard(document){
  let person=existingPersonFor(document);
  if(!person){
    if(!window.LogPeopleModule?.save)throw Error('Personen is nog niet beschikbaar.');
    person=window.LogPeopleModule.save('',{name:String(document.displayName||'Nieuwe persoon').slice(0,120),relationship:'',organization:String(document.organization||'').slice(0,160),email:'',phone:'',note:'',color:'#4da3ff'},false);
  }
  linkPerson(person.id,String(document.personId));
  const refreshed=timePeople().find(row=>String(row.id)===String(document.personId)||String(row.logPersonId||'')===String(document.personId));
  return refreshed||person;
}
function sheet(title,body){return window.LogCardsUI?.sheet?.(title,body)||null;}
function closeSheet(){window.LogCardsUI?.close?.();}
function showRouteError(title,message,detail=''){
  const panel=sheet(title,`<p class="cards-notice">${esc(message)}</p>${detail?`<p class="cards-notice">${esc(detail)}</p>`:''}<button type="button" class="btn secondary full" data-idroute-close>Sluiten</button>`);
  panel?.querySelector('[data-idroute-close]')?.addEventListener('click',closeSheet);
}
function showPersonCard(id,document){
  const existing=existingPersonFor(document),name=String(document.displayName||existing?.name||'Log-gebruiker'),organization=String(document.organization||existing?.organization||'');
  const panel=sheet('Persoon gevonden',`<div class="log-oneqr-profile"><strong>${esc(name)}</strong>${organization?`<span>${esc(organization)}</span>`:'<span>Log-persoonskaart</span>'}</div><p class="cards-notice">Deze 12-teken code hoort bij een persoonskaart. ${existing?'De kaart kan aan de bestaande persoon worden gekoppeld.':'Je kunt deze persoon aan Personen toevoegen.'}</p><button type="button" class="btn primary full" data-idroute-person>${existing?'Persoon koppelen':'Persoon toevoegen'}</button><button type="button" class="btn secondary full" data-idroute-cancel>Annuleren</button><p role="status" data-idroute-status></p>`);
  if(!panel)return;
  panel.querySelector('[data-idroute-cancel]').onclick=closeSheet;
  panel.querySelector('[data-idroute-person]').onclick=event=>{
    const status=panel.querySelector('[data-idroute-status]');event.currentTarget.disabled=true;
    try{const person=savePersonFromCard(document);closeSheet();setTimeout(()=>{const done=sheet('Persoon gekoppeld',`<div class="log-oneqr-profile"><strong>${esc(person?.name||name)}</strong><span>PersoonId bevestigd</span></div><p class="cards-notice">De persoonskaart is gekoppeld. Vanuit Personen kun je nu een verbindingsuitnodiging maken.</p><button type="button" class="btn primary full" data-idroute-done>Gereed</button>`);done?.querySelector('[data-idroute-done]')?.addEventListener('click',closeSheet);},60);}catch(error){status.textContent=error.message;event.currentTarget.disabled=false;}
  };
}
async function openConnection(id){
  for(let i=0;i<80;i++){
    if(window.LogOneQrConnections?.previewInvite){window.LogOneQrConnections.previewInvite(`log-connect-v2:${id}`);return true;}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw Error('De verbindingsmodule is nog niet geladen. Open Log opnieuw en probeer de code nogmaals.');
}
async function routeBareIdentifier(id,fallback,payload){
  id=String(id||'').trim();if(!VALID.test(id))return fallback(payload);
  let connectionError=null,personError=null;
  try{if(await probeConnection(id)){await openConnection(id);return true;}}catch(error){connectionError=error;console.warn('Verbindingscode controleren mislukt.',error);}
  try{const person=await probePersonCard(id);if(person){showPersonCard(id,person.document);return true;}}catch(error){personError=error;console.warn('Persoonscode controleren mislukt.',error);}
  if(connectionError?.identifierNetwork&&personError?.identifierNetwork){showRouteError('Code zoeken','De online Log-bronnen zijn niet bereikbaar.','Controleer internet of de API op sharon.life en probeer opnieuw.');return true;}
  if(connectionError&&!connectionError.identifierNetwork&&connectionError.status&&connectionError.status!==404&&connectionError.status!==403){showRouteError('Verbinding controleren',connectionError.message);return true;}
  return fallback(payload);
}
function installPreviewRouter(){
  const api=window.LogCode;
  if(!api?.preview){if(attempts++<300)setTimeout(installPreviewRouter,50);return;}
  if(api.preview.__bare12IdentifierRouter)return;
  const original=api.preview.bind(api);if(!basePreview)basePreview=original;
  const wrapped=function(payload){
    const id=payload?.kind==='log-action'&&VALID.test(String(payload.id||''))?String(payload.id):'';
    if(!id||locallyConfiguredAction(id))return original(payload);
    routeBareIdentifier(id,original,payload);return true;
  };
  wrapped.__bare12IdentifierRouter=true;wrapped.__original=original;api.preview=wrapped;
}
function qrSvg(value){
  if(typeof window.qrcode!=='function')return'';
  try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(String(value),'Byte');qr.make();return qr.createSvgTag({cellSize:6,margin:16,scalable:true});}catch(_){return'';}
}
async function copy(value){try{await navigator.clipboard.writeText(String(value));return true;}catch(_){return false;}}
function normalizeConnectionQr(scope=document){
  scope.querySelectorAll?.('.log-oneqr-code strong').forEach(strong=>{
    const id=String(strong.textContent||'').trim();if(!VALID.test(id))return;
    const panel=strong.closest('.cards-dialog')||strong.closest('dialog')||document,qr=panel.querySelector('.log-oneqr-qr');
    if(qr&&qr.dataset.bareIdentifier!==id){qr.innerHTML=qrSvg(id);qr.dataset.bareIdentifier=id;qr.setAttribute('aria-label',`Verbindingscode ${id}`);}
    const label=strong.parentElement?.querySelector('small');if(label)label.textContent='Verbindingscode';
    const button=panel.querySelector('[data-oneqr-copy]');
    if(button&&button.dataset.bareIdentifier!==id){const replacement=button.cloneNode(true);replacement.dataset.bareIdentifier=id;replacement.onclick=async()=>{const status=panel.querySelector('[data-oneqr-status]');if(status)status.textContent=await copy(id)?'12-teken verbindingscode gekopieerd.':'Kopiëren wordt op dit apparaat niet ondersteund.';};button.replaceWith(replacement);}
  });
}
function keepRouterInstalled(){
  const api=window.LogCode;if(api?.preview&&!api.preview.__bare12IdentifierRouter)installPreviewRouter();
}
function init(){
  installPreviewRouter();normalizeConnectionQr();
  new MutationObserver(records=>{for(const record of records){if(record.addedNodes.length){normalizeConnectionQr();keepRouterInstalled();break;}}}).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',()=>{installPreviewRouter();normalizeConnectionQr();});
  setInterval(keepRouterInstalled,1500);
  window.LogBareIdentifierRouter={probeConnection,probePersonCard,route:id=>routeBareIdentifier(String(id),payload=>(basePreview||window.LogCode?.preview)?.(payload),{kind:'log-action',version:1,id:String(id)})};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();