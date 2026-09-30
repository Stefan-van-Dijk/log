(function(){
  'use strict';

  const RECENT_MS=1500;
  const running=new Set();
  const recent=new Map();
  let attempts=0;

  function readyState(rule){
    if(!rule?.enabled)return 'Uitgeschakeld';
    if(rule.type==='ride'&&window.LogModuleVisibility?.enabled('rides')!==true)return 'Ritten staat uit';
    try{window.LogLocationActions.validate(rule);}catch(error){return error.message||'Controleer de actie.';}
    if(!window.LogLocationActions.inTime(rule,new Date()))return 'Buiten de ingestelde dagen of tijden';
    return '';
  }

  async function run(rule){
    if(rule.type==='task'){
      const target=rule.selection==='smart'
        ?window.LogTimeModule?.suggestForAction?.()
        :{themeId:rule.targetId,subthemeId:rule.subthemeId||''};
      if(!target)throw Error('Geen thema beschikbaar voor een slim voorstel.');
      window.LogTimeModule?.prepareFromCode?.({...target,locationName:'',note:rule.note??rule.name});
      window.LogCardsUI?.close?.();
      return true;
    }
    if(rule.type==='ride'){
      const snapshot=window.LogLocationActions.snapshot();
      if(snapshot?.km?.activeTrip)throw Error('Rond eerst de actieve rit af.');
      if(!window.LogRideStarter?.prepare)throw Error('Ritten is nog niet beschikbaar.');
      await window.LogRideStarter.prepare(rule.selection==='smart'?null:rule.targetId);
      window.LogCardsUI?.close?.();
      return true;
    }
    if(rule.type==='card'){
      window.LogCardsUI?.close?.();
      if(window.LogCardsModule?.show?.(rule.targetId)===false)throw Error('Kaart kon niet worden geopend.');
      return true;
    }
    throw Error('Actietype onbekend.');
  }

  async function scanCode(code){
    const value=String(code||'');
    const rules=window.LogLocationActions.snapshot().rules||[];
    const matches=rules.filter(rule=>rule.trigger==='qr'&&rule.logCodeId===value);
    if(matches.length!==1)throw Error(matches.length?'Deze Log-code is niet eenduidig geconfigureerd.':'Deze Log-code is nog niet geconfigureerd.');
    const rule=matches[0],problem=readyState(rule);
    if(problem)throw Error(problem);

    if(running.has(value))return true;
    const previous=recent.get(value)||0;
    if(Date.now()-previous<RECENT_MS)return true;
    running.add(value);
    try{
      await run(rule);
      recent.set(value,Date.now());
      window.dispatchEvent(new Event('log-shell-view-refresh'));
      window.dispatchEvent(new Event('log-time-state-change'));
      return true;
    }finally{
      running.delete(value);
    }
  }

  function install(){
    const actions=window.LogLocationActions;
    if(!actions){if(attempts++<200)setTimeout(install,50);return;}
    if(actions.scanCode?.__directQrAction)return;
    scanCode.__directQrAction=true;
    actions.scanCode=scanCode;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
