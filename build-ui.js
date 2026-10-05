(function(){
'use strict';

const BUILD='0.40.4';
window.LOG_BUILD=BUILD;
window.LOG_TEST_BUILD=BUILD;

function installStyles(){
  if(document.getElementById('logBuildUiStyles'))return;
  const style=document.createElement('style');
  style.id='logBuildUiStyles';
  style.textContent=`
    .km-shell-theme-swipe-row[data-shell-theme-type="theme"],.km-shell-location-swipe-row,.code-card-swipe:has([data-card-open]),.code-card-swipe:has([data-la-open]){position:relative;overflow:hidden}
    .km-shell-theme-swipe-row[data-shell-theme-type="theme"]::before,.km-shell-location-swipe-row::before,.code-card-swipe:has([data-card-open])::before,.code-card-swipe:has([data-la-open])::before{content:'';position:absolute;z-index:0;left:0;top:0;bottom:0;width:78px;display:block;background-color:#34c759;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23fff' d='M17.8 6.6c-1.35-1.18-3.08-1.82-5.03-1.82-3.05 0-5.17 1.48-5.17 3.75 0 2.2 1.7 3.25 4.95 4 2.62.6 3.43 1.04 3.43 2.12 0 1.19-1.1 1.95-2.9 1.95-2.08 0-3.92-.77-5.28-2.13L5.5 16.7c1.82 1.92 4.42 3.02 7.48 3.02 3.94 0 6.52-2.02 6.52-5.18 0-2.76-1.87-4.18-5.5-5-2.42-.55-3.02-.92-3.02-1.72 0-.76.78-1.33 2.05-1.33 1.46 0 2.74.47 3.75 1.38l2.02-1.27Z'/%3E%3C/svg%3E");background-position:center;background-repeat:no-repeat;background-size:31px 31px;opacity:.8;pointer-events:none;transition:opacity .12s ease,filter .12s ease}
    .km-shell-theme-swipe-row[data-shell-theme-type="theme"].log-share-armed::before,.km-shell-location-swipe-row.log-share-armed::before,.code-card-swipe.log-share-armed:has([data-card-open])::before,.code-card-swipe.log-share-armed:has([data-la-open])::before{opacity:1;filter:brightness(1.06)}
    .code-card-swipe:has([data-card-open])>.code-card-surface,.code-card-swipe:has([data-la-open])>.code-card-surface{position:relative;z-index:1}
    .log-task-go-summary{display:flex;flex-direction:column;gap:5px;padding:4px 0 18px}.log-task-go-summary strong{font-size:20px;line-height:1.25}.log-task-go-summary span{font-size:15px;color:var(--muted,#6e6e73)}.log-task-go-button{min-height:56px;font-size:18px;font-weight:800}
    @media(min-width:521px){.km-shell-theme-swipe-row[data-shell-theme-type="theme"]::before,.km-shell-location-swipe-row::before,.code-card-swipe:has([data-card-open])::before,.code-card-swipe:has([data-la-open])::before{width:84px}}
  `;
  document.head.appendChild(style);
}

function ensureStylesheet(href,key){
  const existing=[...document.querySelectorAll('link[rel="stylesheet"]')].find(link=>link.dataset[key]==='1');
  if(existing&&existing.href.includes(`v=${BUILD}`))return existing;
  existing?.remove();
  const link=document.createElement('link');
  link.rel='stylesheet';link.href=href;link.dataset[key]='1';document.head.appendChild(link);return link;
}
function ensureScript(src,key){
  const existing=[...document.scripts].find(script=>script.dataset[key]==='1');
  if(existing&&existing.src.includes(src.split('/').pop()))return existing;
  existing?.remove();
  const script=document.createElement('script');
  script.src=src;script.async=false;script.dataset[key]='1';document.head.appendChild(script);return script;
}

function ensureCurrentModules(){
  ensureStylesheet(`./shared-page-template.css?v=${BUILD}`,'logSharedPageTemplateCss');
  ensureStylesheet(`./top-block-idle-height.css?v=${BUILD}`,'logTopIdleHeightCss');
  ensureStylesheet(`./shared-home-components.css?v=${BUILD}`,'logSharedHomeComponentsCss');
  ensureStylesheet(`./shared-shell-header.css?v=${BUILD}`,'logSharedShellHeaderCss');

  const wanted=`sharing-private-ui.js?v=${BUILD}`;
  const sharingScripts=[...document.querySelectorAll('script[data-log-sharing-ui]')];
  if(!sharingScripts.some(script=>script.src.includes(wanted))){
    sharingScripts.forEach(script=>script.remove());
    document.getElementById('kmShellPublicSettings')?.remove();
    document.querySelectorAll('.log-public-dialog,.log-share-dialog').forEach(dialog=>{try{dialog.close?.();}catch(_){}dialog.remove();});
    ensureScript(`./sharing-private-ui.js?v=${BUILD}`,'logSharingUi');
  }

  const scripts=[
    ['shared-id-separation.js','logSharedIdSeparation'],
    ['offline-share-bridge.js','logOfflineShareBridge'],
    ['qr-action-direct.js','logDirectQrAction'],
    ['task-replace-finish.js','logTaskReplaceFinish'],
    ['compact-stop-ui.js','logCompactStopUi'],
    ['period-switch-isolation.js','logPeriodSwitchIsolation'],
    ['time/active-task-layout.js','logActiveTaskLayout'],
    ['shared-home-components.js','logSharedHomeComponents'],
    ['bottom-bar-qr-swipe.js','logBottomBarQrSwipe'],
    ['location-precision-burst.js','logLocationPrecisionBurst'],
    ['identity-sync.js','logIdentitySyncBridge'],
    ['person-id-unification.js','logPersonIdUnification'],
    ['people-personcard-network-fix.js','logPeoplePersonCardNetworkFix'],
    ['person-connections-one-qr.js','logPersonConnectionsOneQr'],
    ['bare-id-router.js','logBareIdentifierRouter'],
    ['person-connections.js','logPersonConnections'],
    ['person-connections-resume-fix.js','logPersonConnectionResumeFix'],
    ['person-connections-swipe-fix.js','logPersonConnectionSwipeFix'],
    ['connection-start-fix.js','logConnectionStartFix'],
    ['person-chat-direct.js','logPersonChatDirect'],
    ['vehicle-identities.js','logVehicleIdentities'],
    ['vehicle-identities-fix.js','logVehicleIdentitiesFix'],
    ['vehicle-endpoint-prediction.js','logVehicleEndpointPrediction'],
    ['vehicle-start-input.js','logVehicleStartInput'],
    ['vehicle-start-layout.js','logVehicleStartLayout'],
    ['vehicle-ride-scope.js','logVehicleRideScope'],
    ['vehicle-delete.js','logVehicleDelete'],
    ['vehicle-module.js','logVehicleModule'],
    ['vehicle-settings-module.js','logVehicleSettingsModule'],
    ['vehicle-report-period.js','logVehicleReportPeriod'],
    ['object-id-presentation.js','logObjectIdPresentation']
  ];
  for(const [file,key] of scripts)ensureScript(`./${file}?v=${BUILD}`,key);
}

function syncVersionSurface(){
  window.LOG_BUILD=BUILD;window.LOG_TEST_BUILD=BUILD;
  document.querySelectorAll('.log-test-build-badge').forEach(node=>node.remove());
  document.querySelectorAll('.km-shell-version').forEach(node=>{
    node.querySelector('.km-shell-version-label')?.remove();
    const number=node.querySelector('.km-shell-version-number');
    if(number&&number.textContent!==BUILD)number.textContent=BUILD;
    node.setAttribute('aria-label',`Geladen versie ${BUILD}`);
  });
  const today=document.getElementById('today');
  if(today){const current=today.textContent||'',next=current.replace(/ · [^·]+$/,' · '+BUILD);if(next!==current)today.textContent=next;}
}
function render(){document.documentElement.classList.remove('log-shell-booting');installStyles();syncVersionSurface();}
function init(){render();ensureCurrentModules();window.addEventListener('pageshow',()=>{render();ensureCurrentModules();});window.addEventListener('log-shell-view-refresh',render);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
