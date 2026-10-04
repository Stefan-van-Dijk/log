(function(){
'use strict';

const TIME='urenregistratie.test.pwa.v1';
const IDENTITY='log-test-identity-sync-v2';
const ALIASES='log-test-person-id-aliases-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let migrating=false;
let scheduled=false;
let patchAttempts=0;

function read(key,fallback={}){
  try{
    const value=JSON.parse(localStorage.getItem(key)||'null');
    return value&&typeof value==='object'?value:fallback;
  }catch(_){return fallback;}
}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function randomId(){
  const bytes=new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,b=>ALPHABET[b&63]).join('');
}
function aliasState(){
  const value=read(ALIASES,{});
  return{version:1,map:value.map&&typeof value.map==='object'?value.map:{},updatedAt:value.updatedAt||null};
}
function saveAliases(value){value.updatedAt=new Date().toISOString();write(ALIASES,value);}
function resolve(value,map=aliasState().map){
  let current=String(value||'');
  const seen=new Set();
  for(let i=0;i<24;i++){
    if(!current||seen.has(current))break;
    seen.add(current);
    const next=String(map[current]||'');
    if(!next||next===current)break;
    current=next;
  }
  return current;
}
function setAlias(from,to,state=aliasState()){
  from=String(from||'');to=String(to||'');
  if(!from||!to||from===to)return false;
  const final=resolve(to,state.map);
  let changed=state.map[from]!==final;
  state.map[from]=final;
  for(const key of Object.keys(state.map)){
    if(key!==from&&resolve(state.map[key],state.map)===from){state.map[key]=final;changed=true;}
    else if(state.map[key]===from){state.map[key]=final;changed=true;}
  }
  if(changed)saveAliases(state);
  return changed;
}
function combine(a,b){
  if(Array.isArray(a)&&Array.isArray(b)){
    const out=[];const seen=new Set();
    for(const item of [...a,...b]){const key=JSON.stringify(item);if(!seen.has(key)){seen.add(key);out.push(item);}}
    return out;
  }
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))return{...a,...b};
  return b===undefined?a:b;
}
function rewriteExact(value,from,to){
  if(typeof value==='string')return value===from?to:value;
  if(Array.isArray(value))return value.map(item=>rewriteExact(item,from,to));
  if(!value||typeof value!=='object')return value;
  const out={};
  for(const [key,item] of Object.entries(value)){
    const nextKey=key===from?to:key;
    const nextValue=rewriteExact(item,from,to);
    out[nextKey]=Object.prototype.hasOwnProperty.call(out,nextKey)?combine(out[nextKey],nextValue):nextValue;
  }
  return out;
}
function remapStoredReferences(from,to){
  if(!from||!to||from===to)return 0;
  const keys=[];for(let i=0;i<localStorage.length;i++)keys.push(localStorage.key(i));
  let changed=0;
  for(const key of keys){
    if(!key||key===ALIASES)continue;
    const raw=localStorage.getItem(key);if(!raw)continue;
    let value;try{value=JSON.parse(raw);}catch(_){continue;}
    const next=rewriteExact(value,from,to),text=JSON.stringify(next);
    if(text!==raw){localStorage.setItem(key,text);changed++;}
  }
  return changed;
}
function mergePerson(a,b,id){
  const rank=p=>p?.identityStatus==='self'?3:(p?.identityStatus==='linked'||VALID.test(String(p?.logPersonId||'')))?2:1;
  const preferred=rank(b)>=rank(a)?b:a,other=preferred===b?a:b;
  const out={...other,...preferred,id};
  for(const [key,value] of Object.entries(other||{})){
    const current=out[key];
    if((current===undefined||current===null||current==='')&&value!==undefined&&value!==null&&value!=='')out[key]=value;
  }
  const sources=[...(Array.isArray(a?.contactSources)?a.contactSources:[]),...(Array.isArray(b?.contactSources)?b.contactSources:[])];
  if(sources.length){const seen=new Set();out.contactSources=sources.filter(item=>{const key=JSON.stringify(item);if(seen.has(key))return false;seen.add(key);return true;});}
  out.usageCount=Math.max(Number(a?.usageCount)||0,Number(b?.usageCount)||0);
  const aliases=[...(Array.isArray(a?.personIdAliases)?a.personIdAliases:[]),...(Array.isArray(b?.personIdAliases)?b.personIdAliases:[])].map(String).filter(Boolean);
  if(aliases.length)out.personIdAliases=[...new Set(aliases.filter(value=>value!==id))];
  return out;
}
function normalizePeople(forceLinkedId=''){
  const time=read(TIME,{});time.settings=time.settings&&typeof time.settings==='object'?time.settings:{};time.colleagues=Array.isArray(time.colleagues)?time.colleagues:[];
  const selfId=resolve(time.settings.selfPersonId||'');
  const byId=new Map();let changed=false;
  for(const person of time.colleagues){
    if(!person||!VALID.test(String(person.id||'')))continue;
    const id=String(person.id),copy={...person,id};
    if(id===selfId){if(copy.identityStatus!=='self')changed=true;copy.identityStatus='self';copy.logPersonId=id;}
    else if(id===forceLinkedId||VALID.test(String(copy.logPersonId||''))){if(copy.identityStatus!=='linked'||copy.logPersonId!==id)changed=true;copy.identityStatus='linked';copy.logPersonId=id;}
    else{if(copy.identityStatus!=='provisional'||Object.prototype.hasOwnProperty.call(copy,'logPersonId'))changed=true;copy.identityStatus='provisional';delete copy.logPersonId;}
    if(byId.has(id)){byId.set(id,mergePerson(byId.get(id),copy,id));changed=true;}else byId.set(id,copy);
  }
  const next=[...byId.values()];
  if(next.length!==time.colleagues.length)changed=true;
  if(String(time.settings.selfPersonId||'')!==selfId&&selfId){time.settings.selfPersonId=selfId;changed=true;}
  if(changed){time.colleagues=next;write(TIME,time);}
  return changed;
}
function nextUnused(used){let id=randomId();while(used.has(id))id=randomId();used.add(id);return id;}
function migrateExisting(){
  if(migrating)return false;migrating=true;
  let changed=false;
  try{
    let time=read(TIME,{});time.settings=time.settings&&typeof time.settings==='object'?time.settings:{};time.colleagues=Array.isArray(time.colleagues)?time.colleagues:[];
    const identity=read(IDENTITY,{}),selfRemote=VALID.test(String(identity.self?.personId||''))?String(identity.self.personId):'';
    const oldSelf=String(time.settings.selfPersonId||'');
    const used=new Set(time.colleagues.flatMap(p=>[p?.id,p?.logPersonId]).map(String).filter(VALID.test.bind(VALID)));
    const plans=[];
    for(const person of time.colleagues){
      const old=String(person?.id||'');if(!old)continue;
      const isSelf=old===oldSelf;
      const linked=VALID.test(String(person.logPersonId||''))?String(person.logPersonId):'';
      let target=isSelf&&selfRemote?selfRemote:(linked||resolve(old));
      if(!VALID.test(target))target=nextUnused(used);
      if(old!==target)plans.push([old,target]);
    }
    for(const [from,to] of plans){
      setAlias(from,to);remapStoredReferences(from,to);changed=true;
    }
    if(normalizePeople())changed=true;
    if(changed){
      window.LogTimeModule?.reloadFromStorage?.({view:'home'});
      window.dispatchEvent(new CustomEvent('log-person-id-migrated'));
      window.dispatchEvent(new CustomEvent('log-time-state-change',{detail:{reason:'person-id-migration'}}));
    }
    return changed;
  }finally{migrating=false;}
}
function mergeIdentity(localId,realPersonId){
  realPersonId=String(realPersonId||'');if(!VALID.test(realPersonId))throw Error('Echte PersonId moet exact 12 tekens bevatten.');
  const current=resolve(localId),selfId=resolve(read(TIME,{}).settings?.selfPersonId||'');
  if(current===selfId&&current!==realPersonId)throw Error('Mijn eigen PersonId kan niet aan een andere persoon worden gekoppeld.');
  if(current&&current!==realPersonId){setAlias(current,realPersonId);if(String(localId)!==current)setAlias(localId,realPersonId);remapStoredReferences(current,realPersonId);}
  const time=read(TIME,{});time.colleagues=Array.isArray(time.colleagues)?time.colleagues:[];
  const person=time.colleagues.find(p=>String(p.id)===realPersonId);
  if(person){person.identityStatus=realPersonId===resolve(time.settings?.selfPersonId||'')?'self':'linked';person.logPersonId=realPersonId;const aliases=aliasState().map;person.personIdAliases=[...new Set(Object.keys(aliases).filter(key=>resolve(key,aliases)===realPersonId&&key!==realPersonId))];write(TIME,time);}
  normalizePeople(realPersonId);
  window.LogTimeModule?.reloadFromStorage?.({view:'home'});
  window.dispatchEvent(new CustomEvent('log-person-id-merged',{detail:{from:String(localId||''),to:realPersonId}}));
  window.dispatchEvent(new CustomEvent('log-time-state-change',{detail:{reason:'person-id-merge'}}));
  return realPersonId;
}
function scheduleMigration(){if(scheduled||migrating)return;scheduled=true;setTimeout(()=>{scheduled=false;try{migrateExisting();}catch(error){console.error('PersonId-migratie mislukt',error);}},0);}
function patchIdentityLink(){
  const api=window.LogIdentitySync;
  if(!api?.linkContact){if(patchAttempts++<200)setTimeout(patchIdentityLink,50);return;}
  if(api.linkContact.__personIdUnified)return;
  const original=api.linkContact;
  const wrapped=function(localId,remoteId){
    const result=original.call(api,localId,remoteId);
    setTimeout(()=>{try{mergeIdentity(localId,remoteId);}catch(error){console.error('PersonId samenvoegen mislukt',error);}},0);
    return result;
  };
  wrapped.__personIdUnified=true;wrapped.__original=original;api.linkContact=wrapped;
}
function init(){
  migrateExisting();patchIdentityLink();
  ['log-time-state-change','pageshow'].forEach(name=>window.addEventListener(name,scheduleMigration));
  window.LogPersonIdentity={resolve,merge:mergeIdentity,migrate:migrateExisting,aliases:()=>({...aliasState().map}),isProvisional:id=>{const person=(read(TIME,{}).colleagues||[]).find(p=>String(p.id)===resolve(id));return person?.identityStatus==='provisional';}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
