(function(){
  'use strict';

  const ARM_DISTANCE=8;
  const OPEN_DISTANCE=36;
  const MAX_VERTICAL=30;
  const CLICK_SUPPRESS_MS=460;
  let gesture=null;
  let suppressClickUntil=0;
  let boundBar=null;

  const scanIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M21 16v4a1 1 0 0 1-1 1h-4M8 21H4a1 1 0 0 1-1-1v-4"/><rect x="8" y="8" width="3" height="3" rx=".35"/><rect x="14" y="8" width="2" height="2" rx=".3"/><rect x="8" y="14" width="2" height="2" rx=".3"/><path d="M14 14h3v3h-3z"/></svg>`;

  function actionWidth(){
    return window.innerWidth<=520?78:84;
  }

  function installStyles(){
    if(document.getElementById('logBottomBarQrSwipeStyles'))return;
    const style=document.createElement('style');
    style.id='logBottomBarQrSwipeStyles';
    style.textContent=`
      #kmShellTabBar.km-shell-tabbar{
        bottom:max(6px,calc(env(safe-area-inset-bottom) - 6px))!important;
        touch-action:pan-y;
      }
      #logBottomQrSwipeAction{
        position:fixed;
        z-index:79;
        display:flex;
        align-items:stretch;
        justify-content:flex-start;
        overflow:hidden;
        pointer-events:none;
        opacity:0;
        transition:opacity .12s ease;
      }
      #logBottomQrSwipeAction.is-visible{opacity:1;pointer-events:auto}
      #logBottomQrSwipeAction button{
        width:var(--log-bottom-scan-action-width,78px);
        flex:0 0 var(--log-bottom-scan-action-width,78px);
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:3px;
        padding:0;
        border:0;
        border-radius:0;
        background:var(--log-reactivate,#198754);
        color:#fff;
        font:inherit;
        font-size:10px;
        font-weight:750;
        line-height:1;
        filter:brightness(.82);
        transition:filter .15s ease;
        cursor:pointer;
        -webkit-tap-highlight-color:transparent;
      }
      #logBottomQrSwipeAction.is-open button{filter:brightness(1.08)}
      #logBottomQrSwipeAction svg{
        width:27px;
        height:27px;
        display:block;
        fill:none;
        stroke:currentColor;
        stroke-width:1.8;
        stroke-linecap:round;
        stroke-linejoin:round;
      }
      #kmShellTabBar.log-qr-swipe-dragging{
        transform:translateX(calc(-50% + var(--log-qr-swipe-x,0px)))!important;
        transition:none!important;
      }
      #kmShellTabBar.log-qr-swipe-open{
        transform:translateX(calc(-50% + var(--log-qr-swipe-open-x,78px)))!important;
        transition:transform .18s cubic-bezier(.2,.8,.2,1)!important;
      }
      #kmShellTabBar.log-qr-swipe-settling{
        transform:translateX(-50%)!important;
        transition:transform .18s ease!important;
      }
      @media(prefers-reduced-motion:reduce){
        #logBottomQrSwipeAction,#logBottomQrSwipeAction button,#kmShellTabBar.log-qr-swipe-open,#kmShellTabBar.log-qr-swipe-settling{transition:none!important}
      }
    `;
    document.head.appendChild(style);
  }

  function scannerBlocked(){
    return document.body.classList.contains('cards-dialog-open') ||
      document.body.classList.contains('km-shell-settings-open') ||
      document.body.classList.contains('km-shell-drawer-open') ||
      document.body.classList.contains('km-shell-drawer-peek') ||
      document.body.classList.contains('editor-view');
  }

  function scannerHost(){
    let host=document.getElementById('logBottomQrScannerHost');
    if(!host){
      host=document.createElement('div');
      host.id='logBottomQrScannerHost';
      host.hidden=true;
      host.setAttribute('aria-hidden','true');
      document.body.appendChild(host);
    }
    return host;
  }

  function openScanner(){
    if(scannerBlocked())return false;
    closeSwipe(false);

    let scanButton=document.querySelector('#kmShellPlaceholderView [data-cards-scan]');
    if(!scanButton){
      const cards=window.LogCardsModule;
      if(!cards?.mount)return false;
      const host=scannerHost();
      cards.mount(host);
      scanButton=host.querySelector('[data-cards-scan]');
    }
    if(!scanButton)return false;

    scanButton.click();
    const cameraStart=document.querySelector('.cards-dialog [data-camera-start]');
    cameraStart?.click();
    return true;
  }

  function actionHost(){
    let host=document.getElementById('logBottomQrSwipeAction');
    if(!host){
      host=document.createElement('div');
      host.id='logBottomQrSwipeAction';
      host.setAttribute('aria-hidden','true');
      host.innerHTML=`<button type="button" aria-label="Code scannen">${scanIcon}<span>Scan</span></button>`;
      host.querySelector('button').addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        openScanner();
      });
      document.body.appendChild(host);
    }
    return host;
  }

  function syncActionGeometry(bar=boundBar){
    if(!bar||bar.hidden)return;
    const host=actionHost();
    const rect=bar.getBoundingClientRect();
    const width=actionWidth();
    host.style.left=`${rect.left}px`;
    host.style.top=`${rect.top}px`;
    host.style.width=`${width}px`;
    host.style.height=`${rect.height}px`;
    host.style.borderRadius=`${getComputedStyle(bar).borderRadius || '26px'} 9px 9px ${getComputedStyle(bar).borderRadius || '26px'}`;
    host.style.setProperty('--log-bottom-scan-action-width',`${width}px`);
    bar.style.setProperty('--log-qr-swipe-open-x',`${width}px`);
  }

  function showAction(open=false){
    const host=actionHost();
    host.classList.add('is-visible');
    host.classList.toggle('is-open',open);
    host.setAttribute('aria-hidden','false');
  }

  function hideAction(){
    const host=document.getElementById('logBottomQrSwipeAction');
    if(!host)return;
    host.classList.remove('is-visible','is-open');
    host.setAttribute('aria-hidden','true');
  }

  function resetGesture(){
    gesture=null;
  }

  function closeSwipe(animated=true){
    const bar=boundBar||document.getElementById('kmShellTabBar');
    if(!bar){hideAction();return;}
    bar.classList.remove('log-qr-swipe-dragging','log-qr-swipe-open');
    bar.style.removeProperty('--log-qr-swipe-x');
    if(animated){
      bar.classList.add('log-qr-swipe-settling');
      setTimeout(()=>{
        bar.classList.remove('log-qr-swipe-settling');
        hideAction();
      },190);
    }else{
      bar.classList.remove('log-qr-swipe-settling');
      hideAction();
    }
    resetGesture();
  }

  function openSwipe(bar){
    syncActionGeometry(bar);
    showAction(true);
    bar.classList.remove('log-qr-swipe-dragging','log-qr-swipe-settling');
    bar.style.removeProperty('--log-qr-swipe-x');
    bar.classList.add('log-qr-swipe-open');
  }

  function bindBar(bar){
    if(!bar||bar.dataset.logQrSwipeBound==='1')return;
    bar.dataset.logQrSwipeBound='1';
    boundBar=bar;
    syncActionGeometry(bar);

    bar.addEventListener('pointerdown',event=>{
      if(event.button!=null&&event.button!==0)return;
      if(event.isPrimary===false||scannerBlocked())return;
      if(bar.classList.contains('log-qr-swipe-open'))return;
      const rect=bar.getBoundingClientRect();
      const startX=event.clientX-rect.left;
      if(startX<0||startX>actionWidth())return;
      syncActionGeometry(bar);
      gesture={
        pointerId:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        dx:0,
        horizontal:false,
        cancelled:false
      };
      try{bar.setPointerCapture(event.pointerId);}catch(_){ }
    });

    bar.addEventListener('pointermove',event=>{
      const active=gesture;
      if(!active||active.pointerId!==event.pointerId||active.cancelled)return;
      const rawX=event.clientX-active.startX;
      const rawY=event.clientY-active.startY;
      const ax=Math.abs(rawX),ay=Math.abs(rawY);

      if(!active.horizontal){
        if(ay>ARM_DISTANCE&&ay>ax){active.cancelled=true;return;}
        if(rawX>ARM_DISTANCE&&ax>ay){
          active.horizontal=true;
          showAction(false);
          bar.classList.add('log-qr-swipe-dragging');
        }else if(rawX<0&&ax>ARM_DISTANCE){
          active.cancelled=true;
          return;
        }else return;
      }

      if(event.cancelable)event.preventDefault();
      const width=actionWidth();
      const dx=Math.max(0,Math.min(width,rawX));
      active.dx=dx;
      bar.style.setProperty('--log-qr-swipe-x',`${dx}px`);
      actionHost().classList.toggle('is-open',dx>=OPEN_DISTANCE);
    },{passive:false});

    const finish=event=>{
      const active=gesture;
      if(!active||active.pointerId!==event.pointerId)return;
      if(active.cancelled||!active.horizontal){
        resetGesture();
        return;
      }
      suppressClickUntil=Date.now()+CLICK_SUPPRESS_MS;
      if(event.cancelable)event.preventDefault();
      event.stopPropagation();
      if(active.dx>=OPEN_DISTANCE&&Math.abs(event.clientY-active.startY)<=MAX_VERTICAL)openSwipe(bar);
      else closeSwipe(true);
      resetGesture();
    };

    bar.addEventListener('pointerup',finish);
    bar.addEventListener('pointercancel',event=>{
      if(gesture?.pointerId===event.pointerId)closeSwipe(true);
    });

    bar.addEventListener('click',event=>{
      if(Date.now()<suppressClickUntil){
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if(!bar.classList.contains('log-qr-swipe-open'))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeSwipe(true);
    },true);
  }

  function bind(){
    installStyles();
    const bar=document.getElementById('kmShellTabBar');
    if(bar){
      boundBar=bar;
      bindBar(bar);
      if(!bar.classList.contains('log-qr-swipe-dragging')&&!bar.classList.contains('log-qr-swipe-open'))syncActionGeometry(bar);
    }
  }

  function init(){
    bind();
    const observer=new MutationObserver(bind);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pageshow',bind);
    window.addEventListener('log-shell-view-refresh',()=>{
      if(boundBar?.classList.contains('log-qr-swipe-open'))closeSwipe(false);
      bind();
    });
    window.addEventListener('resize',()=>{
      if(boundBar?.classList.contains('log-qr-swipe-open'))closeSwipe(false);
      syncActionGeometry();
    });
    window.visualViewport?.addEventListener('resize',()=>{
      if(boundBar?.classList.contains('log-qr-swipe-open'))closeSwipe(false);
      syncActionGeometry();
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
