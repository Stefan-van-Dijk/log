(function(){
  'use strict';

  const ARM_DISTANCE=8;
  const OPEN_DISTANCE=36;
  const FULL_SWIPE_EXTRA=32;
  const CLOSE_DISTANCE=36;
  const MAX_VERTICAL=30;
  const CLICK_SUPPRESS_MS=460;
  let gesture=null;
  let suppressClickUntil=0;
  let boundBar=null;

  const scanIcon=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M21 16v4a1 1 0 0 1-1 1h-4M8 21H4a1 1 0 0 1-1-1v-4"/><rect x="8" y="8" width="3" height="3" rx=".35"/><rect x="14" y="8" width="2" height="2" rx=".3"/><rect x="8" y="14" width="2" height="2" rx=".3"/><path d="M14 14h3v3h-3z"/></svg>`;

  function actionWidth(){return window.innerWidth<=520?78:84;}
  function fullSwipeDistance(){return actionWidth()+FULL_SWIPE_EXTRA;}

  function installStyles(){
    if(document.getElementById('logBottomBarQrSwipeStyles'))return;
    const style=document.createElement('style');
    style.id='logBottomBarQrSwipeStyles';
    style.textContent=`
      #kmShellTabBar.km-shell-tabbar{
        bottom:max(6px,calc(env(safe-area-inset-bottom) - 6px))!important;
        touch-action:pan-y;
      }
      #kmShellTabBar>.log-bottom-scan-action{
        position:absolute;
        z-index:1;
        left:0;
        top:0;
        bottom:0;
        width:var(--log-bottom-scan-action-width,78px);
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
        opacity:0;
        filter:brightness(.82);
        transform:translateX(-100%);
        transition:transform .18s cubic-bezier(.2,.8,.2,1),opacity .1s ease,filter .15s ease;
        cursor:pointer;
        pointer-events:none;
        -webkit-tap-highlight-color:transparent;
      }
      #kmShellTabBar>.log-bottom-scan-action svg{
        width:27px;
        height:27px;
        display:block;
        fill:none;
        stroke:currentColor;
        stroke-width:1.8;
        stroke-linecap:round;
        stroke-linejoin:round;
      }
      #kmShellTabBar>.km-shell-tab-button{z-index:2}
      #kmShellTabBar.log-qr-swipe-dragging>.log-bottom-scan-action{
        opacity:1;
        transform:translateX(calc(-100% + var(--log-qr-swipe-x,0px)));
        transition:none;
        pointer-events:none;
      }
      #kmShellTabBar.log-qr-swipe-dragging>.km-shell-tab-button{
        transform:translateX(var(--log-qr-swipe-x,0px))!important;
        transition:none!important;
      }
      #kmShellTabBar.log-qr-swipe-full>.log-bottom-scan-action{
        filter:brightness(1.18);
      }
      #kmShellTabBar.log-qr-swipe-open>.log-bottom-scan-action{
        opacity:1;
        filter:brightness(1.08);
        transform:translateX(0);
        pointer-events:auto;
      }
      #kmShellTabBar.log-qr-swipe-open>.km-shell-tab-button{
        transform:translateX(var(--log-qr-swipe-open-x,78px))!important;
        transition:transform .18s cubic-bezier(.2,.8,.2,1)!important;
      }
      #kmShellTabBar.log-qr-swipe-settling>.log-bottom-scan-action{
        opacity:1;
        transform:translateX(-100%);
      }
      #kmShellTabBar.log-qr-swipe-settling>.km-shell-tab-button{
        transform:translateX(0)!important;
        transition:transform .18s ease!important;
      }
      @media(prefers-reduced-motion:reduce){
        #kmShellTabBar>.log-bottom-scan-action,#kmShellTabBar.log-qr-swipe-open>.km-shell-tab-button,#kmShellTabBar.log-qr-swipe-settling>.km-shell-tab-button{transition:none!important}
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
    document.querySelector('.cards-dialog [data-camera-start]')?.click();
    return true;
  }

  function ensureAction(bar=boundBar){
    if(!bar)return null;
    let action=bar.querySelector(':scope>.log-bottom-scan-action');
    if(!action){
      action=document.createElement('button');
      action.type='button';
      action.className='log-bottom-scan-action';
      action.setAttribute('aria-label','Code scannen');
      action.innerHTML=`${scanIcon}<span>Scan</span>`;
      action.addEventListener('click',event=>{
        event.preventDefault();
        event.stopPropagation();
        openScanner();
      });
      bar.appendChild(action);
    }
    const width=actionWidth();
    bar.style.setProperty('--log-bottom-scan-action-width',`${width}px`);
    bar.style.setProperty('--log-qr-swipe-open-x',`${width}px`);
    return action;
  }

  function resetGesture(){gesture=null;}

  function closeSwipe(animated=true){
    const bar=boundBar||document.getElementById('kmShellTabBar');
    if(!bar)return;
    bar.classList.remove('log-qr-swipe-dragging','log-qr-swipe-open','log-qr-swipe-full');
    bar.style.removeProperty('--log-qr-swipe-x');
    if(animated){
      bar.classList.add('log-qr-swipe-settling');
      setTimeout(()=>bar.classList.remove('log-qr-swipe-settling'),190);
    }else bar.classList.remove('log-qr-swipe-settling');
    resetGesture();
  }

  function openSwipe(bar){
    ensureAction(bar);
    bar.classList.remove('log-qr-swipe-dragging','log-qr-swipe-settling','log-qr-swipe-full');
    bar.style.removeProperty('--log-qr-swipe-x');
    bar.classList.add('log-qr-swipe-open');
  }

  function beginGesture(bar,event,mode){
    const width=actionWidth();
    gesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,dx:0,travel:0,horizontal:false,cancelled:false,mode};
    if(mode==='close'){
      bar.classList.remove('log-qr-swipe-open','log-qr-swipe-settling');
      bar.classList.add('log-qr-swipe-dragging');
      bar.style.setProperty('--log-qr-swipe-x',`${width}px`);
    }
    try{bar.setPointerCapture(event.pointerId);}catch(_){ }
  }

  function bindBar(bar){
    if(!bar||bar.dataset.logQrSwipeBound==='1')return;
    bar.dataset.logQrSwipeBound='1';
    boundBar=bar;
    ensureAction(bar);

    bar.addEventListener('pointerdown',event=>{
      if(event.button!=null&&event.button!==0)return;
      if(event.isPrimary===false||scannerBlocked())return;
      const isOpen=bar.classList.contains('log-qr-swipe-open');
      if(isOpen){
        beginGesture(bar,event,'close');
        return;
      }
      const rect=bar.getBoundingClientRect();
      const startX=event.clientX-rect.left;
      if(startX<0||startX>actionWidth())return;
      ensureAction(bar);
      beginGesture(bar,event,'open');
    });

    bar.addEventListener('pointermove',event=>{
      const active=gesture;
      if(!active||active.pointerId!==event.pointerId||active.cancelled)return;
      const rawX=event.clientX-active.startX;
      const rawY=event.clientY-active.startY;
      const ax=Math.abs(rawX),ay=Math.abs(rawY);

      if(!active.horizontal){
        if(ay>ARM_DISTANCE&&ay>ax){active.cancelled=true;return;}
        const correct=active.mode==='open'?rawX>ARM_DISTANCE:rawX<-ARM_DISTANCE;
        if(correct&&ax>ay){
          active.horizontal=true;
          bar.classList.add('log-qr-swipe-dragging');
        }else if(ax>ARM_DISTANCE){
          active.cancelled=true;
          return;
        }else return;
      }

      if(event.cancelable)event.preventDefault();
      const width=actionWidth();
      if(active.mode==='open'){
        const travel=Math.max(0,rawX);
        const overshoot=Math.max(0,travel-width);
        const visual=Math.min(width+18,Math.min(width,travel)+overshoot*.22);
        active.dx=visual;
        active.travel=travel;
        bar.style.setProperty('--log-qr-swipe-x',`${visual}px`);
        bar.classList.toggle('log-qr-swipe-full',travel>=fullSwipeDistance());
      }else{
        const closeTravel=Math.max(0,-rawX);
        const remaining=Math.max(0,width-closeTravel);
        active.dx=remaining;
        active.travel=closeTravel;
        bar.style.setProperty('--log-qr-swipe-x',`${remaining}px`);
        bar.classList.remove('log-qr-swipe-full');
      }
    },{passive:false});

    const finish=event=>{
      const active=gesture;
      if(!active||active.pointerId!==event.pointerId)return;
      const vertical=Math.abs(event.clientY-active.startY);
      if(active.cancelled||!active.horizontal){
        if(active.mode==='close')openSwipe(bar);
        resetGesture();
        return;
      }
      suppressClickUntil=Date.now()+CLICK_SUPPRESS_MS;
      if(event.cancelable)event.preventDefault();
      event.stopPropagation();
      bar.classList.remove('log-qr-swipe-full');

      if(active.mode==='close'){
        if(active.travel>=CLOSE_DISTANCE&&vertical<=MAX_VERTICAL)closeSwipe(true);
        else openSwipe(bar);
        resetGesture();
        return;
      }

      if(active.travel>=fullSwipeDistance()&&vertical<=MAX_VERTICAL){
        closeSwipe(false);
        openScanner();
      }else if(active.travel>=OPEN_DISTANCE&&vertical<=MAX_VERTICAL){
        openSwipe(bar);
      }else closeSwipe(true);
      resetGesture();
    };

    bar.addEventListener('pointerup',finish);
    bar.addEventListener('pointercancel',event=>{
      if(gesture?.pointerId!==event.pointerId)return;
      if(gesture.mode==='close')openSwipe(bar);else closeSwipe(true);
      resetGesture();
    });

    bar.addEventListener('click',event=>{
      if(Date.now()<suppressClickUntil){
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if(event.target.closest('.log-bottom-scan-action'))return;
      if(!bar.classList.contains('log-qr-swipe-open'))return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeSwipe(true);
    },true);
  }

  function bind(){
    installStyles();
    const bar=document.getElementById('kmShellTabBar');
    if(!bar)return;
    boundBar=bar;
    ensureAction(bar);
    bindBar(bar);
  }

  function init(){
    bind();
    const observer=new MutationObserver(()=>{
      const bar=document.getElementById('kmShellTabBar');
      if(bar){boundBar=bar;ensureAction(bar);bindBar(bar);}
    });
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pageshow',bind);
    window.addEventListener('log-shell-view-refresh',()=>{
      if(boundBar?.classList.contains('log-qr-swipe-open'))closeSwipe(false);
      bind();
    });
    window.addEventListener('resize',()=>{
      if(boundBar?.classList.contains('log-qr-swipe-open'))closeSwipe(false);
      ensureAction();
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
