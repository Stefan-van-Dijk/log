(function(){
  'use strict';

  const STYLE_ID='logSharedPageTemplateStyle';
  const GAP_PX=24;

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      :root{
        --log-template-action-height:184px;
        --log-template-action-period-gap:${GAP_PX}px;
        --log-template-card-radius:16px;
        --log-template-card-pad-x:14px;
        --log-template-card-pad-y:17px;
        --log-template-kicker-size:11px;
        --log-template-title-size:30px;
        --log-template-subtitle-size:17px;
        --log-template-button-height:50px;
        --log-template-period-top:20px;
        --log-template-period-bottom:20px;
        --log-template-summary-height:130px;
        --log-template-list-gap:16px;
        --log-template-section-title-size:20px;
        --log-template-group-size:11px;
      }

      #app.log-home-template-root,
      #main.log-home-template-root{
        --log-home-section-gap:var(--log-template-list-gap);
      }

      #app.log-home-template-root>.log-template-action,
      #main.log-home-template-root>.log-template-action{
        box-sizing:border-box!important;
        width:100%!important;
        margin:0!important;
        border:1px solid var(--line)!important;
        border-radius:var(--log-template-card-radius)!important;
        background:var(--surface,var(--card))!important;
        box-shadow:none!important;
      }

      #app.log-home-template-root>.log-template-action[data-log-template-state="idle"],
      #main.log-home-template-root>.log-template-action[data-log-template-state="idle"]{
        display:flex!important;
        min-height:var(--log-template-action-height)!important;
        height:var(--log-template-action-height)!important;
        flex-direction:column!important;
        padding:var(--log-template-card-pad-y) var(--log-template-card-pad-x)!important;
      }

      #app.log-home-template-root>.log-template-action[data-log-template-state="idle"]>.kicker,
      #main.log-home-template-root>.log-template-action[data-log-template-state="idle"]>.kicker{
        margin:0 0 8px!important;
        font-size:var(--log-template-kicker-size)!important;
        line-height:1.2!important;
        font-weight:800!important;
        letter-spacing:.08em!important;
      }

      #app.log-home-template-root>.log-template-action[data-log-template-state="idle"]>h2,
      #main.log-home-template-root>.log-template-action[data-log-template-state="idle"]>h2{
        margin:0 0 6px!important;
        font-size:var(--log-template-title-size)!important;
        line-height:1.08!important;
        font-weight:850!important;
        letter-spacing:-.035em!important;
      }

      #app.log-home-template-root>.log-template-action[data-log-template-state="idle"]>p,
      #main.log-home-template-root>.log-template-action[data-log-template-state="idle"]>p,
      #main.log-home-template-root>.log-template-action[data-log-template-state="idle"]>.home-action-subtitle{
        margin:0!important;
        color:var(--muted)!important;
        font-size:var(--log-template-subtitle-size)!important;
        line-height:1.25!important;
      }

      #app.log-home-template-root>.log-template-action[data-log-template-state="idle"]>.btn:last-child,
      #main.log-home-template-root>.log-template-action[data-log-template-state="idle"]>.btn:last-child,
      #main.log-home-template-root>.log-template-action[data-log-template-state="idle"]>#registerTaskInline{
        width:100%!important;
        min-height:var(--log-template-button-height)!important;
        height:var(--log-template-button-height)!important;
        margin:auto 0 0!important;
        border-radius:13px!important;
      }

      #app.log-home-template-root>.log-template-period:not(.period-entry-mode),
      #main.log-home-template-root>.log-template-period:not(.period-entry-mode){
        box-sizing:border-box!important;
        width:100%!important;
        margin:0!important;
        padding:var(--log-template-period-top) 0 var(--log-template-period-bottom)!important;
        border:0!important;
        border-bottom:1px solid var(--line)!important;
        border-radius:0!important;
        background:transparent!important;
        box-shadow:none!important;
      }

      #app.log-home-template-root>.log-template-period:not(.period-entry-mode) .period-nav-head,
      #main.log-home-template-root>.log-template-period:not(.period-entry-mode) .period-head{
        min-height:44px!important;
        margin:0 0 7px!important;
        align-items:center!important;
      }

      #app.log-home-template-root>.log-template-period:not(.period-entry-mode) .log-summary,
      #main.log-home-template-root>.log-template-period:not(.period-entry-mode) .log-summary{
        box-sizing:border-box!important;
        min-height:var(--log-template-summary-height)!important;
        height:var(--log-template-summary-height)!important;
        margin:14px 0 0!important;
      }

      #app.log-home-template-root>.log-template-list,
      #main.log-home-template-root>.log-template-list{
        box-sizing:border-box!important;
        width:100%!important;
        margin:var(--log-template-list-gap) 0 0!important;
        padding:0!important;
      }

      #app.log-home-template-root>.log-template-list>.section-title,
      #main.log-home-template-root>.log-template-list>.section-title{
        display:flex!important;
        min-height:24px!important;
        justify-content:flex-start!important;
        align-items:center!important;
        gap:0!important;
        margin:0 0 10px!important;
        padding:0 1px!important;
      }

      #app.log-home-template-root>.log-template-list>.section-title>:not(h2):not(h3),
      #main.log-home-template-root>.log-template-list>.section-title>:not(h2):not(h3){display:none!important}

      #app.log-home-template-root>.log-template-list>.section-title h2,
      #app.log-home-template-root>.log-template-list>.section-title h3,
      #main.log-home-template-root>.log-template-list>.section-title h2,
      #main.log-home-template-root>.log-template-list>.section-title h3{
        margin:0!important;
        font-size:var(--log-template-section-title-size)!important;
        line-height:1.2!important;
        font-weight:800!important;
        letter-spacing:-.02em!important;
      }

      #app.log-home-template-root>.log-template-list>.trip-group:first-of-type,
      #main.log-home-template-root>.log-template-list>.activity-group:first-of-type{margin-top:0!important}

      #app.log-home-template-root>.log-template-list>.trip-group:first-of-type>.trip-group-title,
      #main.log-home-template-root>.log-template-list>.activity-group:first-of-type>.activity-group-title{
        margin:0!important;
        padding:0 2px 7px!important;
        color:var(--muted)!important;
        font-size:var(--log-template-group-size)!important;
        line-height:1.2!important;
        font-weight:800!important;
        letter-spacing:.06em!important;
        text-transform:uppercase!important;
      }

      @media(max-width:360px){
        :root{
          --log-template-action-height:178px;
          --log-template-title-size:28px;
          --log-template-subtitle-size:16px;
          --log-template-summary-height:126px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function clean(root){
    if(!root)return;
    root.classList.add('log-home-template-root');
    root.querySelectorAll(':scope>.log-template-action').forEach(node=>node.classList.remove('log-template-action'));
    root.querySelectorAll(':scope>.log-template-period').forEach(node=>node.classList.remove('log-template-period'));
    root.querySelectorAll(':scope>.log-template-list').forEach(node=>node.classList.remove('log-template-list'));
  }

  function visibleBetween(action,period){
    let node=action?.nextElementSibling||null;
    while(node&&node!==period){
      const style=getComputedStyle(node);
      const rect=node.getBoundingClientRect();
      if(style.display!=='none'&&style.visibility!=='hidden'&&rect.height>.5)return true;
      node=node.nextElementSibling;
    }
    return false;
  }

  function equalizeActionPeriodGap(action,period){
    if(!action||!period||period.classList.contains('period-entry-mode'))return;
    period.style.setProperty('margin-top','0px','important');
    if(visibleBetween(action,period))return;
    requestAnimationFrame(()=>{
      if(!action.isConnected||!period.isConnected||period.classList.contains('period-entry-mode'))return;
      const current=period.getBoundingClientRect().top-action.getBoundingClientRect().bottom;
      const target=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--log-template-action-period-gap'))||GAP_PX;
      const correction=target-current;
      period.style.setProperty('margin-top',`${Math.round(correction*100)/100}px`,'important');
      period.dataset.logTemplateGap=String(target);
    });
  }

  function markRide(){
    const root=document.getElementById('app');
    if(!root)return;
    clean(root);
    const action=root.querySelector(':scope>.hero');
    if(action){
      action.classList.add('log-template-action');
      action.dataset.logTemplateState=action.classList.contains('active-hero')?'active':'idle';
    }
    const period=root.querySelector(':scope>#periodNavigator.period-navigator');
    if(period)period.classList.add('log-template-period');
    const list=[...root.querySelectorAll(':scope>.section')].find(section=>String(section.querySelector(':scope>.section-title h2,:scope>.section-title h3')?.textContent||'').trim()==='Recente ritten');
    if(list)list.classList.add('log-template-list');
    equalizeActionPeriodGap(action,period);
  }

  function markTime(){
    const root=document.getElementById('main');
    if(!root)return;
    clean(root);
    const action=root.querySelector(':scope>.suggestion,:scope>.active-card');
    if(action){
      action.classList.add('log-template-action');
      action.dataset.logTemplateState=action.classList.contains('suggestion')?'idle':'active';
    }
    const period=root.querySelector(':scope>.period-overview,:scope>.period-nav');
    if(period)period.classList.add('log-template-period');
    const list=[...root.querySelectorAll(':scope>.section')].find(section=>String(section.querySelector(':scope>.section-title h2,:scope>.section-title h3')?.textContent||'').trim()==='Registraties');
    if(list)list.classList.add('log-template-list');
    equalizeActionPeriodGap(action,period);
  }

  let queued=false;
  function sync(){
    queued=false;
    installStyle();
    markRide();
    markTime();
  }
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(sync);
  }

  function init(){
    sync();
    new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
    for(const eventName of ['pageshow','resize','orientationchange','log-shell-view-refresh','log-time-state-change','log-km-state-change'])window.addEventListener(eventName,queue);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
