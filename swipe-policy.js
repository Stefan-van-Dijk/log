(function(){
  'use strict';
  const KM='kmreg-v4-data',TIME='urenregistratie.pwa.v1';
  function settings(key){try{return JSON.parse(localStorage.getItem(key)||'{}').settings||{};}catch(_){return {};}}
  const modules={rides:'Ritten',time:'Tijd en taken',locations:'Locaties',themes:'Thema’s',people:'Personen',cards:'Kaarten',locationactions:'Acties'};
  function configured(module){
    const km=settings(KM);
    if(typeof km.swipeLifecycleModules?.[module]==='boolean')return km.swipeLifecycleModules[module];
    if(module==='cards'||module==='locationactions')return true;
    if(module==='time'||module==='themes'||module==='people')return settings(TIME).swipeDeleteEnabled!==false;
    if(module==='locations')return km.swipeDeleteEnabled!==false&&km.locationDeleteEnabled!==false;
    return km.swipeDeleteEnabled!==false;
  }
  function enabled(module){return settings(KM).swipeLifecycleEnabled!==false&&configured(module);}
  const selectors={
    cards:'[data-card-delete]',
    locationactions:'[data-la-delete]',
    themes:'[data-log-delete-theme],[data-del-sub],[data-del-theme]',
    locations:'[data-shell-location-swipe-action="delete"],[data-action="delete-location"]',
    time:'[data-swipe-action="delete"],#deleteEntry,[data-del-entry]',
    people:'[data-delete-colleague]',
    rides:'[data-action="delete-trip"],[data-action="delete-event"]'
  };
  function sync(){
    if(!document.body)return;
    for(const module of Object.keys(selectors))document.body.classList.toggle(`log-${module}-lifecycle-disabled`,!enabled(module));
  }
  // Guard old/open editors as well as swipe actions, before removal-policy handlers run.
  document.addEventListener('click',event=>{
    if(!event.target.closest)return;
    for(const [module,selector] of Object.entries(selectors))if(event.target.closest(selector)&&!enabled(module)){
      event.preventDefault();event.stopImmediatePropagation();return;
    }
  },true);
  window.LogSwipePolicy={enabled,configured,modules,masterEnabled:()=>settings(KM).swipeLifecycleEnabled!==false,actionWidth:()=>window.innerWidth<=520?78:84};
  for(const name of ['log-km-state-change','log-time-state-change','pageshow','storage'])window.addEventListener(name,sync);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
})();
