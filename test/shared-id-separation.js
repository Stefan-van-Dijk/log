(function(){
'use strict';

const KM='kmreg-test-v4-data';
const TIME='urenregistratie.test.pwa.v1';
const UPDATE_STORE='log-test-shared-config-updates-v2';
const SHARING_STORE='log-test-sharing-v1';
const ID_STORE='log-test-shared-local-ids-v1';
const LOCAL=/^[A-Za-z0-9_-]{8}$/;
const SHARED=/^[A-Za-z0-9_-]{12}$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let migrating=false,patchAttempts=0,savePatchAttempts=0;

function read(key){
  try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}
}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function randomLocalId(used=new Set()){
  for(let attempt=0;attempt<200;attempt++){
    const bytes=new Uint8Array(8);
    if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<8;i++)bytes[i]=Math.floor(Math.random()*256);
    let value='';for(const byte of bytes)value+=ALPHABET[byte&63];
    if(!used.has(value)&&LOCAL.test(value))return value;
  }
  throw Error('Er kon geen unieke lokale kaart-ID worden gemaakt.');
}
function configurationForCard(cardId,sharing,card=null){
  const direct=sharing?.roots?.[`card:${cardId}`];
  if(SHARED.test(String(direct||'')))return String(direct);
  const source=card?.sharedSource?.configurationId;
  return SHARED.test(String(source||''))?String(source):'';
}
function identityKey(configurationId,sourceId){return SHARED.test(String(configurationId||''))?`card:${configurationId}:${String(sourceId??'')}`:'';}
function identities(value=read(ID_STORE)){
  value.items=value.items&&typeof value.items==='object'?value.items:{};
  return value;
}
function stableLocalId(configurationId,sourceId,oldId,used,updates,sharing,identityState){
  const key=identityKey(configurationId,sourceId);
  const candidates=[];
  if(key&&LOCAL.test(String(identityState.items[key]||'')))candidates.push(String(identityState.items[key]));
  const meta=updates?.configurations?.[configurationId];
  if(LOCAL.test(String(meta?.localRootId||'')))candidates.push(String(meta.localRootId));
  for(const [rootKey,value] of Object.entries(sharing?.roots||{})){
    if(String(value)!==String(configurationId)||!rootKey.startsWith('card:'))continue;
    const candidate=rootKey.slice(5);if(LOCAL.test(candidate))candidates.push(candidate);
  }
  for(const candidate of candidates){
    if(candidate===oldId||!used.has(candidate)){
      if(key)identityState.items[key]=candidate;
      return candidate;
    }
  }
  const next=randomLocalId(used);
  if(key)identityState.items[key]=next;
  return next;
}
function updateReferences(remap,cards,time,updates,sharing){
  if(!remap.size)return;
  const actions=Array.isArray(time.locationActions)?time.locationActions:[];
  for(const action of actions){
    if(action?.type==='card'&&remap.has(String(action.targetId||'')))action.targetId=remap.get(String(action.targetId));
  }
  time.locationActions=actions;

  sharing.roots=sharing.roots&&typeof sharing.roots==='object'?sharing.roots:{};
  for(const [oldId,newId] of remap){
    const key=`card:${oldId}`;
    if(Object.hasOwn(sharing.roots,key)){
      const configurationId=sharing.roots[key];
      delete sharing.roots[key];
      sharing.roots[`card:${newId}`]=configurationId;
    }
  }

  if(sharing.published&&typeof sharing.published==='object'){
    for(const info of Object.values(sharing.published)){
      if(info&&remap.has(String(info.id||'')))info.id=remap.get(String(info.id));
    }
  }
  if(sharing.forkedFrom&&typeof sharing.forkedFrom==='object'){
    for(const [oldId,newId] of remap){
      if(!Object.hasOwn(sharing.forkedFrom,oldId))continue;
      sharing.forkedFrom[newId]=sharing.forkedFrom[oldId];
      delete sharing.forkedFrom[oldId];
    }
  }

  updates.configurations=updates.configurations&&typeof updates.configurations==='object'?updates.configurations:{};
  for(const meta of Object.values(updates.configurations)){
    if(meta&&remap.has(String(meta.localRootId||'')))meta.localRootId=remap.get(String(meta.localRootId));
  }
}
function normalizeCards(cards,time,updates,sharing,identityState){
  const used=new Set();
  for(const card of cards)if(LOCAL.test(String(card?.id||'')))used.add(String(card.id));
  const remap=new Map();

  for(const card of cards){
    const oldId=String(card?.id||'');
    const configurationId=configurationForCard(oldId,sharing,card);
    const sourceId=String(card?.sharedSource?.sourceId??oldId);
    if(LOCAL.test(oldId)){
      const key=identityKey(configurationId,sourceId);if(key)identityState.items[key]=oldId;
      continue;
    }
    const nextId=configurationId
      ?stableLocalId(configurationId,sourceId,oldId,used,updates,sharing,identityState)
      :randomLocalId(used);
    used.add(nextId);remap.set(oldId,nextId);

    if(configurationId){
      card.sharedSource={
        ...(card.sharedSource&&typeof card.sharedSource==='object'?card.sharedSource:{}),
        configurationId,
        sourceId,
        rootType:card?.sharedSource?.rootType||'card',
        isRoot:card?.sharedSource?.isRoot!==false
      };
    }
    card.id=nextId;
  }
  updateReferences(remap,cards,time,updates,sharing);
  return remap;
}
function migrate(options={}){
  if(migrating)return {changed:false,count:0};
  migrating=true;
  try{
    const km=read(KM),time=read(TIME),updates=read(UPDATE_STORE),sharing=read(SHARING_STORE),identityState=identities();
    const cards=Array.isArray(km.cards)?km.cards:[];
    const remap=normalizeCards(cards,time,updates,sharing,identityState);
    write(ID_STORE,identityState);
    if(!remap.size)return {changed:false,count:0};

    km.cards=cards;
    write(KM,km);write(TIME,time);write(UPDATE_STORE,updates);write(SHARING_STORE,sharing);
    const items=[...remap].map(([oldId,newId])=>({oldId,newId}));
    if(options.announce!==false){
      window.dispatchEvent(new CustomEvent('log-card-id-migrated',{detail:{count:items.length,items}}));
      window.dispatchEvent(new Event('log-shell-view-refresh'));
      window.LogCardsModule?.refresh?.();window.LogLocationActions?.refresh?.();
    }
    return {changed:true,count:items.length,items};
  }finally{migrating=false;}
}

