(function(){
  'use strict';

  const EDIT_THRESHOLD=48;
  const LIFECYCLE_EXTRA=44;
  const AXIS_LOCK_DISTANCE=10;
  const HORIZONTAL_DOMINANCE=1.08;
  const VERTICAL_DOMINANCE=1.35;
  const EDIT_RELEASE_THRESHOLD=36;
  const LIFECYCLE_RELEASE_BUFFER=18;
  const SHARE_RELEASE_THRESHOLD=36;
  const SHARE_STORE='log-test-sharing-v1';
  const SHARE_STATUS_STORE='log-test-sharing-status-v1';
  const SHARED_UPDATE_STORE='log-test-shared-config-updates-v2';
  const KM_STORE='kmreg-test-v4-data';
  const TIME_STORE='urenregistratie.test.pwa.v1';
  const VALID_SHARED_ID=/^[A-Za-z0-9_-]{12}$/;
  let gesture=null;
  let statusObserver=null;
  let statusQueued=false;

  const $=(selector,root=document)=>root.querySelector(selector);

  function readStore(key){
    try{
      const value=JSON.parse(localStorage.getItem(key)||'{}');
      return value&&typeof value==='object'?value:{};
    }catch(_){return {};}
  }
  function saveStatusStore(value){
    try{localStorage.setItem(SHARE_STATUS_STORE,JSON.stringify(value));}catch(_){}
  }
  function itemFor(type,id){
    const km=readStore(KM_STORE),time=readStore(TIME_STORE),sid=String(id||'');
    const source=type==='location'?km.locations:type==='card'?km.cards:type==='theme'?time.themes:type==='action'?time.locationActions:[];
    return Array.isArray(source)?source.find(item=>String(item?.id)===sid)||null:null;
  }
  function sharedIdentity(type,id){
    const sharing=readStore(SHARE_STORE),item=itemFor(type,id);
    const rooted=sharing.roots?.[`${type}:${id}`];
    const fromSource=item?.sharedSource?.configurationId;
    const legacy=type==='card'&&Array.isArray(item?.sharedConfigurationIds)?item.sharedConfigurationIds.find(value=>VALID_SHARED_ID.test(String(value||''))):'';
    const identifier=[rooted,fromSource,legacy].map(value=>String(value||'')).find(value=>VALID_SHARED_ID.test(value))||'';
    if(!identifier)return null;
    const published=sharing.published?.[identifier]||null;
    const imported=String(fromSource||legacy||'')===identifier;
    const collaborative=Boolean(window.LogCollaboration?.canEdit?.(identifier));
    if(!published&&!imported&&!collaborative)return null;
    return {identifier,published,collaborative};
  }
  function canonicalBundle(type,id){
    try{
      const bundle=window.LogSharing?.buildBundle?.(type,id);
      if(!bundle)return null;
      return {kind:'bundle',value:JSON.stringify({schema:bundle.schema,kind:bundle.kind,title:bundle.title,root:bundle.root,objects:bundle.objects})};
    }catch(_){return null;}
  }
  function localSignature(type,id){
    const bundle=canonicalBundle(type,id);
    if(bundle)return bundle;
    const item=itemFor(type,id);
    if(!item)return null;
    return {kind:'item',value:JSON.stringify(item)};
  }
  function updateMarker(identifier){
    const sharing=readStore(SHARE_STORE),updates=readStore(SHARED_UPDATE_STORE),info=sharing.published?.[identifier],meta=updates.configurations?.[identifier];
    return `${String(info?.publishedAt||'')}|${String(meta?.appliedSignature||'')}`;
  }
  function remoteUpdateAvailable(identifier){
    try{return window.LogSharedConfig?.configurationUpdateAvailable?.(identifier)===true;}catch(_){return false;}
  }
  function statusFor(type,id){
    const identity=sharedIdentity(type,id);
    if(!identity)return null;
    const signature=localSignature(type,id),marker=updateMarker(identity.identifier),statusState=readStore(SHARE_STATUS_STORE);
    statusState.items=statusState.items&&typeof statusState.items==='object'?statusState.items:{};
    let baseline=statusState.items[identity.identifier];
    if(signature&&(!baseline||baseline.marker!==marker||baseline.kind!==signature.kind)){
      baseline={marker,kind:signature.kind,signature:signature.value};
      statusState.items[identity.identifier]=baseline;
      saveStatusStore(statusState);
    }
    let localChanged=false;
    const canRepublish=Boolean(identity.published||identity.collaborative);
    if(canRepublish&&signature){
      if(identity.published?.signature&&signature.kind==='bundle')localChanged=identity.published.signature!==signature.value;
      else if(baseline?.kind===signature.kind&&baseline?.signature)localChanged=baseline.signature!==signature.value;
    }
    const remoteChanged=remoteUpdateAvailable(identity.identifier);
    if(localChanged)return {state:'publish',label:remoteChanged?'Lokale wijzigingen publiceren · bronupdate beschikbaar':'Lokale wijzigingen nog publiceren'};
    if(remoteChanged)return {state:'update',label:'Update van de gedeelde bron beschikbaar'};
    return {state:'current',label:'Gedeeld en actueel'};
  }
  function removeOldDot(host){
    if(!host)return;
    const dot=[...host.children].find(node=>node?.dataset?.logShareStatusDot==='1');
    dot?.remove();
    host.classList.remove('log-share-status-host');
    delete host.dataset.logShareStatus;
    delete host.dataset.logShareStatusLabel;
  }
  function decorateStatus(type,id,host){
    if(!host)return;
    const status=statusFor(type,id);
    let dot=[...host.children].find(node=>node?.dataset?.logShareStatusDot==='1');
    if(!status){removeOldDot(host);return;}
    host.classList.add('log-share-status-host');
    host.dataset.logShareStatus=status.state;
    host.dataset.logShareStatusLabel=status.label;
    if(!dot){
      dot=document.createElement('span');
      dot.className='log-share-status-dot';
      dot.dataset.logShareStatusDot='1';
      dot.setAttribute('aria-hidden','true');
      host.appendChild(dot);
    }
    dot.dataset.state=status.state;
    dot.title=status.label;
  }
  function decorateShareStatuses(){
    document.querySelectorAll('[data-card-open]').forEach(button=>{
      if(button.closest('[data-la-row]'))return;
      decorateStatus('card',button.dataset.cardOpen,button.closest('.code-card-swipe')||button);
    });
    document.querySelectorAll('[data-la-open]').forEach(button=>decorateStatus('action',button.dataset.laOpen,button.closest('[data-la-row],.code-card-swipe')||button));
    document.querySelectorAll('[data-shell-location-node]').forEach(node=>decorateStatus('location',node.dataset.shellLocationNode,node.closest('.km-shell-location-swipe-row,[data-shell-location-swipe]')||node));
    document.querySelectorAll('[data-theme-node]').forEach(node=>{
      const row=node.closest('[data-shell-theme-swipe]');
      if(row?.dataset.shellThemeType==='subtheme')return;
      decorateStatus('theme',node.dataset.themeNode,row||node.closest('.km-shell-theme-swipe-row')||node);
    });
  }
  function queueShareStatuses(){
    if(statusQueued)return;
    statusQueued=true;
    requestAnimationFrame(()=>{statusQueued=false;decorateShareStatuses();});
  }
  function installShareStatusStyles(){
    if(document.querySelector('#logShareStatusDotStyle'))return;
    const style=document.createElement('style');
    style.id='logShareStatusDotStyle';
    style.textContent=`
      .log-share-status-host{position:relative!important}
      .log-share-status-dot{position:absolute;left:10px;top:10px;width:9px;height:9px;border-radius:50%;z-index:8;pointer-events:none;background:transparent;box-shadow:0 0 0 2px color-mix(in srgb,var(--bg) 72%,transparent)}
      .log-share-status-dot[data-state="current"]{background:var(--good,#49d17d)}
      .log-share-status-dot[data-state="update"]{background:var(--warn,#ffbd4a)}
      .log-share-status-dot[data-state="publish"]{background:#8d98a6;animation:log-share-status-pulse 1.55s ease-in-out infinite}
      @keyframes log-share-status-pulse{0%,100%{background:#8d98a6;transform:scale(.92)}50%{background:var(--good,#49d17d);transform:scale(1.16)}}
      @media(prefers-reduced-motion:reduce){.log-share-status-dot[data-state="publish"]{animation:none;background:var(--good,#49d17d);box-shadow:0 0 0 2px #8d98a6}}
      .log-shared-update-badge{display:none!important}
    `;
    document.head.appendChild(style);
  }
  function installShareStatuses(){
    installShareStatusStyles();
    queueShareStatuses();
    statusObserver=new MutationObserver(queueShareStatuses);
    statusObserver.observe(document.body,{childList:true,subtree:true});
    ['log-km-state-change','log-time-state-change','log-shell-view-refresh','log-shared-card-update-state','log-shared-config-update-state'].forEach(name=>window.addEventListener(name,queueShareStatuses));
    window.addEventListener('storage',event=>{if([SHARE_STORE,SHARE_STATUS_STORE,SHARED_UPDATE_STORE,KM_STORE,TIME_STORE].includes(event.key))queueShareStatuses();});
    window.addEventListener('pageshow',queueShareStatuses);
  }

  function actionWidth(){return innerWidth<=520?78:84;}
  function shareAvailable(ctx){return Boolean(ctx?.surface&&window.LogSharingUI?.canShare?.(ctx.surface));}

  function contextFor(surface){
    if(surface.matches('.code-card-surface')){
      const row=surface.closest('.code-card-swipe');
      if(!row)return null;
      if(row.hasAttribute('data-la-row'))return {row,surface,edit:$('[data-la-edit]',row),lifecycle:$('[data-la-delete]',row),module:'locationactions'};
      if(row.hasAttribute('data-person-row'))return {row,surface,edit:$('[data-person-edit]',row),lifecycle:$('[data-delete-colleague]',row),module:'people'};
      return {row,surface,edit:$('[data-card-edit]',row),lifecycle:$('[data-card-delete]',row),module:'cards'};
    }
    if(surface.matches('.activity-swipe-surface')){
      const row=surface.closest('.activity-swipe-row');
      if(!row)return null;
      return {row,module:'time',surface,edit:$('[data-swipe-action="edit"]',row),lifecycle:$('[data-swipe-action="delete"]',row)};
    }
    if(surface.matches('.km-shell-location-swipe-surface')){
      const row=surface.closest('.km-shell-location-swipe-row');
      if(!row)return null;
      return {row,module:'locations',surface,edit:$('[data-shell-location-swipe-action="edit"]',row),lifecycle:$('[data-shell-location-swipe-action="delete"]',row)};
    }
    if(surface.matches('.km-shell-theme-swipe-surface')){
      const row=surface.closest('.km-shell-theme-swipe-row');
      if(!row)return null;
      return {row,module:'themes',surface,edit:$('[data-shell-theme-edit]',row),lifecycle:$('[data-log-delete-theme],[data-del-sub]',row)};
    }
    const row=surface.closest('.swipe-row');
    if(!row)return null;
    return {row,module:'rides',surface,edit:$('.trip-swipe-actions [data-action^="edit-"]',row),lifecycle:$('.trip-swipe-actions [data-action^="delete-"]',row)};
  }

  function resetRow(ctx){
    if(!ctx?.surface)return;
    ctx.surface.style.transition='transform .18s cubic-bezier(.2,.8,.2,1)';
    ctx.surface.style.transform='translateX(0)';
    delete ctx.surface.dataset.swipeOpen;
    ctx.row?.classList.remove('swipe-open','delete-armed','log-share-armed');
    ctx.row?.classList.remove('swipe-edit-armed','la-reset-armed');
    const reset=ctx.row?.querySelector('.la-reset-actions');
    if(reset){reset.setAttribute('inert','');reset.setAttribute('aria-hidden','true');}
    if(ctx.module==='cards')window.LogCardsModule?.closeSwipe(ctx.row);
  }

  function pointerDown(event){
    if(gesture)return;
    if(event.button!=null&&event.button!==0)return;
    if(event.target.closest?.('input,select,textarea,button:not([data-card-open]):not([data-person-open]):not([data-la-open])'))return;
    const surface=event.target.closest?.('.activity-swipe-surface,.km-shell-location-swipe-surface,.km-shell-theme-swipe-surface,.swipe-surface,.code-card-surface');
    if(!surface)return;
    const ctx=contextFor(surface);
    if(!ctx||(!ctx.edit&&!ctx.lifecycle&&!shareAvailable(ctx)))return;
    if(ctx.module==='locationactions'&&event.pointerType==='touch')return;
    if(ctx.module==='cards')document.querySelectorAll('.code-card-swipe.actions-open').forEach(row=>window.LogCardsModule?.closeSwipe(row));
    gesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,dx:0,dy:0,peakLeft:0,horizontal:false,cancelled:false,ctx};
  }

  function pointerMove(event){
    const g=gesture;
    if(!g||g.pointerId!==event.pointerId||g.cancelled)return;
    g.dx=event.clientX-g.startX;
    g.dy=event.clientY-g.startY;
    if(!g.horizontal){
      const absX=Math.abs(g.dx),absY=Math.abs(g.dy);
      if(absX<AXIS_LOCK_DISTANCE&&absY<AXIS_LOCK_DISTANCE)return;
      if(absX>=AXIS_LOCK_DISTANCE&&absX>=absY*HORIZONTAL_DOMINANCE)g.horizontal=true;
      else if(absY>=AXIS_LOCK_DISTANCE&&absY>=absX*VERTICAL_DOMINANCE){g.cancelled=true;return;}
      else return;
    }

    const share=shareAvailable(g.ctx);
    if(share&&g.dx>0){
      if(event.cancelable)event.preventDefault();
      event.stopPropagation?.();
      try{g.ctx.surface.setPointerCapture?.(event.pointerId);}catch(_){}
      g.ctx.row?.classList.toggle('log-share-armed',g.dx>=SHARE_RELEASE_THRESHOLD);
      g.ctx.row?.classList.remove('la-reset-armed','swipe-edit-armed','delete-armed');
      g.ctx.surface.style.transition='none';
      g.ctx.surface.style.transform=`translateX(${Math.min(actionWidth(),Math.max(0,g.dx))}px)`;
      return;
    }

    g.ctx.row?.classList.remove('log-share-armed','la-reset-armed');
    g.peakLeft=Math.max(g.peakLeft,Math.max(0,-g.dx));
    const lifecycleAllowed=g.ctx.lifecycle&&(window.LogSwipePolicy?.enabled(g.ctx.module)??true);
    const lifeArmed=lifecycleAllowed&&g.peakLeft>=actionWidth()+LIFECYCLE_EXTRA&&-g.dx>=actionWidth()+LIFECYCLE_EXTRA-LIFECYCLE_RELEASE_BUFFER;
    g.ctx.row?.classList.toggle('swipe-edit-armed',-g.dx>=EDIT_RELEASE_THRESHOLD&&g.peakLeft>=EDIT_THRESHOLD&&!lifeArmed);
    g.ctx.row?.classList.toggle('delete-armed',Boolean(lifeArmed));
    if(['cards','people','locationactions'].includes(g.ctx.module)){
      if(event.cancelable)event.preventDefault();
      try{g.ctx.surface.setPointerCapture?.(event.pointerId);}catch(_){}
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

    const shareArmed=shareAvailable(g.ctx)&&g.dx>=SHARE_RELEASE_THRESHOLD;
    if(shareArmed){
      const surface=g.ctx.surface;
      if(g.ctx.row)g.ctx.row.dataset.suppressUntil=String(Date.now()+400);
      resetRow(g.ctx);
      Promise.resolve(window.LogSharingUI?.shareFromSurface?.(surface)).catch(()=>{}).finally(queueShareStatuses);
      return;
    }

    const distance=Math.max(0,-g.dx);
    const lifecycleThreshold=actionWidth()+LIFECYCLE_EXTRA;
    const lifecycleArmed=g.peakLeft>=lifecycleThreshold&&distance>=lifecycleThreshold-LIFECYCLE_RELEASE_BUFFER;
    const editArmed=g.peakLeft>=EDIT_THRESHOLD&&distance>=EDIT_RELEASE_THRESHOLD;
    const action=g.ctx.lifecycle&&lifecycleArmed&&(window.LogSwipePolicy?.enabled(g.ctx.module)??true)
      ?g.ctx.lifecycle
      :(g.ctx.edit&&editArmed?g.ctx.edit:null);

    if(['cards','people','locationactions'].includes(g.ctx.module)){
      if(g.ctx.row)g.ctx.row.dataset.suppressUntil=String(Date.now()+400);
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
    if(shareAvailable(gesture.ctx)||['cards','people','locationactions','themes','locations'].includes(gesture.ctx.module))resetRow(gesture.ctx);
    gesture=null;
  }

  function touchEvent(event,point){return {target:event.target,pointerId:'log-touch',button:0,clientX:point.clientX,clientY:point.clientY,cancelable:event.cancelable,preventDefault:()=>event.preventDefault()};}
  function touchStart(event){
    const surface=event.target.closest?.('[data-la-row] .code-card-surface');
    if(!surface)return;
    if(event.touches.length!==1){pointerCancel({pointerId:'log-touch'});return;}
    pointerDown(touchEvent(event,event.touches[0]));
  }
  function touchMove(event){
    if(gesture?.pointerId!=='log-touch')return;
    if(event.touches.length!==1){pointerCancel({pointerId:'log-touch'});return;}
    pointerMove(touchEvent(event,event.touches[0]));
  }
  function touchEnd(event){
    if(gesture?.pointerId!=='log-touch')return;
    if(event.changedTouches[0])pointerMove(touchEvent(event,event.changedTouches[0]));
    pointerUp({pointerId:'log-touch'});
  }
  function init(){
    installShareStatuses();
    document.addEventListener('touchstart',touchStart,{capture:true,passive:true});
    document.addEventListener('touchmove',touchMove,{capture:true,passive:false});
    document.addEventListener('touchend',touchEnd,{capture:true,passive:false});
    document.addEventListener('touchcancel',()=>pointerCancel({pointerId:'log-touch'}),true);
    document.addEventListener('pointerdown',pointerDown,true);
    document.addEventListener('pointermove',pointerMove,true);
    document.addEventListener('pointerup',pointerUp,true);
    document.addEventListener('pointercancel',pointerCancel,true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
