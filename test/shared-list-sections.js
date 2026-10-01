(function(){
  'use strict';

  const STYLE_ID='logSharedListSectionsStyle';

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      /* De primaire lijstsectie sluit directer aan op het periodeoverzicht. */
      #periodNavigator.log-period:not(.period-entry-mode),
      #main>.period-overview.log-period:not(.period-entry-mode){
        margin-bottom:0!important;
      }

      #app .section.log-primary-list-section,
      #main .section.log-primary-list-section{
        margin-top:16px!important;
      }

      #app .section.log-primary-list-section>.section-title.log-primary-list-head,
      #main .section.log-primary-list-section>.section-title.log-primary-list-head{
        display:flex!important;
        min-height:0!important;
        justify-content:flex-start!important;
        align-items:center!important;
        gap:0!important;
        margin:0 0 7px!important;
        padding:0 1px!important;
      }

      #app .section.log-primary-list-section>.section-title.log-primary-list-head>:not(h2):not(h3),
      #main .section.log-primary-list-section>.section-title.log-primary-list-head>:not(h2):not(h3){
        display:none!important;
      }

      #app .section.log-primary-list-section>.section-title.log-primary-list-head h2,
      #app .section.log-primary-list-section>.section-title.log-primary-list-head h3,
      #main .section.log-primary-list-section>.section-title.log-primary-list-head h2,
      #main .section.log-primary-list-section>.section-title.log-primary-list-head h3{
        margin:0!important;
        font-size:20px!important;
        font-weight:750!important;
        line-height:1.2!important;
        letter-spacing:-.02em!important;
      }

      #app .log-primary-list-section>.trip-group:first-of-type,
      #main .log-primary-list-section>.activity-group:first-of-type{
        margin-top:0!important;
      }

      #app .log-primary-list-section>.trip-group:first-of-type>.trip-group-title,
      #main .log-primary-list-section>.activity-group:first-of-type>.activity-group-title{
        padding:0 2px 7px!important;
        margin:0!important;
        color:var(--muted)!important;
        font-size:11px!important;
        font-weight:800!important;
        line-height:1.2!important;
        letter-spacing:.06em!important;
        text-transform:uppercase!important;
      }
    `;
    document.head.appendChild(style);
  }

  function normalize(root,title){
    if(!root)return;
    root.querySelectorAll(':scope>.section>.section-title').forEach(head=>{
      const heading=head.querySelector(':scope>h2,:scope>h3');
      if(String(heading?.textContent||'').trim()!==title)return;
      head.classList.add('log-primary-list-head');
      head.parentElement?.classList.add('log-primary-list-section');
    });
  }

  let queued=false;
  function sync(){
    queued=false;
    installStyle();
    normalize(document.getElementById('app'),'Recente ritten');
    normalize(document.getElementById('main'),'Registraties');
  }

  function queueSync(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(sync);
  }

  function init(){
    sync();
    new MutationObserver(queueSync).observe(document.body,{childList:true,subtree:true});
    for(const eventName of ['pageshow','log-shell-view-refresh','log-time-state-change','log-km-state-change'])window.addEventListener(eventName,queueSync);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
