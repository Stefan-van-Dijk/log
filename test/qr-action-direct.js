(function(){
  'use strict';

  const TIME='urenregistratie.test.pwa.v1';
  const KM='kmreg-test-v4-data';
  const VALID=/^[A-Za-z0-9_-]{12}$/;
  const RECENT_MS=1500;
  const running=new Set();
  const recent=new Map();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let attempts=0,patchAttempts=0;
  let originalParse=null,originalPreview=null;

  function read(key){
    try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}
  }
  function cards(){const km=read(KM);return Array.isArray(km.cards)?km.cards:[];}
  function rules(){const time=read(TIME);return Array.isArray(time.locationActions)?time.locationActions:[];}
  function cardMatches(value){return cards().filter(card=>String(card?.value??'')===String(value??''));}
  function actionCode(rule){const explicit=String(rule?.actionCodeId||'');return VALID.test(explicit)?explicit:String(rule?.logCodeId||'');}
  function actionMatches(value){return rules().filter(rule=>rule?.trigger==='qr'&&actionCode(rule)===String(value||''));}

  function migrateActionCodeIds(){
    const time=read(TIME),items=Array.isArray(time.locationActions)?time.locationActions:[];let changed=false;
    for(const rule of items){
      if(rule?.trigger!=='qr')continue;
      const legacy=String(rule.logCodeId||''),current=String(rule.actionCodeId||'');
      if(VALID.test(legacy)&&current!==legacy){rule.actionCodeId=legacy;changed=true;}
      else if(!legacy&&VALID.test(current)){rule.logCodeId=current;changed=true;}
    }
    if(!changed)return false;
    time.locationActions=items;
    localStorage.setItem(TIME,JSON.stringify(time));
    return true;
  }

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

  function classify(value){
    const raw=String(value??''),id=raw.trim();

    if(VALID.test(id)){
      const actions=actionMatches(id);
      if(actions.length===1)return {kind:'action',rule:actions[0],id};
      if(actions.length>1)return {kind:'ambiguous-action',rules:actions,id};
      if(window.LogSharedConfig?.hasConfiguration?.(id))return {kind:'shared-config',id};
      try{
        const resolved=window.LogCode?.resolveTask?.(id);
        if(resolved)return {kind:'task',id,resolved};
      }catch(_){}
      const exactCards=cardMatches(raw);
      if(exactCards.length===1)return {kind:'card',card:exactCards[0],value:raw};
      if(exactCards.length>1)return {kind:'card-choice',cards:exactCards,value:raw};
      return {kind:'identifier',id};
    }

    try{
      const payload=originalParse?originalParse(raw):window.LogCode?.parse?.(raw);
      if(payload)return {kind:'payload',payload,value:raw};
    }catch(error){return {kind:'invalid-payload',error,value:raw};}

    const exactCards=cardMatches(raw);
    if(exactCards.length===1)return {kind:'card',card:exactCards[0],value:raw};
    if(exactCards.length>1)return {kind:'card-choice',cards:exactCards,value:raw};
    return {kind:'unknown',value:raw};
  }

  async function scanCode(code){
    const value=String(code||''),matches=actionMatches(value);
    if(matches.length!==1)throw Error(matches.length?'Deze actiecode is niet eenduidig geconfigureerd.':'Deze actiecode is nog niet geconfigureerd.');
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

  function previewTask(payload){
    const ui=window.LogCardsUI;if(!ui?.sheet)return originalPreview?.(payload);
    let resolved;
    try{resolved=window.LogCode.resolveTask(payload.id);}catch(error){
      const panel=ui.sheet('Taak niet beschikbaar',`<p role="status">${esc(error.message||'Taak niet beschikbaar.')}</p><button class="btn full" data-log-task-close>Terug</button>`);
      panel.querySelector('[data-log-task-close]').onclick=()=>ui.close();return panel;
    }
    const theme=resolved.theme,sub=resolved.sub||resolved.subtheme||null;
    const panel=ui.sheet('Taak herkend',`<h3>${esc(theme?.name||'Thema')}</h3>${sub?`<p>${esc(sub.name||'Subthema')}</p>`:''}<button class="btn full cards-scan-action" data-log-task-start>Taak starten</button><p role="status" data-log-task-status></p>`);
    panel.querySelector('[data-log-task-start]').onclick=()=>{
      const button=panel.querySelector('[data-log-task-start]');if(button.disabled)return;button.disabled=true;
      try{
        const current=window.LogCode.resolveTask(payload.id),currentSub=current.sub||current.subtheme||null;
        if(!window.LogTimeModule?.prepareFromCode)throw Error('Tijd / taken is nog niet beschikbaar.');
        window.LogTimeModule.prepareFromCode({themeId:current.theme.id,subthemeId:currentSub?.id||'',locationName:'',note:currentSub?.name||''});
        ui.close();
      }catch(error){panel.querySelector('[data-log-task-status]').textContent=error.message||'Taak kon niet worden geopend.';button.disabled=false;}
    };
    return panel;
  }

  function patchLogCode(){
    const api=window.LogCode;
    if(!api?.parse||!api?.preview||!api?.resolveTask)return false;
    if(api.parse.__centralScanDispatcher)return true;

    originalParse=api.parse.bind(api);
    originalPreview=api.preview.bind(api);

    const parse=function(value){
      if(typeof value==='string'&&VALID.test(value)){
        const actions=actionMatches(value);
        if(actions.length>1)throw Error('Deze actiecode is aan meerdere acties gekoppeld.');
        if(actions.length===1)return {kind:'log-action',version:1,id:value};
        if(window.LogSharedConfig?.hasConfiguration?.(value))return {kind:'log-action',version:1,id:value};
        try{if(api.resolveTask(value))return {kind:'log-task',version:1,id:value};}catch(_){}
        if(cardMatches(value).length)return null;
      }
      return originalParse(value);
    };
    parse.__centralScanDispatcher=true;parse.__original=originalParse;api.parse=parse;

    const preview=function(payload){
      if(payload?.kind==='log-task')return previewTask(payload);
      return originalPreview(payload);
    };
    preview.__centralScanDispatcher=true;preview.__original=originalPreview;api.preview=preview;
    return true;
  }

  function ensurePatch(){if(patchLogCode())return;if(patchAttempts++<240)setTimeout(ensurePatch,50);}

  function install(){
    const actions=window.LogLocationActions;
    if(!actions){if(attempts++<200)setTimeout(install,50);return;}
    migrateActionCodeIds();
    scanCode.__directQrAction=true;
    actions.scanCode=scanCode;
    ensurePatch();
    window.LogScanDispatcher={classify,scanCode,actionMatches,cardMatches,migrateActionCodeIds};
  }

  window.addEventListener('log-time-state-change',migrateActionCodeIds);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();