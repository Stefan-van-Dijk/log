(function(){
  'use strict';

  const BUILD='0.35.1-test.8';
  window.LOG_TEST_BUILD=BUILD;

  function installStyles(){
    if(document.getElementById('logTestBuildUiStyles'))return;
    const style=document.createElement('style');
    style.id='logTestBuildUiStyles';
    style.textContent=`
      #kmShellSettingsButton .log-test-build-badge{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;min-height:24px;padding:4px 7px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));border-radius:8px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent);font-size:9px;font-weight:850;letter-spacing:.05em;white-space:nowrap}
      .km-shell-theme-swipe-row[data-shell-theme-type="theme"],.km-shell-location-swipe-row,.code-card-swipe:has([data-card-open]),.code-card-swipe:has([data-la-open]){position:relative;overflow:hidden}
      .km-shell-theme-swipe-row[data-shell-theme-type="theme"]::before,.km-shell-location-swipe-row::before,.code-card-swipe:has([data-card-open])::before,.code-card-swipe:has([data-la-open])::before{content:'';position:absolute;z-index:0;left:0;top:0;bottom:0;width:78px;display:block;background-color:#34c759;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23fff' d='M17.8 6.6c-1.35-1.18-3.08-1.82-5.03-1.82-3.05 0-5.17 1.48-5.17 3.75 0 2.2 1.7 3.25 4.95 4 2.62.6 3.43 1.04 3.43 2.12 0 1.19-1.1 1.95-2.9 1.95-2.08 0-3.92-.77-5.28-2.13L5.5 16.7c1.82 1.92 4.42 3.02 7.48 3.02 3.94 0 6.52-2.02 6.52-5.18 0-2.76-1.87-4.18-5.5-5-2.42-.55-3.02-.92-3.02-1.72 0-.76.78-1.33 2.05-1.33 1.46 0 2.74.47 3.75 1.38l2.02-1.27Z'/%3E%3C/svg%3E");background-position:center;background-repeat:no-repeat;background-size:31px 31px;opacity:.8;pointer-events:none;transition:opacity .12s ease,filter .12s ease}
      .km-shell-theme-swipe-row[data-shell-theme-type="theme"].log-share-armed::before,.km-shell-location-swipe-row.log-share-armed::before,.code-card-swipe.log-share-armed:has([data-card-open])::before,.code-card-swipe.log-share-armed:has([data-la-open])::before{opacity:1;filter:brightness(1.06)}
      .code-card-swipe:has([data-card-open])>.code-card-surface,.code-card-swipe:has([data-la-open])>.code-card-surface{position:relative;z-index:1}
      @media(min-width:521px){.km-shell-theme-swipe-row[data-shell-theme-type="theme"]::before,.km-shell-location-swipe-row::before,.code-card-swipe:has([data-card-open])::before,.code-card-swipe:has([data-la-open])::before{width:84px}}
    `;
    document.head.appendChild(style);
  }

  function ensureScript(src,key){if([...document.scripts].some(s=>s.dataset[key]==='1'))return;const script=document.createElement('script');script.src=src;script.async=false;script.dataset[key]='1';document.head.appendChild(script);}
  function ensureCurrentSharingUI(){
    const wanted=`sharing-private-ui.js?v=${BUILD}`;
    const scripts=[...document.querySelectorAll('script[data-log-sharing-ui]')];
    if(!scripts.some(script=>script.src.includes(wanted))){scripts.forEach(script=>script.remove());document.getElementById('kmShellPublicSettings')?.remove();document.querySelectorAll('.log-public-dialog,.log-share-dialog').forEach(dialog=>{try{dialog.close?.();}catch(_){}dialog.remove();});ensureScript(`./sharing-private-ui.js?v=${BUILD}`,'logSharingUi');}
    ensureScript(`./collaboration.js?v=${BUILD}`,'logCollaboration');
  }

  function render(){installStyles();const settings=document.getElementById('kmShellSettingsButton');if(settings){let badge=settings.querySelector('.log-test-build-badge');if(!badge){badge=document.createElement('span');badge.className='log-test-build-badge';settings.appendChild(badge);}if(badge.textContent!==`TEST ${BUILD}`)badge.textContent=`TEST ${BUILD}`;}document.querySelectorAll('.km-shell-version-number').forEach(node=>{if(node.textContent!==BUILD)node.textContent=BUILD;});document.querySelectorAll('.km-shell-version').forEach(node=>node.setAttribute('aria-label',`Geladen testversie ${BUILD}`));}
  function init(){render();ensureCurrentSharingUI();if(!document.getElementById('kmShellSettingsButton')){const observer=new MutationObserver(()=>{render();if(document.getElementById('kmShellSettingsButton'))observer.disconnect();});observer.observe(document.body,{childList:true,subtree:true});}window.addEventListener('pageshow',()=>{render();ensureCurrentSharingUI();});window.addEventListener('log-shell-view-refresh',render);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();