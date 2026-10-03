(function(){
'use strict';

const TIME='urenregistratie.test.pwa.v1';
const AFTER_PERSON_LINK='log-person-connect-after-link';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let running=false;
let scheduled=false;
let lastError='';
let lastErrorAt=0;

function readTime(){
  try{
    const value=JSON.parse(localStorage.getItem(TIME)||'{}');
    return {...value,colleagues:Array.isArray(value.colleagues)?value.colleagues:[]};
  }catch(_){return{colleagues:[]};}
}
function resolve(id){
  const value=String(id||'');
  try{return String(window.LogPersonIdentity?.resolve?.(value)||value);}catch(_){return value;}
}
function findPerson(pending){
  const resolved=resolve(pending),people=readTime().colleagues;
  return people.find(person=>String(person?.id||'')===resolved)
    ||people.find(person=>String(person?.id||'')===String(pending))
    ||people.find(person=>String(person?.logPersonId||'')===resolved)
    ||people.find(person=>Array.isArray(person?.personIdAliases)&&person.personIdAliases.map(String).includes(String(pending)))
    ||null;
}
function confirmedPersonId(person){
  if(!person)return'';
  const id=String(person.id||''),remote=String(person.logPersonId||'');
  if(person.identityStatus==='linked'&&VALID.test(id))return id;
  if(VALID.test(remote))return remote;
  const resolved=resolve(id);
  return VALID.test(resolved)&&resolved!==id?resolved:'';
}
function showError(message){
  const text=String(message||'Verbinding kon niet worden aangemaakt.');
  const now=Date.now();
  if(text===lastError&&now-lastErrorAt<5000)return;
  lastError=text;lastErrorAt=now;
  window.LogCardsUI?.sheet?.('Verbinden',`<p class="cards-notice">${text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p><p class="cards-notice">De gekoppelde persoon blijft behouden. Je kunt Verbinden daarna opnieuw proberen.</p>`);
}
async function resume(){
  scheduled=false;
  if(running)return;
  const pending=String(sessionStorage.getItem(AFTER_PERSON_LINK)||'');
  if(!pending)return;
  const api=window.LogPersonConnections;
  if(!api?.createRequest){schedule(120);return;}
  const person=findPerson(pending);
  if(!person)return;
  const personId=confirmedPersonId(person);
  if(!VALID.test(personId))return;
  const status=api.statusForLocal?.(person.id)?.key||'none';
  if(['pending_out','pending_in','connected'].includes(status)){
    sessionStorage.removeItem(AFTER_PERSON_LINK);
    return;
  }
  running=true;
  try{
    const result=await api.createRequest(person.id);
    if(result)sessionStorage.removeItem(AFTER_PERSON_LINK);
  }catch(error){
    showError(error?.message||error);
  }finally{running=false;}
}
function schedule(delay=40){
  if(scheduled)return;
  scheduled=true;
  setTimeout(resume,delay);
}
function install(){
  ['log-person-id-merged','log-person-id-migrated','log-time-state-change','log-identity-sync-change','pageshow','online'].forEach(name=>window.addEventListener(name,()=>schedule(name==='online'?80:40)));
  schedule(200);
  setInterval(()=>{if(document.visibilityState==='visible'&&sessionStorage.getItem(AFTER_PERSON_LINK))schedule(0);},1500);
  window.LogPersonConnectionResume={resume,schedule};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
