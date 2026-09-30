(function(){
  'use strict';

  let installed=false,pending=null,attempts=0;

  function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function currentTimer(){return clone(window.LogTimeModule?.getState?.()?.timer||{status:'inactive'});}
  function selectTime(){window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section:'time'}}));}

  function triggerNormalStop(){
    selectTime();
    let tries=0;
    const clickStop=()=>{
      if(!pending)return;
      const button=document.getElementById('stopTimer');
      if(button){button.click();return;}
      if(tries++<80)setTimeout(clickStop,50);
      else pending=null;
    };
    requestAnimationFrame(clickStop);
  }

  function maybeStartQueuedTask(){
    if(!pending)return;
    const state=window.LogTimeModule?.getState?.();
    if(!state)return;
    const timer=state.timer||{};
    if(timer.status==='inactive'&&String(state.lastCompletion?.entryId||'')===String(pending.sessionId||'')){
      const next=pending;pending=null;
      try{
        window.LogTimeModule.startFromCard({themeId:next.themeId,subthemeId:next.subthemeId||'',locationName:next.locationName||'',note:''});
        selectTime();
      }catch(error){
        console.warn('Nieuwe taak kon na afronden niet worden gestart.',error);
      }
      return;
    }
    if(timer.status==='active'&&String(timer.sessionId||'')!==String(pending.sessionId||''))pending=null;
  }

  function install(){
    if(installed)return;
    const api=window.LogTimeModule;
    if(!api?.startFromLocationAction||!api?.startFromCard||!api?.getState){if(attempts++<240)setTimeout(install,50);return;}
    const original=api.startFromLocationAction.bind(api);
    const wrapped=function(options={}){
      if(options.mode!=='replace')return original(options);
      const timer=currentTimer();
      if(JSON.stringify(timer)!==options.expectedTimer)throw Error('De lopende taak is gewijzigd. Sluit dit voorstel en scan opnieuw.');
      if(timer.status!=='active'||timer.interruption)throw Error('Rond eerst de openstaande taak of tussenstop af.');
      pending={themeId:options.themeId,subthemeId:options.subthemeId||'',locationName:options.locationName||'',sessionId:timer.sessionId};
      window.LogCardsUI?.close?.();
      triggerNormalStop();
      return true;
    };
    window.LogTimeModule=Object.freeze({...api,startFromLocationAction:wrapped});
    installed=true;
    window.addEventListener('log-time-state-change',maybeStartQueuedTask);
    const observer=new MutationObserver(()=>{
      document.querySelectorAll('[data-log-task-replace]').forEach(button=>{if(button.textContent!=='Huidige afronden en starten')button.textContent='Huidige afronden en starten';});
    });
    observer.observe(document.body,{subtree:true,childList:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();