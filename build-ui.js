(function(){
  'use strict';
  const BUILD='0.35';
  window.LOG_BUILD=BUILD;

  function installStyles(){
    if(document.getElementById('logBuildUiStyles'))return;
    const style=document.createElement('style');
    style.id='logBuildUiStyles';
    style.textContent=`
      .km-shell-theme-swipe-row[data-shell-theme-type="theme"],
      .km-shell-location-swipe-row,
      .code-card-swipe:has([data-card-open]),
      .code-card-swipe:has([data-la-open]){position:relative;overflow:hidden}

      .km-shell-theme-swipe-row[data-shell-theme-type="theme"]::before,
      .km-shell-location-swipe-row::before,
      .code-card-swipe:has([data-card-open])::before,
      .code-card-swipe:has([data-la-open])::before{
        content:'';
        position:absolute;
        z-index:0;
        left:0;
        top:0;
        bottom:0;
        width:78px;
        display:block;
        background-color:#34c759;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23fff' d='M17.8 6.6c-1.35-1.18-3.08-1.82-5.03-1.82-3.05 0-5.17 1.48-5.17 3.75 0 2.2 1.7 3.25 4.95 4 2.62.6 3.43 1.04 3.43 2.12 0 1.19-1.1 1.95-2.9 1.95-2.08 0-3.92-.77-5.28-2.13L5.5 16.7c1.82 1.92 4.42 3.02 7.48 3.02 3.94 0 6.52-2.02 6.52-5.18 0-2.76-1.87-4.18-5.5-5-2.42-.55-3.02-.92-3.02-1.72 0-.76.78-1.33 2.05-1.33 1.46 0 2.74.47 3.75 1.38l2.02-1.27Z'/%3E%3C/svg%3E");
        background-position:center;
        background-repeat:no-repeat;
        background-size:31px 31px;
        opacity:.8;
        pointer-events:none;
        transition:opacity .12s ease,filter .12s ease;
      }

      .km-shell-theme-swipe-row[data-shell-theme-type="theme"].log-share-armed::before,
      .km-shell-location-swipe-row.log-share-armed::before,
      .code-card-swipe.log-share-armed:has([data-card-open])::before,
      .code-card-swipe.log-share-armed:has([data-la-open])::before{opacity:1;filter:brightness(1.06)}

      .code-card-swipe:has([data-card-open])>.code-card-surface,
      .code-card-swipe:has([data-la-open])>.code-card-surface{position:relative;z-index:1}

      @media(min-width:521px){
        .km-shell-theme-swipe-row[data-shell-theme-type="theme"]::before,
        .km-shell-location-swipe-row::before,
        .code-card-swipe:has([data-card-open])::before,
        .code-card-swipe:has([data-la-open])::before{width:84px}
      }
    `;
    document.head.appendChild(style);
  }

  function render(){
    window.LOG_BUILD=BUILD;
    installStyles();
    const today=document.getElementById('today');
    if(today){
      const current=today.textContent||'';
      const next=current.replace(/ · \d+\.\d+(?:\.\d+)?$/,' · '+BUILD);
      if(next!==current)today.textContent=next;
    }
    document.querySelectorAll('.km-shell-version-number').forEach(node=>{if(node.textContent!==BUILD)node.textContent=BUILD;});
    document.querySelectorAll('.km-shell-version').forEach(node=>{const label=`Geladen versie ${BUILD}`;if(node.getAttribute('aria-label')!==label)node.setAttribute('aria-label',label);});
  }

  function init(){
    render();
    let queued=false;
    const observer=new MutationObserver(()=>{
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{queued=false;render();});
    });
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pageshow',render);
    window.addEventListener('log-shell-view-refresh',render);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
