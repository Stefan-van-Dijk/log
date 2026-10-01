(function(){
  'use strict';

  const STYLE_ID='logSharedHomeComponentsStyle';

  function installStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      :root{
        --log-home-card-pad-x:16px;
        --log-home-card-pad-top:17px;
        --log-home-card-pad-bottom:9px;
        --log-home-grid-gap:12px;
        --log-home-side-min:174px;
        --log-home-title-size:28px;
        --log-home-sub-size:14px;
        --log-home-meta-size:12px;
        --log-home-kicker-size:11px;
        --log-home-primary-height:50px;
        --log-home-secondary-height:40px;
        --log-home-period-top:20px;
        --log-home-period-bottom:20px;
        --log-home-section-gap:26px;
      }

      .log-active-card{
        padding:var(--log-home-card-pad-top) var(--log-home-card-pad-x) var(--log-home-card-pad-bottom)!important;
        margin:0!important;
        border:1px solid var(--line)!important;
        border-radius:16px!important;
        background:var(--surface,var(--card))!important;
        box-shadow:none!important;
      }
      .log-active-primary{
        display:grid!important;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;
        gap:var(--log-home-grid-gap)!important;
        align-items:stretch!important;
        min-height:var(--log-home-side-min)!important;
        margin:0!important;
      }
      .log-active-details{
        display:flex!important;
        min-width:0!important;
        flex-direction:column!important;
      }
      .log-active-details>.kicker{
        margin:0 0 8px!important;
        font-size:var(--log-home-kicker-size)!important;
        line-height:1.2!important;
        font-weight:800!important;
        letter-spacing:.07em!important;
      }
      .log-active-details>h2,
      .log-active-details>.active-route{
        margin:0 0 4px!important;
        font-size:clamp(22px,6vw,var(--log-home-title-size))!important;
        line-height:1.08!important;
        letter-spacing:-.03em!important;
      }
      .log-active-details>.suggestion-sub{
        margin:0 0 8px!important;
        color:var(--muted)!important;
        font-size:var(--log-home-sub-size)!important;
        line-height:1.25!important;
      }
      .log-active-details>.active-meta{
        display:flex!important;
        flex-direction:column!important;
        align-items:flex-start!important;
        gap:6px!important;
        margin:0!important;
        font-size:var(--log-home-meta-size)!important;
        line-height:1.25!important;
      }
      .log-active-details>.active-meta .status,
      .log-active-details>.active-meta>span{font-size:var(--log-home-meta-size)!important}
      .log-active-details>.timer-clock{
        margin:auto 0 0!important;
        padding-top:10px!important;
        text-align:left!important;
        font-size:clamp(34px,10vw,52px)!important;
        line-height:1!important;
        letter-spacing:-.045em!important;
      }

      .log-active-side{
        display:flex!important;
        min-height:var(--log-home-side-min)!important;
        margin:0!important;
        border:1px solid var(--line)!important;
        border-radius:15px!important;
        background:var(--surface2,var(--card2))!important;
        overflow:hidden!important;
        box-shadow:none!important;
      }
      .log-active-side>.detour-action,
      .log-active-side>.time-note-action{
        display:flex!important;
        flex:1!important;
        flex-direction:column!important;
        align-items:center!important;
        justify-content:center!important;
        gap:8px!important;
        width:100%!important;
        padding:12px 10px!important;
        border:0!important;
        background:transparent!important;
        color:var(--text)!important;
        text-align:center!important;
      }
      .log-active-side .detour-symbol,
      .log-active-side .time-note-symbol{
        display:grid!important;
        place-items:center!important;
        width:48px!important;
        height:48px!important;
        border-radius:14px!important;
        background:color-mix(in srgb,var(--accent) 10%,transparent)!important;
        color:var(--accent)!important;
      }
      .log-active-side .detour-copy,
      .log-active-side .time-note-copy{font-size:15px!important;font-weight:750!important;line-height:1.15!important}
      .log-active-side .detour-total,
      .log-active-side .time-note-meta{max-width:100%!important;color:var(--muted)!important;font-size:11px!important;line-height:1.25!important}
      .log-active-side.time-summary-panel{flex-direction:column!important;justify-content:center!important;padding:12px!important}

      .log-primary-action{width:100%!important;min-height:var(--log-home-primary-height)!important;margin:12px 0 0!important;border-radius:13px!important}
      .log-secondary-actions{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(96px,1fr))!important;gap:6px!important;margin:2px 0 0!important}
      .log-secondary-actions>.btn,
      .log-secondary-actions>.ride-tool,
      .log-secondary-actions>button{
        min-height:var(--log-home-secondary-height)!important;
        margin:0!important;
        padding:7px 4px!important;
        border:0!important;
        border-radius:10px!important;
        background:transparent!important;
        color:var(--muted)!important;
        box-shadow:none!important;
        font-size:12px!important;
        font-weight:650!important;
      }
      .log-secondary-actions>.btn:active,
      .log-secondary-actions>.ride-tool:active,
      .log-secondary-actions>button:active{background:color-mix(in srgb,var(--surface2,var(--card2)) 70%,transparent)!important;color:var(--text)!important}

      .log-period:not(.period-entry-mode){
        margin:0 0 18px!important;
        padding:var(--log-home-period-top) 0 var(--log-home-period-bottom)!important;
        border:0!important;
        border-bottom:1px solid var(--line)!important;
        border-radius:0!important;
        background:transparent!important;
        box-shadow:none!important;
      }
      .log-period:not(.period-entry-mode) .period-nav-head,
      .log-period:not(.period-entry-mode) .period-head{min-height:44px!important;margin:0 0 7px!important;align-items:center!important}
      .log-period:not(.period-entry-mode) .period-center{gap:4px!important;padding:0!important}
      .log-period:not(.period-entry-mode) .period-center strong{font-size:25px!important;line-height:1.12!important;letter-spacing:-.025em!important}
      .log-period:not(.period-entry-mode) .period-center small{margin-top:2px!important;font-size:11px!important;line-height:1.25!important}
      .log-period:not(.period-entry-mode) .mini,
      .log-period:not(.period-entry-mode) .period-arrow,
      .log-period:not(.period-entry-mode) .period-scale-button{
        width:40px!important;height:40px!important;padding:0!important;border:0!important;border-radius:50%!important;background:transparent!important;color:var(--muted)!important;box-shadow:none!important;font-size:24px!important
      }

      .log-summary{
        min-height:126px!important;
        margin:14px 0 0!important;
        overflow:hidden!important;
        border:1px solid var(--line)!important;
        border-radius:16px!important;
        background:var(--surface,var(--card))!important;
        box-shadow:none!important;
      }
      .log-summary .summary-head,
      .log-summary .summary-main{
        display:flex!important;min-height:78px!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:4px!important;padding:14px 12px 4px!important;text-align:center!important
      }
      .log-summary[data-log-summary-kind="ride"] .summary-label{display:none!important}
      .log-summary[data-log-summary-kind="ride"] .summary-total{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:4px!important;margin:0!important}
      .log-summary[data-log-summary-kind="time"] .summary-main{flex-direction:column-reverse!important}
      .log-summary .summary-total strong,
      .log-summary .summary-value{margin:0!important;font-size:40px!important;font-weight:850!important;line-height:1!important;letter-spacing:-.045em!important}
      .log-summary .summary-total small,
      .log-summary .summary-label{margin:0!important;color:var(--muted)!important;font-size:11px!important;font-weight:650!important;line-height:1.2!important;letter-spacing:0!important;text-transform:none!important}
      .log-summary .summary-parts{display:flex!important;justify-content:center!important;gap:20px!important;flex-wrap:wrap!important;padding:8px 12px 13px!important;border:0!important}
      .log-summary .summary-part{flex:0 0 auto!important;padding:0!important;border:0!important;text-align:center!important}
      .log-summary .summary-part span,
      .log-summary .summary-part strong{display:inline!important;font-size:11px!important;line-height:1.2!important}
      .log-summary .summary-part strong{margin:0 0 0 4px!important;font-size:12px!important}

      .log-list-section{margin-top:var(--log-home-section-gap)!important}
      .log-section-head{min-height:28px!important;margin:0 0 9px!important;padding:0 1px!important;align-items:center!important}
      .log-section-head h2,
      .log-section-head h3{margin:0!important;font-size:20px!important;font-weight:750!important;line-height:1.2!important;letter-spacing:-.02em!important}
      .log-section-head>.muted,
      .log-section-head>span{font-size:12px!important}

      @media(max-width:360px){
        :root{--log-home-grid-gap:8px;--log-home-side-min:164px}
        .log-active-side .detour-symbol,.log-active-side .time-note-symbol{width:44px!important;height:44px!important}
        .log-active-side.time-summary-panel{padding:9px!important}
        .log-secondary-actions{grid-template-columns:repeat(auto-fit,minmax(82px,1fr))!important}
      }
    `;
    document.head.appendChild(style);
  }

  function mark(node,...classes){
    if(!node)return null;
    for(const name of classes)if(name)node.classList.add(name);
    return node;
  }

  function markTemplateRoot(root){
    if(root)root.classList.add('log-home-template-root');
  }

  function markPrimaryList(root,title){
    const section=[...root.querySelectorAll(':scope>.section')].find(item=>String(item.querySelector(':scope>.section-title h2,:scope>.section-title h3')?.textContent||'').trim()===title);
    if(!section)return;
    mark(section,'log-template-list','log-list-section');
    mark(section.querySelector(':scope>.section-title'),'log-section-head');
  }

  function markRide(){
    const root=document.getElementById('app');
    if(!root)return;
    markTemplateRoot(root);

    const templateAction=root.querySelector(':scope>.hero');
    if(templateAction){
      mark(templateAction,'log-template-action');
      templateAction.dataset.logTemplateState=templateAction.classList.contains('active-hero')?'active':'idle';
    }

    const card=root.querySelector(':scope>.hero.active-hero');
    if(card){
      mark(card,'log-active-card');
      mark(card.querySelector('.active-primary'),'log-active-primary');
      mark(card.querySelector('.active-details'),'log-active-details');
      mark(card.querySelector('.detour-panel'),'log-active-side');
      mark(card.querySelector('.arrival-main'),'log-primary-action');
      mark(card.querySelector('.ride-tools'),'log-secondary-actions');
    }

    const period=root.querySelector('#periodNavigator.period-navigator');
    if(period){
      mark(period,'log-period','log-template-period');
      const summary=period.querySelector(':scope>.summary');
      if(summary){mark(summary,'log-summary');summary.dataset.logSummaryKind='ride';}
    }
    markPrimaryList(root,'Recente ritten');
  }

  function markTime(){
    const root=document.getElementById('main');
    if(!root)return;
    markTemplateRoot(root);

    const templateAction=root.querySelector(':scope>.suggestion,:scope>.active-card');
    if(templateAction){
      mark(templateAction,'log-template-action');
      templateAction.dataset.logTemplateState=templateAction.classList.contains('suggestion')?'idle':'active';
    }

    const card=root.querySelector(':scope>.active-card.time-task-zone');
    if(card){
      mark(card,'log-active-card');
      mark(card.querySelector('.time-active-primary'),'log-active-primary');
      mark(card.querySelector('.time-active-details'),'log-active-details');
      mark(card.querySelector('.time-note-panel,.time-summary-panel'),'log-active-side');
      mark(card.querySelector('#stopTimer,#finishPending'),'log-primary-action');
      mark(card.querySelector('.time-active-tools'),'log-secondary-actions');
    }

    const period=root.querySelector('.period-overview');
    if(period){
      mark(period,'log-period','log-template-period');
      const summary=period.querySelector('.period-summary');
      if(summary){mark(summary,'log-summary');summary.dataset.logSummaryKind='time';}
    }
    markPrimaryList(root,'Registraties');
  }

  let queued=false;
  function sync(){
    queued=false;
    installStyles();
    markRide();
    markTime();
  }
  function queueSync(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(sync);
  }

  function init(){
    sync();
    const observer=new MutationObserver(queueSync);
    observer.observe(document.body,{childList:true,subtree:true});
    for(const eventName of ['pageshow','log-shell-view-refresh','log-time-state-change','log-km-state-change'])window.addEventListener(eventName,queueSync);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
