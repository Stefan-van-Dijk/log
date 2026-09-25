(function(){
  'use strict';

  const HORIZONTAL_RATIO=1.25;
  const SNAP_PROGRESS=0.28;
  const FLING_VELOCITY=0.45;
  let scrollLocked=false;
  let lockedScrollY=0;
  let lockedSection='';
  let savedBodyStyle=null;
  let savedHtmlStyle=null;
  let gesture=null;
  let animating=false;
  const boundDocuments=new WeakSet();

  const $=(selector,root=document)=>root.querySelector(selector);
  const clamp=(value,min=0,max=1)=>Math.min(max,Math.max(min,value));

  function drawerOpen(){
    return (document.body.classList.contains('km-shell-drawer-open')||document.body.classList.contains('km-shell-drawer-peek'))&&$('#kmShellDrawer')?.classList.contains('open');
  }

  function blockedByOverlay(){
    return document.body.classList.contains('cards-dialog-open')||
      document.body.classList.contains('km-shell-settings-open')||
      document.body.classList.contains('editor-view');
  }

  function installGestureStyles(){
    if($('#kmShellGestureStyles'))return;
    const style=document.createElement('style');
    style.id='kmShellGestureStyles';
    style.textContent=`
      body.km-shell-gesture-active{overscroll-behavior:none}
      body.km-shell-gesture-active .shell>#timeModuleRoot,
      body.km-shell-drawer-open .shell>#timeModuleRoot,
      body.km-shell-drawer-peek .shell>#timeModuleRoot{pointer-events:none!important;-webkit-backface-visibility:hidden;backface-visibility:hidden;transform:translateZ(0)!important}
      body.km-shell-drawer-open #kmShellDrawer,body.km-shell-drawer-peek #kmShellDrawer{overscroll-behavior:contain}
      body.km-shell-drawer-open #kmShellBackdrop,body.km-shell-drawer-peek #kmShellBackdrop{touch-action:none}
    `;
    document.head.appendChild(style);
  }

  function promoteSharedStyles(){
    const shared=[...document.querySelectorAll('link[rel="stylesheet"]')].find(link=>link.href.includes('log-ui.css'));
    if(shared&&shared.parentNode===document.head)document.head.appendChild(shared);
  }

  function lockMainScroll(){
    if(scrollLocked)return;
    scrollLocked=true;
    lockedScrollY=Math.max(0,window.scrollY||window.pageYOffset||0);
    lockedSection=localStorage.getItem('kmreg-shell-section-v1')||'';
    savedHtmlStyle={
      overflow:document.documentElement.style.overflow,
      overscrollBehavior:document.documentElement.style.overscrollBehavior
    };
    savedBodyStyle={
      overflow:document.body.style.overflow,
      overscrollBehavior:document.body.style.overscrollBehavior
    };
    document.documentElement.style.overflow='hidden';
    document.documentElement.style.overscrollBehavior='none';
    document.body.style.overflow='hidden';
    document.body.style.overscrollBehavior='none';
  }

  function unlockMainScroll(){
    if(!scrollLocked)return;
    scrollLocked=false;
    if(savedHtmlStyle){
      document.documentElement.style.overflow=savedHtmlStyle.overflow;
      document.documentElement.style.overscrollBehavior=savedHtmlStyle.overscrollBehavior;
    }
    if(savedBodyStyle){
      document.body.style.overflow=savedBodyStyle.overflow;
      document.body.style.overscrollBehavior=savedBodyStyle.overscrollBehavior;
    }
    const y=lockedScrollY;
    const restoreLockedPosition=lockedSection===(localStorage.getItem('kmreg-shell-section-v1')||'');
    savedHtmlStyle=null;
    savedBodyStyle=null;
    lockedSection='';
    if(restoreLockedPosition)requestAnimationFrame(()=>window.scrollTo(0,y));
  }

  function syncDrawerScrollLock(){
    if(drawerOpen())lockMainScroll();
    else unlockMainScroll();
  }

  function requestOpenDrawer(){
    if(drawerOpen()||blockedByOverlay())return;
    $('#kmShellMenuButton')?.click();
  }

  function requestCloseDrawer(){
    if(!drawerOpen())return;
    const backdrop=$('#kmShellBackdrop');
    if(backdrop){backdrop.click();return;}
    $('#kmShellMenuButton')?.click();
  }

  function isInteractiveTarget(target){
    return Boolean(target?.closest?.('input,textarea,select,button,a,[contenteditable="true"],[data-module-drag-handle]'));
  }

  function hasOwnGesture(target){
    return Boolean(target?.closest?.(
      '#kmShellTabBar,#periodNavigator,.period-navigator,.swipe-surface,.trip-swipe-surface,.km-shell-location-swipe-surface,.activity-swipe-surface,.code-card-surface,.period-overview,.period-nav,.odo-digit.swipeable'
    ));
  }

  function touchPoint(event){
    return event.touches?.[0]||event.changedTouches?.[0]||null;
  }

  function drawerShift(){
    return Math.min(window.innerWidth*0.5,360);
  }

  function captureStyle(element,properties){
    if(!element)return null;
    return {
      element,
      properties:properties.map(property=>({
        property,
        value:element.style.getPropertyValue(property),
        priority:element.style.getPropertyPriority(property)
      }))
    };
  }

  function restoreStyle(snapshot){
    if(!snapshot)return;
    for(const item of snapshot.properties){
      if(item.value)snapshot.element.style.setProperty(item.property,item.value,item.priority);
      else snapshot.element.style.removeProperty(item.property);
    }
  }

  function beginVisualGesture(){
    if(!gesture||gesture.visualActive||window.innerWidth>820)return;
    const shell=$('.shell');
    const menu=$('#kmShellMenuButton');
    const drawer=$('#kmShellDrawer');
    const backdrop=$('#kmShellBackdrop');
    const tabbar=$('#kmShellTabBar');
    if(!shell||!drawer)return;

    gesture.visualActive=true;
    gesture.shift=drawerShift();
    gesture.snapshots=[
      captureStyle(shell,['transition','transform','border-radius','box-shadow','will-change']),
      captureStyle(menu,['transition','transform','will-change']),
      captureStyle(drawer,['transition','opacity','pointer-events','will-change']),
      captureStyle(backdrop,['transition','left','opacity','pointer-events','will-change']),
      captureStyle(tabbar,['transition','opacity','transform','pointer-events','will-change'])
    ];
    document.body.classList.add('km-shell-gesture-active');
    for(const snapshot of gesture.snapshots){
      snapshot?.element.style.setProperty('transition','none','important');
      snapshot?.element.style.setProperty('will-change','transform, opacity');
    }
    if(drawer)drawer.style.setProperty('pointer-events','none','important');
    if(backdrop)backdrop.style.setProperty('pointer-events','none','important');
    applyGestureProgress(gesture.progress);
  }

  function applyGestureProgress(progress){
    if(!gesture?.visualActive)return;
    progress=clamp(progress);
    gesture.progress=progress;
    const shift=gesture.shift||drawerShift();
    const x=shift*progress;
    const shell=$('.shell');
    const menu=$('#kmShellMenuButton');
    const drawer=$('#kmShellDrawer');
    const backdrop=$('#kmShellBackdrop');
    const tabbar=$('#kmShellTabBar');

    if(shell){
      shell.style.setProperty('transform',`translate3d(${x}px,0,0)`,'important');
      shell.style.setProperty('border-radius',`${18*progress}px 0 0 ${18*progress}px`,'important');
      shell.style.setProperty('box-shadow',`-${Math.round(10*progress)}px 0 ${Math.round(28*progress)}px rgba(0,0,0,${(0.2*progress).toFixed(3)})`,'important');
    }
    if(menu)menu.style.setProperty('transform',`translate3d(${x}px,0,0)`,'important');
    if(drawer)drawer.style.setProperty('opacity',String(clamp(progress*2)),'important');
    if(backdrop){
      backdrop.style.setProperty('left',`${x}px`,'important');
      backdrop.style.setProperty('opacity',String(progress),'important');
    }
    if(tabbar){
      tabbar.style.setProperty('opacity',String(1-progress),'important');
      tabbar.style.setProperty('transform',`translate(-50%,${18*progress}px) scale(${(1-0.02*progress).toFixed(3)})`,'important');
      tabbar.style.setProperty('pointer-events','none','important');
    }
  }

  function cleanupVisualGesture(){
    if(!gesture?.visualActive)return;
    for(const snapshot of gesture.snapshots||[])restoreStyle(snapshot);
    document.body.classList.remove('km-shell-gesture-active');
    gesture.visualActive=false;
    gesture.snapshots=null;
  }

  function animateGestureTo(target,done){
    if(!gesture?.visualActive){done?.();return;}
    const from=gesture.progress;
    const distance=Math.abs(target-from);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration=reduced?0:Math.round(120+distance*130);
    if(!duration){
      applyGestureProgress(target);
      done?.();
      return;
    }
    animating=true;
    const started=performance.now();
    const step=now=>{
      if(!gesture?.visualActive){animating=false;return;}
      const t=clamp((now-started)/duration);
      const eased=1-Math.pow(1-t,3);
      applyGestureProgress(from+(target-from)*eased);
      if(t<1){requestAnimationFrame(step);return;}
      animating=false;
      done?.();
    };
    requestAnimationFrame(step);
  }

  function settleGesture(target){
    const mode=gesture?.mode;
    animateGestureTo(target,()=>{
      if(target===0&&mode==='close')requestCloseDrawer();
      else if(target===1&&mode==='open')requestOpenDrawer();
      requestAnimationFrame(()=>{
        cleanupVisualGesture();
        gesture=null;
        syncDrawerScrollLock();
      });
    });
  }

  function beginGesture(event){
    if(event.touches?.length!==1||gesture||animating)return;
    const point=touchPoint(event);
    if(!point)return;
    const open=drawerOpen();
    if(!open&&blockedByOverlay())return;
    if(!open&&(isInteractiveTarget(event.target)||hasOwnGesture(event.target)))return;
    gesture={
      startX:point.clientX,
      startY:point.clientY,
      dx:0,
      dy:0,
      mode:open?'close':'open',
      horizontal:false,
      visualActive:false,
      progress:open?1:0,
      velocityX:0,
      lastX:point.clientX,
      lastTime:performance.now()
    };
  }

  function moveGesture(event){
    if(!gesture||animating)return;
    const point=touchPoint(event);
    if(!point)return;
    const now=performance.now();
    gesture.dx=point.clientX-gesture.startX;
    gesture.dy=point.clientY-gesture.startY;
    const ax=Math.abs(gesture.dx),ay=Math.abs(gesture.dy);
    if(!gesture.horizontal){
      if(ay>10&&ay>ax){gesture=null;return;}
      if(ax<10||ax<ay*HORIZONTAL_RATIO)return;
      gesture.horizontal=true;
    }

    const dt=Math.max(1,now-gesture.lastTime);
    const instantVelocity=(point.clientX-gesture.lastX)/dt;
    gesture.velocityX=gesture.velocityX*0.55+instantVelocity*0.45;
    gesture.lastX=point.clientX;
    gesture.lastTime=now;

    const correctDirection=gesture.mode==='open'?gesture.dx>0:gesture.mode==='close'?gesture.dx<0:true;
    if(!correctDirection)return;
    if(event.cancelable)event.preventDefault();

    beginVisualGesture();
    if(gesture.visualActive){
      const shift=gesture.shift||drawerShift();
      const progress=gesture.mode==='open'
        ? clamp(gesture.dx/shift)
        : clamp(1+gesture.dx/shift);
      applyGestureProgress(progress);
    }
  }

  function endGesture(){
    if(!gesture||animating)return;
    if(!gesture.horizontal||!gesture.visualActive){gesture=null;return;}
    const current=gesture;
    const forward=current.mode==='open'
      ? current.progress>=SNAP_PROGRESS||current.velocityX>=FLING_VELOCITY
      : current.progress<=1-SNAP_PROGRESS||current.velocityX<=-FLING_VELOCITY;
    settleGesture(current.mode==='open'?(forward?1:0):(forward?0:1));
  }

  function cancelGesture(){
    if(!gesture||animating)return;
    if(!gesture.visualActive){gesture=null;return;}
    settleGesture(gesture.mode==='open'?0:1);
  }

  function bindGestureDocument(doc){
    if(!doc||boundDocuments.has(doc))return;
    boundDocuments.add(doc);
    doc.addEventListener('touchstart',beginGesture,{passive:true});
    doc.addEventListener('touchmove',moveGesture,{passive:false});
    doc.addEventListener('touchend',endGesture,{passive:true});
    doc.addEventListener('touchcancel',cancelGesture,{passive:true});
  }

  function init(){
    installGestureStyles();
    promoteSharedStyles();
    bindGestureDocument(document);
    syncDrawerScrollLock();

    const observer=new MutationObserver(()=>{
      if(!gesture?.visualActive)syncDrawerScrollLock();
    });
    observer.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:false});

    window.addEventListener('pageshow',()=>{
      promoteSharedStyles();
      syncDrawerScrollLock();
    });
    window.addEventListener('resize',()=>{
      if(gesture?.visualActive){
        gesture.shift=drawerShift();
        applyGestureProgress(gesture.progress);
      }
    },{passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
