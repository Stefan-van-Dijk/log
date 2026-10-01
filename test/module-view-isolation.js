(function(){
  'use strict';

  const SECTION_KEY='kmreg-test-shell-section-v1';
  let syncing=false;

  function currentSection(){
    try{return localStorage.getItem(SECTION_KEY)||'rides';}catch(_){return 'rides';}
  }

  function syncModuleVisibility(){
    if(syncing)return;
    syncing=true;
    try{
      const section=currentSection();
      const app=document.getElementById('app');
      const timeRoot=document.getElementById('timeModuleRoot');
      if(!app||!timeRoot)return;

      if(section==='time'){
        document.body.classList.add('time-mode');
        app.hidden=true;
        timeRoot.hidden=false;
        app.setAttribute('aria-hidden','true');
        timeRoot.removeAttribute('aria-hidden');
        requestAnimationFrame(()=>window.LogTimeModule?.showHome?.({scroll:false}));
      }else if(section==='rides'){
        document.body.classList.remove('time-mode');
        app.hidden=false;
        timeRoot.hidden=true;
        timeRoot.setAttribute('aria-hidden','true');
        app.removeAttribute('aria-hidden');
      }
    }finally{
      syncing=false;
    }
  }

  function queue(){requestAnimationFrame(syncModuleVisibility);}

  function init(){
    syncModuleVisibility();
    window.addEventListener('pageshow',queue);
    window.addEventListener('log-shell-view-refresh',queue);
    window.addEventListener('log-time-state-change',()=>{if(currentSection()==='time')queue();});
    window.addEventListener('log-km-state-change',()=>{if(currentSection()==='rides')queue();});
    document.addEventListener('click',event=>{
      if(event.target.closest?.('[data-section],[data-module-id],.km-shell-tab-button'))setTimeout(syncModuleVisibility,0);
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
