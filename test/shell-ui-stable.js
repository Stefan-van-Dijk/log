(function(){
  'use strict';

  const BUILD=(()=>{
    try{
      const script=document.currentScript||[...document.scripts].find(item=>item.src.includes('shell-ui-stable.js'));
      return window.LOG_TEST_BUILD||new URL(script?.src||location.href).searchParams.get('v')||'0.31.10-test.112';
    }catch(_){return window.LOG_TEST_BUILD||'0.31.10-test.112';}
  })();
  const DATA_KEY='kmreg-test-v4-data';
  const SECTION_KEY='kmreg-test-shell-section-v1';
  let gps={status:'idle',lat:null,lng:null,accuracy:null,matchedId:null,matchedRootId:null,distance:null,nearestId:null,nearestDistance:null,updatedAt:0,error:''};
  let gpsPending=false;
  let moduleNavObserver=null;
  let sectionRecoveryPending=false;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  function readData(){
    try{
      const parsed=JSON.parse(localStorage.getItem(DATA_KEY)||'{}');
      return {
        settings:parsed.settings&&typeof parsed.settings==='object'?parsed.settings:{},
        locations:Array.isArray(parsed.locations)?parsed.locations:[],
        trips:Array.isArray(parsed.trips)?parsed.trips:[],
        events:Array.isArray(parsed.events)?parsed.events:[]
      };
    }catch(_){return {settings:{},locations:[],trips:[],events:[]};}
  }

  function enabledModuleIds(){
    const settings=readData().settings;
    const configured=settings.navigationModules;
    const showBottomBar=settings.bottomBarEnabled!==false;
    if(Array.isArray(configured)&&configured.length)return new Set(configured.filter(item=>{
      if(!item)return false;
      if(!item.placement)return item.enabled!==false;
      const inMenu=item.placement==='menu'||item.placement==='both';
      const inBottom=item.placement==='bottom'||item.placement==='both';
      return inMenu||(showBottomBar&&inBottom);
    }).map(item=>String(item.id||'')).filter(Boolean));
    const navIds=$$('#kmShellDrawerNav [data-shell-section],#kmShellTabBar [data-shell-tab]').map(button=>button.dataset.shellSection||button.dataset.shellTab).filter(Boolean);
    if(navIds.length)return new Set(navIds);
    return new Set(['rides','time','locations','themes']);
  }

  function ensureEnabledSection(){
    if(sectionRecoveryPending)return;
    const enabled=enabledModuleIds();
    const current=localStorage.getItem(SECTION_KEY);
    if(!current||enabled.has(current)||!enabled.size)return;
    const fallback=enabled.values().next().value;
    if(!fallback)return;
    sectionRecoveryPending=true;
    localStorage.setItem(SECTION_KEY,fallback);
    window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section:fallback}}));
    setTimeout(()=>{sectionRecoveryPending=false;},0);
  }

  function syncModuleDependentSettings(){
    const content=$('#kmShellSettingsContent');
    if(!content||content.dataset.mode!=='general')return;
    const enabled=enabledModuleIds();
    const accordions=$$('.km-shell-settings-accordion[data-settings-target]',content);
    let visible=0;
    for(const accordion of accordions){
      const show=enabled.has(accordion.dataset.settingsTarget);
      accordion.hidden=!show;
      accordion.style.display=show?'':'none';
      if(show)visible++;
      else if(accordion.open)accordion.open=false;
    }
    const heading=$('#kmShellRegistrationSettingsTitle',content);
    const group=heading?.closest('.km-shell-settings-group');
    if(group)group.hidden=visible===0;
    syncSettingsSummaries();
  }

  function bindModuleSettingsSync(){
    const nav=$('#kmShellDrawerNav');
    if(nav&&!moduleNavObserver){
      moduleNavObserver=new MutationObserver(()=>{
        ensureEnabledSection();
        syncModuleDependentSettings();
      });
      moduleNavObserver.observe(nav,{childList:true});
    }
    ensureEnabledSection();
    syncModuleDependentSettings();
  }

  function section(){
    const value=localStorage.getItem(SECTION_KEY);
    return ['rides','time','locations','themes'].includes(value)?value:(document.body.classList.contains('time-mode')?'time':'rides');
  }

  function installCss(){
    if($('#kmStable0313Style'))return;
    const style=document.createElement('style');
    style.id='kmStable0313Style';
    style.textContent=`
      .top.km-shell-top{position:sticky!important;top:0!important;z-index:40!important;display:grid!important;grid-template-columns:44px minmax(0,1fr) 44px!important;align-items:center!important;gap:8px!important;margin:0 -16px 8px!important;padding:calc(env(safe-area-inset-top) + 8px) 12px 10px!important;min-height:calc(env(safe-area-inset-top) + 68px)!important;border-bottom:.5px solid color-mix(in srgb,var(--line) 72%,transparent)!important;background:color-mix(in srgb,var(--bg) 88%,transparent)!important;-webkit-backdrop-filter:blur(24px) saturate(180%)!important;backdrop-filter:blur(24px) saturate(180%)!important}
      .km-shell-top>.km-shell-top-spacer{display:block!important;grid-column:1;width:44px!important;height:44px!important}
      .km-shell-top-copy{grid-column:2;grid-row:1;align-self:center;min-width:0;padding:0!important;text-align:center!important;overflow:hidden!important}
      .km-shell-top-copy .eyebrow{display:none!important}
      .km-shell-title{margin:0!important;font-size:24px!important;line-height:1.08!important;font-weight:780!important;letter-spacing:-.025em!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .km-shell-meta{margin:4px 0 0!important;color:var(--muted)!important;font-size:11px!important;line-height:1.2!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .km-shell-menu-button,.km-shell-search-toggle{z-index:42!important;top:calc(env(safe-area-inset-top) + 8px)!important;width:44px!important;height:44px!important;border:1px solid color-mix(in srgb,var(--line) 82%,transparent)!important;border-radius:50%!important;background:color-mix(in srgb,var(--bg) 82%,transparent)!important;color:var(--accent)!important;box-shadow:0 5px 18px rgba(0,0,0,.14)!important;-webkit-backdrop-filter:blur(18px) saturate(165%);backdrop-filter:blur(18px) saturate(165%)}
      .km-shell-menu-button{position:fixed!important;left:max(12px,calc((100vw - 760px)/2 + 12px))!important}
      .km-shell-search-toggle{position:absolute!important;right:12px!important}
      body.km-shell-scrolled .top.km-shell-top{min-height:calc(env(safe-area-inset-top) + 60px)!important;padding-top:calc(env(safe-area-inset-top) + 8px)!important;padding-bottom:8px!important}
      body.km-shell-scrolled .km-shell-title{font-size:18px!important;letter-spacing:-.015em!important}
      body.km-shell-scrolled .km-shell-meta{height:0;margin:0!important;opacity:0;overflow:hidden}
      .km-shell-search{top:calc(env(safe-area-inset-top) + 60px)!important}
      .shell>#timeModuleRoot{position:relative!important;z-index:0!important}.km-shell-drawer-open .shell>#timeModuleRoot{pointer-events:none!important}
      .editor-nav{position:static!important;top:auto!important;background:transparent!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
      .editor-back{position:fixed!important;z-index:92!important;top:calc(env(safe-area-inset-top) + 10px);left:max(12px,calc((100vw - 820px)/2 + 12px))}
      .editor-nav-actions{position:fixed!important;z-index:92!important;top:calc(env(safe-area-inset-top) + 10px);right:max(12px,calc((100vw - 820px)/2 + 12px));margin:0!important}
      .km-current-status{margin:0 0 12px;padding:9px 1px 11px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px;line-height:1.4}
      .km-current-status.good{padding:10px 12px;border:1px solid color-mix(in srgb,var(--good) 34%,var(--line));border-radius:12px;background:color-mix(in srgb,var(--good) 10%,transparent);color:var(--good);font-weight:750}
      .km-current-status.good::before{content:'✓';display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-right:7px;border-radius:50%;background:var(--good);color:var(--bg);font-size:11px;font-weight:900}
      .km-current-status.warn{color:var(--warn)}
      .km-shell-location-node.km-current-location>.km-shell-location-swipe-row .km-shell-location-row{background:color-mix(in srgb,var(--accent) 8%,transparent)}
      .km-shell-location-node.km-current-location-parent>.km-shell-location-swipe-row .km-shell-location-row{background:color-mix(in srgb,var(--accent) 5%,transparent)}
      .km-shell-location-node.km-current-location>.km-shell-location-swipe-row .km-shell-location-icon,.km-shell-location-node.km-current-location-parent>.km-shell-location-swipe-row .km-shell-location-icon{border-color:color-mix(in srgb,var(--accent) 55%,var(--line));color:var(--accent)}
      .km-shell-location-node.km-current-location>.km-shell-location-swipe-row .km-shell-location-copy strong::after{content:' · hier';color:var(--accent);font-size:10px;font-weight:800}
      .km-shell-location-node.km-current-location-parent>.km-shell-location-swipe-row .km-shell-location-copy strong::after{content:' · hoofdlocatie';color:var(--accent);font-size:10px;font-weight:800}
      .km-shell-settings-panel-host>#app details.accordion.km-shell-settings-single>summary{display:none!important}
      @media(prefers-color-scheme:light){.km-shell-menu-button,.km-shell-search-toggle{background:rgba(255,255,255,.82)!important;box-shadow:0 5px 18px rgba(30,45,65,.11)!important}}
    `;
    document.head.appendChild(style);
  }

  function updateVersion(){
    const today=$('#today');
    const shellVersion=$('.km-shell-version-number');
    const shellBadge=$('.km-shell-version');
    if(shellVersion&&shellVersion.textContent!==BUILD)shellVersion.textContent=BUILD;
    if(shellBadge)shellBadge.setAttribute('aria-label',`Geladen testversie ${BUILD}`);
    if(!today)return;
    const date=new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
    const value=`${date} · ${BUILD}`;
    if(today.textContent!==value)today.textContent=value;
  }

  function byId(id,snapshot){return snapshot.locations.find(x=>String(x.id)===String(id))||null;}

  function rootFor(location,snapshot){
    let current=location;
    const seen=new Set();
    while(current?.parentId&&!seen.has(current.id)){
      seen.add(current.id);
      const parent=byId(current.parentId,snapshot);
      if(!parent)break;
      current=parent;
    }
    return current||location;
  }

  function coordsFor(location,snapshot){
    let current=location;
    const seen=new Set();
    while(current&&!seen.has(current.id)){
      seen.add(current.id);
      const lat=Number(current.lat),lng=Number(current.lng);
      if(Number.isFinite(lat)&&Number.isFinite(lng))return {lat,lng};
      current=current.parentId?byId(current.parentId,snapshot):null;
    }
    return null;
  }

  function distance(a,b){
    const R=6371000,rad=v=>v*Math.PI/180;
    const dLat=rad(b.lat-a.lat),dLng=rad(b.lng-a.lng),lat1=rad(a.lat),lat2=rad(b.lat);
    const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }

  function radius(snapshot){
    const candidates=[snapshot.settings.recognitionRadius,snapshot.settings.locationRecognitionRadius,snapshot.settings.locationRadius,snapshot.settings.radiusMeters];
    const found=candidates.map(Number).find(v=>Number.isFinite(v)&&v>0);
    return found||500;
  }

  function formatDistance(m){return !Number.isFinite(m)?'':m<1000?`${Math.round(m)} m`:`${(m/1000).toLocaleString('nl-NL',{maximumFractionDigits:1})} km`;}

  function syncSettingsSummaries(){
    const content=$('#kmShellSettingsContent');
    if(!content||content.dataset.mode!=='general')return;
    const snapshot=readData();
    const locationSummary=$('#kmShellLocationSettings .km-shell-settings-accordion-title small',content);
    if(locationSummary){
      const deleteEnabled=snapshot.settings.locationDeleteEnabled!==false;
      locationSummary.textContent=`Herkenning ${Math.round(radius(snapshot))} m · verwijderen ${deleteEnabled?'aan':'uit'}`;
    }
    const duplicate=content.querySelector('#kmShellLocationSettings .km-shell-settings-panel-host>#app details.accordion.km-shell-settings-single>summary');
    if(duplicate)duplicate.hidden=true;
  }

  function decorateTripGpsCounts(){
    if(section()!=='rides')return;
    $$('.trip-entry.expanded').forEach(entry=>{
      const details=$('.trip-inline-details',entry),grid=details?$('.trip-inline-grid',details):null;
      if(!details||!grid)return;
      const legacy=$('.trip-inline-meta',details),match=legacy?.textContent?.match(/^\s*(\d+)/),count=match?Number(match[1]):0;
      let item=$('.trip-inline-gps-count',grid);
      if(!item){
        item=document.createElement('div');
        item.className='trip-inline-item trip-inline-gps-count';
        item.innerHTML='<span>GPS-punten</span><strong>0</strong>';
        grid.appendChild(item);
      }
      const value=$('strong',item);
      if(value&&value.textContent!==String(count))value.textContent=String(count);
      if(legacy)legacy.hidden=true;
    });
  }

  function analyzePosition(position){
    const snapshot=readData();
    const point={lat:position.coords.latitude,lng:position.coords.longitude};
    const candidates=snapshot.locations.map(location=>{
      const coords=coordsFor(location,snapshot);
      if(!coords)return null;
      return {location,root:rootFor(location,snapshot),distance:distance(point,coords),own:Number.isFinite(Number(location.lat))&&Number.isFinite(Number(location.lng))};
    }).filter(Boolean).sort((a,b)=>a.distance-b.distance||Number(b.own)-Number(a.own)||Number(Boolean(b.location.parentId))-Number(Boolean(a.location.parentId)));
    const nearest=candidates[0]||null;
    const matched=nearest&&nearest.distance<=radius(snapshot)?nearest:null;
    gps={
      status:'ready',lat:point.lat,lng:point.lng,accuracy:Number(position.coords.accuracy)||null,
      matchedId:matched?.location.id||null,matchedRootId:matched?.root.id||null,distance:matched?.distance??null,
      nearestId:nearest?.location.id||null,nearestDistance:nearest?.distance??null,updatedAt:Date.now(),error:''
    };
    decorateLocations();
  }

  function requestGps(force=false){
    if(section()!=='locations'||!document.body.classList.contains('km-shell-locations-mode'))return;
    if(gpsPending)return;
    if(!force&&gps.updatedAt&&Date.now()-gps.updatedAt<60000){decorateLocations();return;}
    if(!navigator.geolocation){gps={...gps,status:'error',error:'GPS is niet beschikbaar.',updatedAt:Date.now()};decorateLocations();return;}
    gpsPending=true;
    gps={...gps,status:'loading',error:''};
    decorateLocations();
    navigator.geolocation.getCurrentPosition(
      pos=>{gpsPending=false;analyzePosition(pos);},
      err=>{gpsPending=false;gps={...gps,status:'error',error:err.code===1?'Geen locatietoestemming.':'Huidige locatie kon niet worden bepaald.',updatedAt:Date.now()};decorateLocations();},
      {enableHighAccuracy:true,timeout:12000,maximumAge:30000}
    );
  }

  function decorateLocations(){
    if(section()!=='locations')return;
    const view=$('#kmShellLocationsView');
    if(!view||view.hidden)return;
    const snapshot=readData();
    let status=$('#kmStableCurrentStatus',view);
    if(!status){
      status=document.createElement('div');
      status.id='kmStableCurrentStatus';
      status.className='km-current-status';
      $('.km-shell-location-actions',view)?.insertAdjacentElement('afterend',status);
    }
    $$('.km-shell-location-node',view).forEach(node=>node.classList.remove('km-current-location','km-current-location-parent'));
    status.className='km-current-status';
    if(gps.status==='loading'||gps.status==='idle')status.textContent='Huidige locatie wordt bepaald…';
    else if(gps.status==='error'){status.classList.add('warn');status.textContent=gps.error;}
    else{
      const matched=gps.matchedId?byId(gps.matchedId,snapshot):null;
      const nearest=gps.nearestId?byId(gps.nearestId,snapshot):null;
      if(matched){
        status.classList.add('good');
        const parent=matched.parentId?byId(matched.parentId,snapshot):null;
        const children=!parent?snapshot.locations.filter(location=>String(location.parentId||'')===String(matched.id)):[];
        const locationLabel=parent?`${parent.name} › ${matched.name}`:matched.name;
        const childLabel=children.length?` · sublocaties: ${children.map(location=>location.name).join(', ')}`:'';
        status.textContent=`Huidige locatie: ${locationLabel}${childLabel} · ${formatDistance(gps.distance)}${gps.accuracy?` · GPS ±${Math.round(gps.accuracy)} m`:''}`;
        const matchedNode=view.querySelector(`[data-shell-location-node="${CSS.escape(String(gps.matchedId))}"]`);
        const rootNode=view.querySelector(`[data-shell-location-node="${CSS.escape(String(gps.matchedRootId))}"]`);
        matchedNode?.classList.add('km-current-location');
        if(rootNode&&rootNode!==matchedNode)rootNode.classList.add('km-current-location-parent');
      }else if(nearest){
        status.textContent=`Geen locatie binnen ${formatDistance(radius(snapshot))}. Dichtstbij: ${nearest.name} · ${formatDistance(gps.nearestDistance)}.`;
      }else status.textContent='Geen opgeslagen locatie met GPS-coördinaten.';
    }
  }

  function init(){
    installCss();
    updateVersion();
    bindModuleSettingsSync();
    syncSettingsSummaries();
    decorateTripGpsCounts();
    if(section()==='locations')requestGps(false);

    document.addEventListener('click',event=>{
      if(event.target.closest('[data-shell-current-location]'))requestGps(true);
      if(event.target.closest('[data-action="location-sort"]'))setTimeout(decorateLocations,0);
      setTimeout(()=>{updateVersion();bindModuleSettingsSync();syncSettingsSummaries();decorateTripGpsCounts();if(section()==='locations')requestGps(false);},0);
    },{passive:true});

    document.addEventListener('change',event=>{
      if(event.target.closest?.('[data-module-toggle]'))setTimeout(()=>{ensureEnabledSection();syncModuleDependentSettings();},0);
      setTimeout(syncSettingsSummaries,0);
    },{passive:true});

    document.addEventListener('input',()=>setTimeout(syncSettingsSummaries,0),{passive:true});
    window.addEventListener('log-navigation-modules-change',()=>setTimeout(()=>{ensureEnabledSection();syncModuleDependentSettings();syncSettingsSummaries();},0));
    window.addEventListener('log-km-state-change',()=>setTimeout(decorateTripGpsCounts,0));
    window.addEventListener('log-shell-view-refresh',()=>{
      if(section()==='rides')setTimeout(decorateTripGpsCounts,0);
      if(section()==='locations')setTimeout(()=>{requestGps(false);decorateLocations();},0);
    });
    window.addEventListener('storage',event=>{
      if(event.key===DATA_KEY){decorateLocations();decorateTripGpsCounts();ensureEnabledSection();syncModuleDependentSettings();syncSettingsSummaries();}
    });
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&section()==='locations')requestGps(true);});

    const observer=new MutationObserver(()=>{
      updateVersion();
      bindModuleSettingsSync();
      ensureEnabledSection();
      syncModuleDependentSettings();
      syncSettingsSummaries();
      decorateTripGpsCounts();
      if(section()==='locations'&&document.body.classList.contains('km-shell-locations-mode')){
        requestGps(false);
        decorateLocations();
      }
    });
    // Alleen wisselingen van de hoofdweergave volgen. Een brede subtree-observer
    // zou de eigen tekst- en locatie-updates opnieuw waarnemen en iOS blokkeren.
    observer.observe(document.body,{attributes:true,attributeFilter:['class']});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
