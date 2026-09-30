(function(){
'use strict';

const KM='kmreg-test-v4-data';
const TIME='urenregistratie.test.pwa.v1';
const UPDATE_STORE='log-test-shared-config-updates-v2';
const SHARING_STORE='log-test-sharing-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let migrating=false,patchAttempts=0;

function read(key){
  try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}
}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function localId(){
  if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
}
function rootCards(km){
  return (Array.isArray(km?.cards)?km.cards:[]).filter(card=>{
    const source=card?.sharedSource;
    return source?.isRoot===true&&source.rootType==='card'&&VALID.test(String(source.configurationId||''))&&String(card.id)===String(source.configurationId);
  });
}
function stableLocalId(configurationId,oldId,used,sharing,updates){
  const candidates=[];
  const metaId=updates?.configurations?.[configurationId]?.localRootId;
  if(metaId)candidates.push(String(metaId));
  for(const [key,value] of Object.entries(sharing.roots||{})){
    if(String(value)!==configurationId||!key.startsWith('card:'))continue;
    candidates.push(key.slice(5));
  }
  for(const candidate of candidates){
    if(!candidate||candidate===oldId||candidate===configurationId||used.has(candidate))continue;
    return candidate;
  }
  let next=localId();
  while(!next||used.has(next)||VALID.test(next))next=localId();
  return next;
}
function migrate(options={}){
  if(migrating)return {changed:false,count:0};
  migrating=true;
  try{
    const km=read(KM),time=read(TIME),updates=read(UPDATE_STORE),sharing=read(SHARING_STORE);
    const cards=Array.isArray(km.cards)?km.cards:[];
    const actions=Array.isArray(time.locationActions)?time.locationActions:[];
    const roots=rootCards(km);
    if(!roots.length)return {changed:false,count:0};

    sharing.roots=sharing.roots&&typeof sharing.roots==='object'?sharing.roots:{};
    updates.configurations=updates.configurations&&typeof updates.configurations==='object'?updates.configurations:{};
    const used=new Set(cards.map(card=>String(card?.id||'')));
    const migrated=[];

    for(const card of roots){
      const configurationId=String(card.sharedSource.configurationId);
      const oldId=String(card.id);
      const nextId=stableLocalId(configurationId,oldId,used,sharing,updates);
      used.add(nextId);
      card.id=nextId;

      for(const action of actions){
        if(action?.type==='card'&&String(action.targetId||'')===oldId)action.targetId=nextId;
      }

      const meta=updates.configurations[configurationId];
      if(meta&&typeof meta==='object')meta.localRootId=nextId;

      for(const [key,value] of Object.entries(sharing.roots)){
        if(key.startsWith('card:')&&String(value)===configurationId&&key!==`card:${nextId}`)delete sharing.roots[key];
      }
      sharing.roots[`card:${nextId}`]=configurationId;
      migrated.push({configurationId,oldId,newId:nextId});
    }

    km.cards=cards;
    time.locationActions=actions;
    write(KM,km);write(TIME,time);write(UPDATE_STORE,updates);write(SHARING_STORE,sharing);

    if(options.announce!==false){
      window.dispatchEvent(new CustomEvent('log-shared-id-migrated',{detail:{count:migrated.length,items:migrated}}));
      window.dispatchEvent(new Event('log-shell-view-refresh'));
      window.LogCardsModule?.refresh?.();
      window.LogLocationActions?.refresh?.();
    }
    return {changed:true,count:migrated.length,items:migrated};
  }finally{migrating=false;}
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
  return {km,time,maps};
}
function mapped(map,value){
  if(value==null||value==='')return value;
  return map.get(String(value))||value;
}
function normalizeOutgoingBundle(bundle,configurationId){
  if(!bundle?.objects||!VALID.test(configurationId))return bundle;
  const {maps}=sourceMaps(configurationId),objects=bundle.objects;
  if(bundle.root?.type&&maps[bundle.root.type])bundle.root.sourceId=mapped(maps[bundle.root.type],bundle.root.sourceId);

  for(const location of Array.isArray(objects.locations)?objects.locations:[]){
    location.id=mapped(maps.location,location.id);location.parentId=mapped(maps.location,location.parentId);
  }
  for(const theme of Array.isArray(objects.themes)?objects.themes:[])theme.id=mapped(maps.theme,theme.id);
  for(const sub of Array.isArray(objects.subthemes)?objects.subthemes:[]){
    sub.id=mapped(maps.subtheme,sub.id);sub.themeId=mapped(maps.theme,sub.themeId);
  }
  for(const card of Array.isArray(objects.cards)?objects.cards:[]){
    card.id=mapped(maps.card,card.id);card.locationId=mapped(maps.location,card.locationId);
    if(card.scanAction?.type==='task'){
      card.scanAction.themeId=mapped(maps.theme,card.scanAction.themeId);
      card.scanAction.subthemeId=mapped(maps.subtheme,card.scanAction.subthemeId);
    }
  }
  for(const action of Array.isArray(objects.actions)?objects.actions:[]){
    action.id=mapped(maps.action,action.id);action.locationId=mapped(maps.location,action.locationId);
    if(action.type==='ride')action.targetId=mapped(maps.location,action.targetId);
    if(action.type==='card')action.targetId=mapped(maps.card,action.targetId);
    if(action.type==='task'){
      action.targetId=mapped(maps.theme,action.targetId);
      action.subthemeId=mapped(maps.subtheme,action.subthemeId);
    }
  }
  return bundle;
}
function patchBuildBundle(){
  const sharing=window.LogSharing;
  if(!sharing?.buildBundle)return false;
  if(sharing.buildBundle.__sharedIdentitySeparation)return true;
  const original=sharing.buildBundle.bind(sharing);
  const wrapped=function(type,id){
    const km=read(KM),time=read(TIME),root=itemFor(type,id,km,time),configurationId=String(root?.sharedSource?.configurationId||'');
    const bundle=original(type,id);
    return VALID.test(configurationId)?normalizeOutgoingBundle(bundle,configurationId):bundle;
  };
  wrapped.__sharedIdentitySeparation=true;wrapped.__original=original;sharing.buildBundle=wrapped;
  return true;
}
function ensureBundlePatch(){
  if(patchBuildBundle())return;
  if(patchAttempts++<240)setTimeout(ensureBundlePatch,50);
}

function install(){
  const initial=migrate({announce:false});
  if(initial.changed){
    setTimeout(()=>{
      window.dispatchEvent(new CustomEvent('log-shared-id-migrated',{detail:initial}));
      window.dispatchEvent(new Event('log-shell-view-refresh'));
      window.LogCardsModule?.refresh?.();
      window.LogLocationActions?.refresh?.();
    },0);
  }
  window.addEventListener('log-km-state-change',event=>{
    if(event?.detail?.source==='shared-id-separation')return;
    migrate({announce:false});
  });
  ensureBundlePatch();
  window.LogSharedIdentity={migrate,normalizeOutgoingBundle};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
