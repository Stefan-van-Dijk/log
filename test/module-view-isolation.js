(function(){
  'use strict';

  const SECTION_KEY='kmreg-test-shell-section-v1';
  const ROOT=document.documentElement;
  let queued=false;
  let syncing=false;

  function shellSection(){
    const activeTab=document.querySelector('.km-shell-tab-button.active[data-shell-tab]');
    const activeDrawer=document.querySelector('[data-shell-section].active,[data-shell-section][aria-current="page"]');
    const fromUi=activeTab?.dataset.shellTab||activeDrawer?.dataset.shellSection||'';
    if(fromUi)return fromUi;
    try{return localStorage.getItem(SECTION_KEY)||'rides';}catch(_){return 'rides';}
  }

  function setDisplay(node,value){
    if(!node)return;
    if(node.style.getPropertyValue('display')!==value||node.style.getPropertyPriority('display')!=='important'){
      node.style.setProperty('display',value,'important');
    }
  }

  function clearDisplay(node){
    if(!node)return;
    if(node.style.getPropertyPriority('display')==='important')node.style.removeProperty('display');
  }

  function syncModuleVisibility(){
    queued=false;
    if(syncing)return;
    syncing=true;
    try{
      const section=shellSection();
      const app=document.getElementById('app');
      const timeRoot=document.getElementById('timeModuleRoot');
      if(!app||!timeRoot)return;

      ROOT.dataset.logActiveSection=section;

      if(section==='time'){
        document.body.classList.add('time-mode');
        if(!app.hidden)app.hidden=true;
        if(timeRoot.hidden)timeRoot.hidden=false;
        setDisplay(app,'none');
        setDisplay(timeRoot,'block');
        if(app.getAttribute('aria-hidden')!=='true')app.setAttribute('aria-hidden','true');
        timeRoot.removeAttribute('aria-hidden');
        requestAnimationFrame(()=>window.LogTimeModule?.showHome?.({scroll:false}));
      }else if(section==='rides'){
        document.body.classList.remove('time-mode');
        if(app.hidden)app.hidden=false;
        if(!timeRoot.hidden)timeRoot.hidden=true;
        setDisplay(app,'block');
        setDisplay(timeRoot,'none');
        timeRoot.setAttribute('aria-hidden','true');
        app.removeAttribute('aria-hidden');
      }else{
        clearDisplay(app);
        clearDisplay(timeRoot);
      }
    }finally{
      syncing=false;
    }
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(syncModuleVisibility);
  }

  function relevantMutation(mutation){
    const target=mutation.target;
    if(target===document.body||target===document.documentElement)return true;
    if(target?.id==='app'||target?.id==='timeModuleRoot')return true;
    return target instanceof Element&&!!target.closest?.('.km-shell-tab-button,[data-shell-section]');
  }

  function init(){
    syncModuleVisibility();
    window.addEventListener('pageshow',queue);
    window.addEventListener('log-shell-view-refresh',queue);
    window.addEventListener('log-time-state-change',()=>{if(shellSection()==='time')queue();});
    window.addEventListener('log-km-state-change',()=>{if(shellSection()==='rides')queue();});
    document.addEventListener('click',event=>{
      if(event.target.closest?.('[data-shell-tab],[data-shell-section],[data-module-id],.km-shell-tab-button')){
        setTimeout(queue,0);
        setTimeout(queue,60);
      }
    },true);
    new MutationObserver(mutations=>{
      if(!syncing&&mutations.some(relevantMutation))queue();
    }).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','style','aria-current']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
