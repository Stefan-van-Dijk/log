(function(){
  'use strict';

  const OPEN_COOLDOWN_MS=30000;
  const RETRY_MS=80;
  const MAX_RETRIES=100;
  let lastPreciseAt=0;
  let retryCount=0;
  let precisePromise=null;

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function api(){return window.LogLocationPolling||null;}

  async function precise(reason='manual'){
    if(document.hidden)throw Error('Log staat op de achtergrond.');
    const polling=api();
    if(!polling?.request)throw Error('Locatiecontrole is nog niet beschikbaar.');
    if(precisePromise)return precisePromise;
    precisePromise=(async()=>{
      const startedAt=Date.now();
      try{
        const position=await polling.request({maxAge:0,highAccuracy:true});
        lastPreciseAt=Date.now();
        window.dispatchEvent(new CustomEvent('log-location-precision-ready',{detail:{reason,position,startedAt,finishedAt:lastPreciseAt}}));
        return position;
      }catch(error){
        window.dispatchEvent(new CustomEvent('log-location-precision-error',{detail:{reason,error}}));
        throw error;
      }finally{
        precisePromise=null;
      }
    })();
    return precisePromise;
  }

  function preciseOnOpen(){
    if(document.hidden||Date.now()-lastPreciseAt<OPEN_COOLDOWN_MS)return;
    const polling=api();
    if(!polling?.request){
      if(retryCount++<MAX_RETRIES)setTimeout(preciseOnOpen,RETRY_MS);
      return;
    }
    retryCount=0;
    precise('open').catch(()=>{});
  }

  function showPrecisionError(error){
    const message=error?.message||'Er kon geen nauwkeurige locatie worden bepaald.';
    if(window.LogCardsUI?.sheet){
      window.LogCardsUI.sheet('Locatie controleren',`<p class="cards-notice">${esc(message)}</p><p class="cards-notice">De actie is nog niet uitgevoerd. Probeer het opnieuw zodra de locatie beschikbaar is.</p>`);
    }
  }

  function syncHelpText(){
    document.querySelectorAll('.cards-notice').forEach(node=>{
      const text=String(node.textContent||'');
      if(text.includes('elke 6 seconden zonder actieve rit')){
        node.textContent='Log bepaalt bij openen één keer nauwkeurig je locatie. Zolang de app zichtbaar is controleert Log daarna in de automatische stand ongeveer elke 10 seconden zuinig; tijdens een actieve rit elke minuut. Vlak vóór het uitvoeren van een locatieactie wordt opnieuw één nauwkeurige meting gedaan. Er is geen locatieherkenning wanneer Log gesloten is.';
      }
    });
  }

  document.addEventListener('click',async event=>{
    const button=event.target.closest?.('[data-la-propose]');
    if(!button)return;
    if(button.dataset.locationPrecisionReady==='1'){
      delete button.dataset.locationPrecisionReady;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const previousDisabled=button.disabled;
    button.disabled=true;
    try{
      await precise('location-action');
      button.dataset.locationPrecisionReady='1';
      button.disabled=previousDisabled;
      button.click();
    }catch(error){
      button.disabled=previousDisabled;
      showPrecisionError(error);
    }
  },true);

  window.addEventListener('pageshow',()=>setTimeout(()=>{preciseOnOpen();syncHelpText();},120));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>{preciseOnOpen();syncHelpText();},120);});
  window.addEventListener('log-shell-ready',()=>setTimeout(()=>{preciseOnOpen();syncHelpText();},120));
  window.addEventListener('log-shell-view-refresh',()=>setTimeout(syncHelpText,0));

  function install(){
    preciseOnOpen();
    syncHelpText();
    new MutationObserver(syncHelpText).observe(document.documentElement,{childList:true,subtree:true});
    window.LogLocationPrecision={precise,preciseOnOpen,lastPreciseAt:()=>lastPreciseAt};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
