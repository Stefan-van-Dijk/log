(function(){
'use strict';

const KM='kmreg-test-v4-data';
const TIME='urenregistratie.test.pwa.v1';
const UPDATE_STORE='log-test-shared-config-updates-v2';
const SHARING_STORE='log-test-sharing-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let migrating=false;

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
      let nextId=localId();
      while(!nextId||used.has(nextId)||VALID.test(nextId))nextId=localId();
      used.add(nextId);
      card.id=nextId;

      for(const action of actions){
        if(action?.type==='card'&&String(action.targetId||'')===oldId)action.targetId=nextId;
      }

      const meta=updates.configurations[configurationId];
      if(meta&&typeof meta==='object')meta.localRootId=nextId;

      for(const [key,value] of Object.entries(sharing.roots)){
        if(key===`card:${oldId}`&&String(value)===configurationId)delete sharing.roots[key];
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
  window.LogSharedIdentity={migrate};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
