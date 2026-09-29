(function(){
  'use strict';

  const BUILD='0.34.15';
  window.LOG_TEST_BUILD=BUILD;

  function installStyles(){
    if(document.getElementById('logTestBuildUiStyles'))return;
    const style=document.createElement('style');
    style.id='logTestBuildUiStyles';
    style.textContent=`
      #kmShellSettingsButton .log-test-build-badge{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;min-height:24px;padding:4px 7px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--line));border-radius:8px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent);font-size:9px;font-weight:850;letter-spacing:.05em;white-space:nowrap}
      .km-shell-theme-swipe-row[data-shell-theme-type="theme"]::before{content:'Delen';position:absolute;z-index:0;left:0;top:0;bottom:0;width:78px;display:flex;align-items:center;justify-content:center;background:#34c759;color:#fff;font-size:11px;font-weight:850;opacity:.78;pointer-events:none}
      .km-shell-theme-swipe-row[data-shell-theme-type="theme"].log-share-armed::before{opacity:1;filter:brightness(1.06)}
      @media(min-width:521px){.km-shell-theme-swipe-row[data-shell-theme-type="theme"]::before{width:84px}}
    `;
    document.head.appendChild(style);
  }

  function render(){
    installStyles();
    const settings=document.getElementById('kmShellSettingsButton');
    if(settings){
      let badge=settings.querySelector('.log-test-build-badge');
      if(!badge){
        badge=document.createElement('span');
        badge.className='log-test-build-badge';
        settings.appendChild(badge);
      }
      if(badge.textContent!==`TEST ${BUILD}`)badge.textContent=`TEST ${BUILD}`;
    }
    document.querySelectorAll('.km-shell-version-number').forEach(node=>{if(node.textContent!==BUILD)node.textContent=BUILD;});
    document.querySelectorAll('.km-shell-version').forEach(node=>node.setAttribute('aria-label',`Geladen testversie ${BUILD}`));
  }

  function init(){
    render();
    if(!document.getElementById('kmShellSettingsButton')){
      const observer=new MutationObserver(()=>{
        render();
        if(document.getElementById('kmShellSettingsButton'))observer.disconnect();
      });
      observer.observe(document.body,{childList:true,subtree:true});
    }
    window.addEventListener('pageshow',render);
    window.addEventListener('log-shell-view-refresh',render);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
