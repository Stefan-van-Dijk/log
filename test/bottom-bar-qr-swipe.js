(function(){
  'use strict';

  const EDGE_ZONE=56;
  const ARM_DISTANCE=14;
  const TRIGGER_DISTANCE=70;
  const MAX_VERTICAL=34;
  const CLICK_SUPPRESS_MS=480;
  let gesture=null;
  let suppressClickUntil=0;

  function installStyles(){
    if(document.getElementById('logBottomBarQrSwipeStyles'))return;
    const style=document.createElement('style');
    style.id='logBottomBarQrSwipeStyles';
    style.textContent=`
      #kmShellTabBar.km-shell-tabbar{
        bottom:max(6px,calc(env(safe-area-inset-bottom) - 6px))!important;
        touch-action:pan-y;
      }
      #kmShellTabBar.km-shell-tabbar::after{
        content:'';
        position:absolute;
        z-index:5;
        left:5px;
        top:50%;
        width:3px;
        height:24px;
        border-radius:999px;
        background:color-mix(in srgb,var(--accent) 64%,transparent);
        opacity:.34;
        transform:translateY(-50%);
        pointer-events:none;
        transition:height .16s ease,opacity .16s ease,box-shadow .16s ease;
      }
      #kmShellTabBar.km-shell-tabbar.log-qr-swipe-active::after{
        height:38px;
        opacity:1;
        box-shadow:0 0 14px color-mix(in srgb,var(--accent) 58%,transparent);
      }
      #kmShellTabBar.km-shell-tabbar.log-qr-swipe-ready::after{
        width:4px;
        height:46px;
        opacity:1;
        box-shadow:0 0 18px color-mix(in srgb,var(--accent) 76%,transparent);
      }
      @media(prefers-reduced-motion:reduce){
        #kmShellTabBar.km-shell-tabbar::after{transition:none}
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

  function reset(bar){
    bar?.classList.remove('log-qr-swipe-active','log-qr-swipe-ready');
    gesture=null;
  }

  function bindBar(bar){
    if(!bar||bar.dataset.logQrSwipeBound==='1')return;
    bar.dataset.logQrSwipeBound='1';

    bar.addEventListener('pointerdown',event=>{
      if(event.button!=null&&event.button!==0)return;
      if(event.isPrimary===false||scannerBlocked())return;
      const rect=bar.getBoundingClientRect();
      const startX=event.clientX-rect.left;
      if(startX<0||startX>EDGE_ZONE)return;
      gesture={
        pointerId:event.pointerId,
        startX:event.clientX,
        startY:event.clientY,
        horizontal:false,
        triggered:false,
        cancelled:false
      };
      try{bar.setPointerCapture(event.pointerId);}catch(_){ }
    });

    bar.addEventListener('pointermove',event=>{
      const active=gesture;
      if(!active||active.pointerId!==event.pointerId||active.cancelled||active.triggered)return;
      const dx=event.clientX-active.startX;
      const dy=event.clientY-active.startY;
      const ax=Math.abs(dx),ay=Math.abs(dy);

      if(!active.horizontal){
        if(ax<ARM_DISTANCE&&ay<ARM_DISTANCE)return;
        if(dx>ARM_DISTANCE&&ax>ay*1.12){
          active.horizontal=true;
          bar.classList.add('log-qr-swipe-active');
        }else if(ay>=ARM_DISTANCE||dx<0){
          active.cancelled=true;
          reset(bar);
          return;
        }else return;
      }

      if(event.cancelable)event.preventDefault();
      const ready=dx>=TRIGGER_DISTANCE&&ay<=MAX_VERTICAL;
      bar.classList.toggle('log-qr-swipe-ready',ready);
    },{passive:false});

    const finish=event=>{
      const active=gesture;
      if(!active||active.pointerId!==event.pointerId)return;
      const dx=event.clientX-active.startX;
      const dy=Math.abs(event.clientY-active.startY);
      const shouldOpen=active.horizontal&&!active.cancelled&&dx>=TRIGGER_DISTANCE&&dy<=MAX_VERTICAL;
      if(shouldOpen){
        active.triggered=true;
        suppressClickUntil=Date.now()+CLICK_SUPPRESS_MS;
        if(event.cancelable)event.preventDefault();
        event.stopPropagation();
        openScanner();
      }
      reset(bar);
    };

    bar.addEventListener('pointerup',finish);
    bar.addEventListener('pointercancel',event=>{
      if(gesture?.pointerId===event.pointerId)reset(bar);
    });
    bar.addEventListener('lostpointercapture',()=>reset(bar));

    bar.addEventListener('click',event=>{
      if(Date.now()>=suppressClickUntil)return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },true);
  }

  function bind(){
    installStyles();
    const bar=document.getElementById('kmShellTabBar');
    if(bar)bindBar(bar);
  }

  function init(){
    bind();
    const observer=new MutationObserver(bind);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pageshow',bind);
    window.addEventListener('log-shell-view-refresh',bind);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
