(function(){
  'use strict';

  const EDIT_THRESHOLD=48;
  const LIFECYCLE_EXTRA=44;
  const AXIS_LOCK_DISTANCE=10;
  const HORIZONTAL_DOMINANCE=1.08;
  const VERTICAL_DOMINANCE=1.35;
  const EDIT_RELEASE_THRESHOLD=36;
  const LIFECYCLE_RELEASE_BUFFER=18;
  let gesture=null;

  const $=(selector,root=document)=>root.querySelector(selector);

  function actionWidth(){return innerWidth<=520?78:84;}

  function contextFor(surface){
    if(surface.matches('.code-card-surface')){
      const row=surface.closest('.code-card-swipe');
      if(row.hasAttribute('data-person-row'))return {row,surface,edit:$('[data-person-edit]',row),lifecycle:$('[data-delete-colleague]',row),module:'people'};
      return {row,surface,edit:$('[data-card-edit]',row),lifecycle:$('[data-card-delete]',row),module:'cards'};
    }
    if(surface.matches('.activity-swipe-surface')){
      const row=surface.closest('.activity-swipe-row');
      if(!row)return null;
      return {
        row,module:'time',
        surface,
        edit:$('[data-swipe-action="edit"]',row),
        lifecycle:$('[data-swipe-action="delete"]',row)
      };
    }
    if(surface.matches('.km-shell-location-swipe-surface')){
      const row=surface.closest('.km-shell-location-swipe-row');
      if(!row)return null;
      return {
        row,module:'locations',
        surface,
        edit:$('[data-shell-location-swipe-action="edit"]',row),
        lifecycle:$('[data-shell-location-swipe-action="delete"]',row)
      };
    }
    if(surface.matches('.km-shell-theme-swipe-surface')){
      const row=surface.closest('.km-shell-theme-swipe-row');
      if(!row)return null;
      return {
        row,module:'themes',
        surface,
        edit:$('[data-shell-theme-edit]',row),
        lifecycle:$('[data-log-delete-theme],[data-del-sub]',row)
      };
    }
    const row=surface.closest('.swipe-row');
    if(!row)return null;
    return {
      row,module:'rides',
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
    ctx.row?.classList.remove('swipe-edit-armed');
    if(ctx.module==='cards')window.LogCardsModule?.closeSwipe(ctx.row);
  }

  function pointerDown(event){
    if(event.button!=null&&event.button!==0)return;
    if(event.target.closest?.('input,select,textarea,button:not([data-card-open]):not([data-person-open])'))return;
    const surface=event.target.closest?.('.activity-swipe-surface,.km-shell-location-swipe-surface,.km-shell-theme-swipe-surface,.swipe-surface,.code-card-surface');
    if(!surface)return;
    const ctx=contextFor(surface);
    if(!ctx||(!ctx.edit&&!ctx.lifecycle))return;
    if(ctx.module==='cards'){
      document.querySelectorAll('.code-card-swipe.actions-open').forEach(row=>window.LogCardsModule?.closeSwipe(row));
    }
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
    const lifecycleAllowed=g.ctx.lifecycle&&(window.LogSwipePolicy?.enabled(g.ctx.module)??true);
    const lifeArmed=lifecycleAllowed&&g.peakLeft>=actionWidth()+LIFECYCLE_EXTRA&&-g.dx>=actionWidth()+LIFECYCLE_EXTRA-LIFECYCLE_RELEASE_BUFFER;
    g.ctx.row.classList.toggle('swipe-edit-armed',-g.dx>=EDIT_RELEASE_THRESHOLD&&g.peakLeft>=EDIT_THRESHOLD&&!lifeArmed);
    g.ctx.row.classList.toggle('delete-armed',Boolean(lifeArmed));
    if(['cards','people'].includes(g.ctx.module)){
      if(event.cancelable)event.preventDefault();
      try{g.ctx.surface.setPointerCapture(event.pointerId);}catch(_){}
      const width=actionWidth()*(lifecycleAllowed?2:1);
      g.ctx.surface.style.transition='none';
      g.ctx.surface.style.transform=`translateX(${Math.max(-width,Math.min(0,g.dx))}px)`;
    }
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
    const action=g.ctx.lifecycle&&lifecycleArmed&&(window.LogSwipePolicy?.enabled(g.ctx.module)??true)
      ?g.ctx.lifecycle
      :(g.ctx.edit&&editArmed?g.ctx.edit:null);
    if(['cards','people'].includes(g.ctx.module)){
      g.ctx.row.dataset.suppressUntil=String(Date.now()+400);
      resetRow(g.ctx);
    }
    if(!action)return;
    setTimeout(()=>{
      if(!action.isConnected)return;
      resetRow(g.ctx);
      action.click();
    },0);
  }

  function pointerCancel(event){
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    if(['cards','people'].includes(gesture.ctx.module))resetRow(gesture.ctx);
    gesture=null;
  }

  function init(){
    document.addEventListener('pointerdown',pointerDown,true);
    document.addEventListener('pointermove',pointerMove,true);
    document.addEventListener('pointerup',pointerUp,true);
    document.addEventListener('pointercancel',pointerCancel,true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
