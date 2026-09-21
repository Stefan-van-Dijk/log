(function(){
  'use strict';

  const BUILD='0.31.10-test.84';
  const EDIT_THRESHOLD=48;
  const LIFECYCLE_EXTRA=44;
  const AXIS_LOCK_DISTANCE=10;
  const HORIZONTAL_DOMINANCE=1.08;
  const VERTICAL_DOMINANCE=1.35;
  const EDIT_RELEASE_THRESHOLD=36;
  const LIFECYCLE_RELEASE_BUFFER=18;
  let gesture=null;
  let versionObserver=null;
  let versionQueued=false;

  const $=(selector,root=document)=>root.querySelector(selector);

  function actionWidth(){return innerWidth<=520?78:84;}

  function contextFor(surface){
    if(surface.matches('.activity-swipe-surface')){
      const row=surface.closest('.activity-swipe-row');
      if(!row)return null;
      return {
        row,
        surface,
        edit:$('[data-swipe-action="edit"]',row),
        lifecycle:$('[data-swipe-action="delete"]',row)
      };
    }
    if(surface.matches('.km-shell-location-swipe-surface')){
      const row=surface.closest('.km-shell-location-swipe-row');
      if(!row)return null;
      return {
        row,
        surface,
        edit:$('[data-shell-location-swipe-action="edit"]',row),
        lifecycle:$('[data-shell-location-swipe-action="delete"]',row)
      };
    }
    if(surface.matches('.km-shell-theme-swipe-surface')){
      const row=surface.closest('.km-shell-theme-swipe-row');
      if(!row)return null;
      return {
        row,
        surface,
        edit:$('[data-shell-theme-edit]',row),
        lifecycle:$('[data-log-delete-theme],[data-del-sub]',row)
      };
    }
    const row=surface.closest('.swipe-row');
    if(!row)return null;
    return {
      row,
      surface,
      edit:$('.trip-swipe-actions [data-action^="edit-"]',row),
      lifecycle:$('.trip-swipe-actions [data-action^="delete-"]',row)
    };
  }

  function resetRow(ctx){
    if(!ctx?.surface)return;
    ctx.surface.style.transition='transform .18s cubic-bezier(.2,.8,.2,1)';
    ctx.surface.style.transform='translateX(0)';
    delete ctx.surface.dataset.swipeOpen;
    ctx.row?.classList.remove('swipe-open','delete-armed');
  }

  function pointerDown(event){
    if(event.button!=null&&event.button!==0)return;
    if(event.target.closest?.('button,input,select,textarea'))return;
    const surface=event.target.closest?.('.activity-swipe-surface,.km-shell-location-swipe-surface,.km-shell-theme-swipe-surface,.swipe-surface');
    if(!surface)return;
    const ctx=contextFor(surface);
    if(!ctx||(!ctx.edit&&!ctx.lifecycle))return;
    gesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,dx:0,dy:0,peakLeft:0,horizontal:false,cancelled:false,ctx};
  }

  function pointerMove(event){
    const g=gesture;
    if(!g||g.pointerId!==event.pointerId||g.cancelled)return;
    g.dx=event.clientX-g.startX;
    g.dy=event.clientY-g.startY;
    if(!g.horizontal){
      const absX=Math.abs(g.dx);
      const absY=Math.abs(g.dy);
      if(absX<AXIS_LOCK_DISTANCE&&absY<AXIS_LOCK_DISTANCE)return;
      if(absX>=AXIS_LOCK_DISTANCE&&absX>=absY*HORIZONTAL_DOMINANCE)g.horizontal=true;
      else if(absY>=AXIS_LOCK_DISTANCE&&absY>=absX*VERTICAL_DOMINANCE){g.cancelled=true;return;}
      else return;
    }
    g.peakLeft=Math.max(g.peakLeft,Math.max(0,-g.dx));
  }

  function pointerUp(event){
    const g=gesture;
    if(!g||g.pointerId!==event.pointerId)return;
    gesture=null;
    if(g.cancelled||!g.horizontal)return;
    const distance=Math.max(0,-g.dx);
    const lifecycleThreshold=actionWidth()+LIFECYCLE_EXTRA;
    const lifecycleArmed=g.peakLeft>=lifecycleThreshold&&distance>=lifecycleThreshold-LIFECYCLE_RELEASE_BUFFER;
    const editArmed=g.peakLeft>=EDIT_THRESHOLD&&distance>=EDIT_RELEASE_THRESHOLD;
    const action=g.ctx.lifecycle&&lifecycleArmed
      ?g.ctx.lifecycle
      :(g.ctx.edit&&editArmed?g.ctx.edit:(!g.ctx.edit&&g.ctx.lifecycle&&editArmed?g.ctx.lifecycle:null));
    if(!action)return;
    setTimeout(()=>{
      if(!action.isConnected)return;
      resetRow(g.ctx);
      action.click();
    },0);
  }

  function pointerCancel(event){
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    gesture=null;
  }

  function updateVersion(){
    window.LOG_TEST_BUILD=BUILD;
    document.documentElement.dataset.logBuild=BUILD;
    const version=$('.km-shell-version-number');
    const badge=$('.km-shell-version');
    const today=$('#today');
    if(version&&version.textContent!==BUILD)version.textContent=BUILD;
    if(badge&&badge.getAttribute('aria-label')!==`Geladen testversie ${BUILD}`)badge.setAttribute('aria-label',`Geladen testversie ${BUILD}`);
    if(today){
      const date=new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
      const value=`${date} · ${BUILD}`;
      if(today.textContent!==value)today.textContent=value;
    }
  }

  function scheduleVersion(){
    if(versionQueued)return;
    versionQueued=true;
    requestAnimationFrame(()=>{
      versionQueued=false;
      updateVersion();
    });
  }

  function bindVersionGuard(){
    if(versionObserver||!document.body)return;
    versionObserver=new MutationObserver(scheduleVersion);
    versionObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-label','class']});
  }

  function init(){
    updateVersion();
    bindVersionGuard();
    document.addEventListener('pointerdown',pointerDown,true);
    document.addEventListener('pointermove',pointerMove,true);
    document.addEventListener('pointerup',pointerUp,true);
    document.addEventListener('pointercancel',pointerCancel,true);
    window.addEventListener('pageshow',scheduleVersion);
    window.addEventListener('log-shell-view-refresh',scheduleVersion);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
