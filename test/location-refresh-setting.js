(function(){
  'use strict';

  const DATA_KEY='kmreg-test-v4-data';
  const CONFIG_KEY='log-test-location-refresh-v1';
  const STEPS=[
    {ms:null,label:'Automatisch',zoneLabel:'Algemeen'},
    {ms:5000,label:'5 sec'},
    {ms:10000,label:'10 sec'},
    {ms:15000,label:'15 sec'},
    {ms:30000,label:'30 sec'},
    {ms:60000,label:'1 min'},
    {ms:120000,label:'2 min'},
    {ms:300000,label:'5 min'}
  ];
  const ALLOWED=new Set(STEPS.slice(1).map(step=>step.ms));
  let pendingZoneSave=null;

  function readData(){
    try{return JSON.parse(localStorage.getItem(DATA_KEY)||'{}')||{};}catch(_){return {};}
  }

  function normalizeConfig(value){
    const zones={};
    if(value?.zones&&typeof value.zones==='object'){
      for(const [id,raw] of Object.entries(value.zones)){
        const interval=Number(raw);
        if(id&&ALLOWED.has(interval))zones[id]=interval;
      }
    }
    const global=Number(value?.globalIntervalMs);
    return {globalIntervalMs:ALLOWED.has(global)?global:null,zones};
  }

  function readConfig(){
    try{
      const raw=localStorage.getItem(CONFIG_KEY);
      if(raw!==null)return normalizeConfig(JSON.parse(raw));
    }catch(_){}
    const legacy=Number(readData()?.settings?.locationRefreshIntervalMs);
    const migrated={globalIntervalMs:ALLOWED.has(legacy)?legacy:null,zones:{}};
    try{localStorage.setItem(CONFIG_KEY,JSON.stringify(migrated));}catch(_){}
    return migrated;
  }

  function writeConfig(config,reason='setting'){
    const normalized=normalizeConfig(config);
    localStorage.setItem(CONFIG_KEY,JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('log-location-refresh-change',{detail:{reason,config:normalized}}));
  }

  function indexForMs(value){
    const numeric=Number(value);
    const index=STEPS.findIndex(step=>step.ms===numeric&&step.ms!==null);
    return index>0?index:0;
  }

  function labelFor(index,zone=false){
    const step=STEPS[Math.max(0,Math.min(STEPS.length-1,Number(index)||0))]||STEPS[0];
    return zone&&step.ms===null?step.zoneLabel:step.label;
  }

  function setRangeVisual(range,output,zone=false){
    if(!range)return;
    const index=Math.max(0,Math.min(STEPS.length-1,Number(range.value)||0));
    range.style.setProperty('--log-slider-progress',`${index/(STEPS.length-1)*100}%`);
    if(output)output.textContent=labelFor(index,zone);
  }

  function sliderMarkup(id,index,zone=false){
    return `<div class="log-location-slider-head"><label for="${id}">${zone?'Verversing in zone':'Locatie verversen'}</label><strong data-log-slider-value>${labelFor(index,zone)}</strong></div><input class="log-location-refresh-slider" id="${id}" type="range" min="0" max="${STEPS.length-1}" step="1" value="${index}" aria-label="${zone?'Verversing in locatiezone':'Locatie verversen'}"><div class="log-location-slider-scale"><span>${zone?'Algemeen':'Auto'}</span><span>30 s</span><span>5 min</span></div>`;
  }

  function installStyles(){
    if(document.getElementById('logLocationRefreshSettingStyles'))return;
    const style=document.createElement('style');
    style.id='logLocationRefreshSettingStyles';
    style.textContent=`
      .log-location-refresh-setting{margin:12px 0 15px;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
      .log-location-slider-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
      .log-location-slider-head label{color:var(--text);font-size:14px;font-weight:720}
      .log-location-slider-head strong{flex:0 0 auto;color:var(--accent);font-size:13px;font-weight:760}
      .log-location-refresh-slider{--log-slider-progress:0%;width:100%;height:32px;margin:6px 0 0;padding:0;background:transparent;accent-color:var(--accent);-webkit-appearance:none;appearance:none}
      .log-location-refresh-slider::-webkit-slider-runnable-track{height:4px;border-radius:99px;background:linear-gradient(90deg,var(--accent) 0 var(--log-slider-progress),color-mix(in srgb,var(--muted) 28%,transparent) var(--log-slider-progress) 100%)}
      .log-location-refresh-slider::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;margin-top:-9px;border:0;border-radius:50%;background:var(--surface,#fff);box-shadow:0 1px 5px rgba(0,0,0,.28),0 0 0 1px color-mix(in srgb,var(--line) 72%,transparent)}
      .log-location-refresh-slider::-moz-range-track{height:4px;border-radius:99px;background:color-mix(in srgb,var(--muted) 28%,transparent)}
      .log-location-refresh-slider::-moz-range-progress{height:4px;border-radius:99px;background:var(--accent)}
      .log-location-refresh-slider::-moz-range-thumb{width:22px;height:22px;border:0;border-radius:50%;background:var(--surface,#fff);box-shadow:0 1px 5px rgba(0,0,0,.28)}
      .log-location-slider-scale{display:flex;justify-content:space-between;margin-top:-2px;color:var(--muted);font-size:9px;font-weight:620}
      .log-location-refresh-setting small,.log-location-zone-hint{display:block;margin-top:8px;color:var(--muted);font-size:11px;line-height:1.4;font-weight:450}
      #logLocationRefreshZoneSection .log-location-refresh-setting{margin:0;padding:0;border:0;background:transparent}
      #kmShellMenuButton{overflow:visible!important}
      .log-location-check-pulse{position:absolute;z-index:3;left:50%;top:50%;width:5px;height:5px;border-radius:50%;background:var(--accent);opacity:0;pointer-events:none;transform:translate(-50%,-50%) scale(.4)}
      .log-location-check-pulse.is-pulsing{animation:logLocationCheckPulse 920ms cubic-bezier(.22,1,.36,1) both}
      @keyframes logLocationCheckPulse{0%{opacity:0;transform:translate(-50%,-50%) scale(.35);box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 35%,transparent)}22%{opacity:.72;transform:translate(calc(-50% + 2px),-50%) scale(.78);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 13%,transparent)}62%{opacity:.44;transform:translate(calc(-50% + 14px),-50%) scale(1);box-shadow:0 0 0 7px transparent}100%{opacity:0;transform:translate(calc(-50% + 24px),-50%) scale(.6);box-shadow:0 0 0 9px transparent}}
      @media(prefers-reduced-motion:reduce){.log-location-check-pulse.is-pulsing{animation:logLocationCheckPulseReduced 260ms ease-out both}@keyframes logLocationCheckPulseReduced{0%{opacity:0}35%{opacity:.65}100%{opacity:0}}}
    `;
    document.head.appendChild(style);
  }

  function syncIntro(section){
    const notice=section?.querySelector('.cards-notice');
    if(!notice)return;
    const text='Log vraagt bij openen je locatie op en ververst die zolang de app zichtbaar is volgens de gekozen frequentie. Locatiezones kunnen tijdelijk een eigen frequentie gebruiken. Er is geen locatieherkenning wanneer Log gesloten is.';
    if(notice.textContent!==text)notice.textContent=text;
  }

  function renderGlobal(){
    const section=document.querySelector('#kmShellLocationSettings section');
    if(!section)return;
    syncIntro(section);
    let box=section.querySelector('[data-log-location-refresh-setting]');
    if(!box){
      box=document.createElement('div');
      box.className='log-location-refresh-setting';
      box.dataset.logLocationRefreshSetting='1';
      const heading=section.querySelector('h3');
      if(heading)heading.insertAdjacentElement('afterend',box);else section.prepend(box);
    }
    if(!box.querySelector('.log-location-refresh-slider')){
      const index=indexForMs(readConfig().globalIntervalMs);
      box.innerHTML=`${sliderMarkup('logLocationRefreshInterval',index,false)}<small>Alleen zolang Log zichtbaar is. Automatisch gebruikt 10 seconden zonder actieve rit en 1 minuut tijdens een actieve rit. Recente locatie mag kort worden hergebruikt om batterij en warmte te beperken.</small>`;
      const range=box.querySelector('input[type="range"]'),output=box.querySelector('[data-log-slider-value]');
      setRangeVisual(range,output,false);
      range.addEventListener('input',()=>setRangeVisual(range,output,false));
      range.addEventListener('change',()=>{
        const config=readConfig(),step=STEPS[Number(range.value)]||STEPS[0];
        config.globalIntervalMs=step.ms;
        writeConfig(config,'global');
      });
    }
  }

  function renderLocationZone(){
    const form=document.getElementById('locationForm');
    if(!form||form.querySelector('#logLocationRefreshZoneSection'))return;
    const id=String(form.elements?.id?.value||'');
    const config=readConfig(),index=indexForMs(config.zones?.[id]);
    const section=document.createElement('section');
    section.id='logLocationRefreshZoneSection';
    section.className='edit-section';
    section.innerHTML=`<div class="edit-section-head"><div><strong>Locatiecontrole</strong><small>Verversing in deze locatiezone</small></div></div><div class="log-location-refresh-setting">${sliderMarkup('logLocationZoneRefreshInterval',index,true)}<span class="log-location-zone-hint">Algemeen volgt de algemene instelling. Een eigen waarde geldt wanneer je in of nabij deze locatie bent. Bij overlappende zones gebruikt Log de snelste verversing.</span></div>`;
    const useSection=[...form.querySelectorAll('.edit-section')].find(item=>/gebruik/i.test(item.querySelector('.edit-section-head strong')?.textContent||''));
    if(useSection)form.insertBefore(section,useSection);else form.appendChild(section);
    const range=section.querySelector('input[type="range"]'),output=section.querySelector('[data-log-slider-value]');
    setRangeVisual(range,output,true);
    range.addEventListener('input',()=>setRangeVisual(range,output,true));
  }

  function rememberZoneOnSave(){
    document.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-action="save-location"]');
      if(!button)return;
      const form=document.getElementById('locationForm'),range=form?.querySelector('#logLocationZoneRefreshInterval');
      if(!form||!range)return;
      const data=readData(),id=String(form.elements?.id?.value||''),before=(data.locations||[]);
      pendingZoneSave={
        id,
        beforeIds:new Set(before.map(item=>item.id)),
        beforeUpdatedAt:id?String(before.find(item=>item.id===id)?.updatedAt||''):'',
        interval:(STEPS[Number(range.value)]||STEPS[0]).ms,
        started:Date.now()
      };
      setTimeout(resolvePendingZoneSave,80);
    },true);
  }

  function resolvePendingZoneSave(){
    const pending=pendingZoneSave;
    if(!pending)return;
    const data=readData(),locations=Array.isArray(data.locations)?data.locations:[];
    let savedId='';
    if(pending.id){
      const location=locations.find(item=>item.id===pending.id);
      if(location&&String(location.updatedAt||'')!==pending.beforeUpdatedAt)savedId=pending.id;
    }else{
      savedId=locations.find(item=>!pending.beforeIds.has(item.id))?.id||'';
    }
    if(savedId){
      const config=readConfig();
      if(pending.interval===null)delete config.zones[savedId];
      else config.zones[savedId]=pending.interval;
      pendingZoneSave=null;
      writeConfig(config,'zone');
      return;
    }
    if(Date.now()-pending.started>10000){pendingZoneSave=null;return;}
    setTimeout(resolvePendingZoneSave,120);
  }

  function pruneZones(){
    const ids=new Set((readData().locations||[]).map(item=>item.id));
    const config=readConfig();
    let changed=false;
    for(const id of Object.keys(config.zones)){if(!ids.has(id)){delete config.zones[id];changed=true;}}
    if(changed)writeConfig(config,'prune');
  }

  function ensurePulse(){
    const button=document.getElementById('kmShellMenuButton');
    if(!button)return null;
    let pulse=button.querySelector('.log-location-check-pulse');
    if(!pulse){pulse=document.createElement('span');pulse.className='log-location-check-pulse';pulse.setAttribute('aria-hidden','true');button.appendChild(pulse);}
    return pulse;
  }

  function pulseLocationCheck(){
    const pulse=ensurePulse();
    if(!pulse)return;
    pulse.classList.remove('is-pulsing');
    void pulse.offsetWidth;
    pulse.classList.add('is-pulsing');
    pulse.addEventListener('animationend',()=>pulse.classList.remove('is-pulsing'),{once:true});
  }

  function sync(){installStyles();renderGlobal();renderLocationZone();ensurePulse();}

  function init(){
    readConfig();
    sync();
    rememberZoneOnSave();
    new MutationObserver(sync).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pageshow',sync);
    window.addEventListener('log-shell-view-refresh',sync);
    window.addEventListener('log-km-state-change',pruneZones);
    window.addEventListener('log-location-check-start',pulseLocationCheck);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();