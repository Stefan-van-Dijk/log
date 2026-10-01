(function(){
  'use strict';

  const SECTION_KEY='kmreg-test-shell-section-v1';
  let timer=0;

  function currentSection(){
    try{return localStorage.getItem(SECTION_KEY)||'rides';}catch(_){return 'rides';}
  }

  function syncModule(){
    timer=0;
    const section=currentSection();
    if(section!=='rides'&&section!=='time')return;

    const wantTime=section==='time';
    const isTime=document.body.classList.contains('time-mode');

    // Laat de bestaande app-mode wisselaar zelf hidden states en interne state beheren.
    // Daarmee voorkomen we concurrerende DOM/CSS-correcties en renderloops.
    if(wantTime!==isTime){
      document.getElementById('appModeToggle')?.click();
    }

    if(wantTime){
      requestAnimationFrame(()=>window.LogTimeModule?.showHome?.({scroll:false}));
    }
  }

  function schedule(delay=0){
    if(timer)clearTimeout(timer);
    timer=setTimeout(syncModule,delay);
  }

  function init(){
    syncModule();
    window.addEventListener('pageshow',()=>schedule(0));
    window.addEventListener('log-shell-view-refresh',()=>schedule(0));

    // Alleen reageren op echte navigatiekeuzes; geen MutationObserver of capture-listener.
    document.addEventListener('click',event=>{
      if(event.target.closest?.('[data-shell-tab],[data-shell-section]'))schedule(0);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