function patchCardSave(){
  const api=window.LogCardData;
  if(!api?.save)return false;
  if(api.save.__localCardId8)return true;
  const original=api.save.bind(api);
  const wrapped=function(cards){
    const list=Array.isArray(cards)?cards:[];
    const time=read(TIME),updates=read(UPDATE_STORE),sharing=read(SHARING_STORE),identityState=identities();
    const remap=normalizeCards(list,time,updates,sharing,identityState);
    write(ID_STORE,identityState);
    if(remap.size){write(TIME,time);write(UPDATE_STORE,updates);write(SHARING_STORE,sharing);}
    return original(list);
  };
  wrapped.__localCardId8=true;wrapped.__original=original;api.save=wrapped;return true;
}
function ensureCardSavePatch(){
  if(patchCardSave())return;
  if(savePatchAttempts++<240)setTimeout(ensureCardSavePatch,50);
}

function itemFor(type,id,km,time){
  const collection=type==='location'?km.locations:type==='card'?km.cards:type==='theme'?time.themes:type==='action'?time.locationActions:[];
  return (Array.isArray(collection)?collection:[]).find(item=>String(item?.id)===String(id))||null;
}
function sourceMaps(configurationId){
  const km=read(KM),time=read(TIME),maps={location:new Map(),theme:new Map(),subtheme:new Map(),card:new Map(),action:new Map()};
  const add=(type,items)=>{
    for(const item of Array.isArray(items)?items:[]){
      const source=item?.sharedSource;
      if(String(source?.configurationId||'')!==configurationId||source?.sourceId==null)continue;
      maps[type].set(String(item.id),String(source.sourceId));
    }
  };
  add('location',km.locations);add('theme',time.themes);add('subtheme',time.subthemes);add('card',km.cards);add('action',time.locationActions);
  return {maps};
}
function mapped(map,value){if(value==null||value==='')return value;return map.get(String(value))||value;}
function normalizeOutgoingBundle(bundle,configurationId){
  if(!bundle?.objects||!SHARED.test(configurationId))return bundle;
  const {maps}=sourceMaps(configurationId),objects=bundle.objects;
  if(bundle.root?.type&&maps[bundle.root.type])bundle.root.sourceId=mapped(maps[bundle.root.type],bundle.root.sourceId);
  for(const location of Array.isArray(objects.locations)?objects.locations:[]){location.id=mapped(maps.location,location.id);location.parentId=mapped(maps.location,location.parentId);}
  for(const theme of Array.isArray(objects.themes)?objects.themes:[])theme.id=mapped(maps.theme,theme.id);
  for(const sub of Array.isArray(objects.subthemes)?objects.subthemes:[]){sub.id=mapped(maps.subtheme,sub.id);sub.themeId=mapped(maps.theme,sub.themeId);}
  for(const card of Array.isArray(objects.cards)?objects.cards:[]){
    card.id=mapped(maps.card,card.id);card.locationId=mapped(maps.location,card.locationId);
    if(card.scanAction?.type==='task'){card.scanAction.themeId=mapped(maps.theme,card.scanAction.themeId);card.scanAction.subthemeId=mapped(maps.subtheme,card.scanAction.subthemeId);}
  }
  for(const action of Array.isArray(objects.actions)?objects.actions:[]){
    action.id=mapped(maps.action,action.id);action.locationId=mapped(maps.location,action.locationId);
    if(action.type==='ride')action.targetId=mapped(maps.location,action.targetId);
    if(action.type==='card')action.targetId=mapped(maps.card,action.targetId);
    if(action.type==='task'){action.targetId=mapped(maps.theme,action.targetId);action.subthemeId=mapped(maps.subtheme,action.subthemeId);}
  }
  return bundle;
}
function patchBuildBundle(){
  const sharing=window.LogSharing;
  if(!sharing?.buildBundle)return false;
  if(sharing.buildBundle.__sharedIdentitySeparation)return true;
  const original=sharing.buildBundle.bind(sharing);
  const wrapped=function(type,id){
    const km=read(KM),time=read(TIME),root=itemFor(type,id,km,time),configurationId=String(root?.sharedSource?.configurationId||configurationForCard(id,read(SHARING_STORE),root)||'');
    const bundle=original(type,id);
    return SHARED.test(configurationId)?normalizeOutgoingBundle(bundle,configurationId):bundle;
  };
  wrapped.__sharedIdentitySeparation=true;wrapped.__original=original;sharing.buildBundle=wrapped;return true;
}
function ensureBundlePatch(){if(patchBuildBundle())return;if(patchAttempts++<240)setTimeout(ensureBundlePatch,50);}

function install(){
  const initial=migrate({announce:false});
  if(initial.changed)setTimeout(()=>{window.dispatchEvent(new CustomEvent('log-card-id-migrated',{detail:initial}));window.dispatchEvent(new Event('log-shell-view-refresh'));window.LogCardsModule?.refresh?.();window.LogLocationActions?.refresh?.();},0);
  ensureCardSavePatch();ensureBundlePatch();
  window.addEventListener('log-km-state-change',()=>migrate({announce:false}));
  window.LogSharedIdentity={migrate,normalizeOutgoingBundle};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();