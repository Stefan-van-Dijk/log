(function(){
  'use strict';

  const SECTION_KEY='kmreg-test-shell-section-v1';
  let lastSection=localStorage.getItem(SECTION_KEY)||'rides';
  let syncing=false;

  function timeTaskPreparationOpen(){
    const panel=document.querySelector('#main > .period-entry-mode');
    if(!panel)return false;
    return Boolean(panel.querySelector('#startInlineTask,#addInlineFirstTheme'));
  }

  function timePeriodChooser(){
    return [...document.querySelectorAll('#main > .period-entry-mode,#main > .period-overview')]
      .find(panel=>panel.querySelector('.period-choice-list')&&!panel.querySelector('#startInlineTask,#addInlineFirstTheme,#saveInlineStop,#startInlineInterruption'))||null;
  }

  function ridePeriodChooser(){
    const panel=document.querySelector('#app #periodNavigator.period-entry-mode');
    return panel?.querySelector('.period-choice-list')?panel:null;
  }

  function normalizeTimePrimaryAction(){
    const button=document.getElementById('registerTaskInline');
    if(!button)return;
    const preparing=timeTaskPreparationOpen();
    if(preparing)return;
    if(button.textContent!=='Taak registreren')button.textContent='Taak registreren';
    button.hidden=false;
    button.classList.add('primary');
    button.classList.remove('secondary','task-cancel-button');
  }

  function closeTimePeriodChooser(){
    const chooser=timePeriodChooser();
    if(!chooser)return;
    const close=document.getElementById('cancelPeriodChooser');
    if(close){close.click();return;}
    try{window.LogTimeModule?.showHome?.({scroll:false});}catch(_){}
  }

  function closeRidePeriodChooser(){
    const chooser=ridePeriodChooser();
    if(!chooser)return;
    chooser.querySelector('[data-action="period-cancel"]')?.click();
  }

  function closeTransientChooser(section){
    if(section==='time')closeTimePeriodChooser();
    else if(section==='rides')closeRidePeriodChooser();
  }

  function sync(){
    if(syncing)return;
    syncing=true;
    requestAnimationFrame(()=>{
      syncing=false;
      normalizeTimePrimaryAction();
    });
  }

  function handleSection(next){
    const target=next||localStorage.getItem(SECTION_KEY)||lastSection;
    if(target!==lastSection){
      const previous=lastSection;
      lastSection=target;
      requestAnimationFrame(()=>{
        closeTransientChooser(previous);
        normalizeTimePrimaryAction();
      });
    }else sync();
  }

  window.addEventListener('kmreg-test-shell-select-section',event=>{
    const next=event.detail?.section;
    if(next)requestAnimationFrame(()=>handleSection(next));
  });
  window.addEventListener('log-shell-view-refresh',event=>handleSection(event.detail?.section));
  window.addEventListener('log-time-state-change',sync);
  window.addEventListener('pageshow',()=>handleSection(localStorage.getItem(SECTION_KEY)||lastSection));

  const observer=new MutationObserver(sync);
  const install=()=>{
    observer.observe(document.body,{childList:true,subtree:true});
    sync();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
