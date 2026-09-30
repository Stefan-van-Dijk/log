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
  let originalParse=null,originalPreview=null,originalSharedPreview=null;

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

  function taskInfo(themeId,subthemeId=''){
    const time=read(TIME);
    const theme=(Array.isArray(time.themes)?time.themes:[]).find(item=>String(item.id)===String(themeId));
    const sub=subthemeId?(Array.isArray(time.subthemes)?time.subthemes:[]).find(item=>String(item.id)===String(subthemeId)&&String(item.themeId)===String(themeId)):null;
    if(!theme||(subthemeId&&!sub))throw Error('Het gekoppelde thema of subthema is niet meer beschikbaar.');
    return {theme,sub};
  }

  function confirmTask({themeId,subthemeId=''}){
    if(!window.LogCardsUI?.sheet||!window.LogTimeModule?.startFromCard)throw Error('Tijd / taken is nog niet beschikbaar.');
    const {theme,sub}=taskInfo(themeId,subthemeId);
    const panel=window.LogCardsUI.sheet('Taak starten',`<div class="log-task-go-summary" data-log-task-go><strong>${esc(theme.name||'Thema')}</strong>${sub?`<span>${esc(sub.name||'Subthema')}</span>`:''}</div><button class="btn primary full log-task-go-button" data-log-task-go-button>Go</button><p class="cards-notice" role="status" data-log-task-go-status></p>`);
    const button=panel.querySelector('[data-log-task-go-button]');
    const status=panel.querySelector('[data-log-task-go-status]');
    button.onclick=()=>{
      if(button.disabled)return;
      button.disabled=true;
      try{
        window.LogTimeModule.startFromCard({themeId,subthemeId,locationName:'',note:''});
        window.LogCardsUI.close();
        window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section:'time'}}));
        window.dispatchEvent(new Event('log-shell-view-refresh'));
        window.dispatchEvent(new Event('log-time-state-change'));
      }catch(error){
        status.textContent=error.message||'De taak kon niet worden gestart.';
        button.disabled=false;
      }
    };
    return panel;
  }

  async function run(rule){
    if(rule.type==='task'){
      const target=rule.selection==='smart'
        ?window.LogTimeModule?.suggestForAction?.()
        :{themeId:rule.targetId,subthemeId:rule.subthemeId||''};
      if(!target)throw Error('Geen thema beschikbaar voor een slim voorstel.');
      confirmTask({themeId:target.themeId,subthemeId:target.subthemeId||''});
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

  function runTaskCode(id){
    const current=window.LogCode.resolveTask(id),sub=current.sub||current.subtheme||null;
    return confirmTask({themeId:current.theme.id,subthemeId:sub?.id||''});
  }

  function showExecutionError(error){
    const text=error?.message||'De gescande Log-code kon niet worden uitgevoerd.';
    if(window.LogCardsUI?.sheet)window.LogCardsUI.sheet('Log-code niet uitgevoerd',`<p role="status">${esc(text)}</p><button class="btn full" data-log-exec-close>Sluiten</button>`).querySelector('[data-log-exec-close]')?.addEventListener('click',()=>window.LogCardsUI.close());
    else console.warn(text,error);
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
      return true;
    }finally{
      running.delete(value);
    }
  }

  function rootCarrierCard(payload){
    if(payload?.kind!=='shared-card'||payload.rootType!=='card')return null;
    const list=Array.isArray(payload.objects?.cards)?payload.objects.cards:[];
    return list.find(card=>String(card?.id)===String(payload.rootSourceId))||null;
  }

  function executableValue(value,outerId=''){
    if(value==null)return null;
    const raw=String(value);
    if(outerId&&raw.trim()===String(outerId))return null;
    try{
      const parsed=window.LogCode?.parse?.(raw);
      return parsed&&['log-code','log-task','log-action'].includes(parsed.kind)?parsed:null;
    }catch(error){return {kind:'log-invalid',error};}
  }

  function carrierPayload(payload){
    const card=rootCarrierCard(payload);
    return card?.value?executableValue(card.value,payload.id):null;
  }

  function storedCarrierPayload(id){
    const card=window.LogSharedCard?.stored?.(id);
    return card?.value?executableValue(card.value,id):null;
  }

  function executePayload(payload){
    if(payload?.kind==='log-invalid'){showExecutionError(payload.error);return true;}
    if(payload?.kind==='log-task'){
      try{return runTaskCode(payload.id);}catch(error){showExecutionError(error);return true;}
    }
    if(payload)return window.LogCode.preview(payload);
    return false;
  }

  function patchSharedPreview(){
    const shared=window.LogSharedCard;
    if(!shared?.preview||!window.LogSharedConfig)return false;
    if(shared.preview.__executeCarrierDirect)return true;
    originalSharedPreview=shared.preview.bind(shared);
    const wrapped=function(payload){
      const executable=carrierPayload(payload);
      if(executable)return executePayload(executable);
      return originalSharedPreview(payload);
    };
    wrapped.__executeCarrierDirect=true;wrapped.__original=originalSharedPreview;
    shared.preview=wrapped;
    if(window.LogSharedConfig.preview&&!window.LogSharedConfig.preview.__executeCarrierDirect)window.LogSharedConfig.preview=wrapped;
    return true;
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
      if(payload?.kind==='log-task')return executePayload(payload);
      if(payload?.kind==='log-action'){
        const matches=actionMatches(payload.id);
        if(matches.length>1){showExecutionError(Error('Deze actiecode is aan meerdere acties gekoppeld.'));return true;}
        if(matches.length===1){scanCode(payload.id).catch(showExecutionError);return true;}
        const storedExecutable=storedCarrierPayload(payload.id);
        if(storedExecutable)return executePayload(storedExecutable);
      }
      return originalPreview(payload);
    };
    preview.__centralScanDispatcher=true;preview.__original=originalPreview;api.preview=preview;
    return true;
  }

  function ensurePatch(){
    const codeReady=patchLogCode();
    const sharedReady=patchSharedPreview();
    if(codeReady&&sharedReady)return;
    if(patchAttempts++<240)setTimeout(ensurePatch,50);
  }

  function install(){
    const actions=window.LogLocationActions;
    if(!actions){if(attempts++<200)setTimeout(install,50);return;}
    migrateActionCodeIds();
    scanCode.__directQrAction=true;
    actions.scanCode=scanCode;
    ensurePatch();
    window.LogScanDispatcher={classify,scanCode,actionMatches,cardMatches,migrateActionCodeIds,carrierPayload,storedCarrierPayload,confirmTask};
  }

  window.addEventListener('log-time-state-change',migrateActionCodeIds);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();