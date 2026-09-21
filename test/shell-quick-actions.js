(function(){
  'use strict';

  const BUILD='0.31.10-test.95';
  const DATA_KEY='kmreg-test-v4-data';
  const TIME_KEY='urenregistratie.test.pwa.v1';
  const POSITIVE_SWIPE_THRESHOLD=36;
  let decorateQueued=false;
  let busy=false;
  let positiveSwipe=null;

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

  function readData(){
    try{
      const value=JSON.parse(localStorage.getItem(DATA_KEY)||'{}');
      return value&&typeof value==='object'?value:{};
    }catch(_){return {};}
  }

  function sameLocation(a,b){
    if(!a||!b)return false;
    if(a.id&&b.id)return String(a.id)===String(b.id);
    const aa=String(a.address||'').trim().toLocaleLowerCase('nl-NL');
    const ba=String(b.address||'').trim().toLocaleLowerCase('nl-NL');
    if(aa&&ba)return aa===ba;
    if(a.lat!=null&&a.lng!=null&&b.lat!=null&&b.lng!=null){
      const dy=(Number(a.lat)-Number(b.lat))*111320;
      const dx=(Number(a.lng)-Number(b.lng))*111320*Math.cos(((Number(a.lat)+Number(b.lat))/2)*Math.PI/180);
      return Math.hypot(dx,dy)<150;
    }
    return false;
  }

  function currentKnownLocation(data){
    if(data.lastEndpoint?.location)return data.lastEndpoint.location;
    const trips=Array.isArray(data.trips)?data.trips:[];
    const latest=[...trips].filter(trip=>trip?.destination).sort((a,b)=>new Date(b.arrivalTime||b.departureTime||0)-new Date(a.arrivalTime||a.departureTime||0))[0];
    return latest?.destination||null;
  }

  function resetRow(row){
    const surface=$('.swipe-surface,.activity-swipe-surface',row);
    if(surface){
      surface.style.transition='transform .18s cubic-bezier(.2,.8,.2,1)';
      surface.style.transform='translateX(0)';
      delete surface.dataset.swipeOpen;
    }
    row?.classList.remove('swipe-open','delete-armed');
  }

  function ensureLeftGroup(row){
    const activity=row?.matches('.activity-swipe-row');
    let group=$(activity?'.activity-swipe-actions-left':'.swipe-actions-left',row);
    if(group)return group;
    group=document.createElement('div');
    group.className=activity?'activity-swipe-actions activity-swipe-actions-left':'swipe-actions swipe-actions-left';
    if(activity)group.style.setProperty('--activity-action-count','1');
    row.insertBefore(group,row.firstChild);
    return group;
  }

  function routeCanStart(trip,data,origin){
    if(!trip||!origin||data.activeTrip)return false;
    if(!sameLocation(trip.origin,origin))return false;
    if(!trip.destination?.id)return false;
    return Array.isArray(data.locations)&&data.locations.some(location=>String(location.id)===String(trip.destination.id));
  }

  function positiveActionForRow(row){
    return $('.swipe-actions-left [data-action="reopen-trip"]',row)||
      $('[data-log-start-trip]',row)||
      $('[data-swipe-action="reopen"]',row)||
      $('[data-log-start-task]',row)||null;
  }

  function activeThemeFor(entry,state){
    if(!entry||!state)return null;
    return state.themes.find(theme=>String(theme.id)===String(entry.themeId))||
      state.themes.find(theme=>String(theme.name||'').trim()===String(entry.themeName||'').trim())||null;
  }

  function decorateTaskActions(){
    const state=window.LogTimeModule?.getState?.();
    if(!state)return;
    const inactive=state.timer?.status==='inactive';
    for(const row of $$('.activity-swipe-row[data-id]')){
      const id=String(row.dataset.id||'');
      const entry=state.entries.find(item=>String(item.id)===id);
      if(!entry||entry.activityType==='interruption')continue;
      const resume=$('[data-swipe-action="reopen"]',row);
      const canResume=inactive&&state.lastCompletion?.type==='task'&&String(state.lastCompletion.entryId)===id;
      if(resume){
        resume.textContent='Hervatten';
        resume.setAttribute('aria-label','Taak hervatten');
        resume.title='Hervatten';
      }
      let start=$('[data-log-start-task]',row);
      const theme=activeThemeFor(entry,state);
      const canStart=inactive&&!canResume&&Boolean(theme);
      if(!canStart){
        start?.remove();
      }else{
        const group=ensureLeftGroup(row);
        if(!start){
          start=document.createElement('button');
          start.type='button';
          start.className='activity-swipe-action activity-swipe-reopen log-quick-start';
          start.dataset.logStartTask=id;
          start.textContent='Start';
          group.appendChild(start);
        }
        start.setAttribute('aria-label',`${entry.themeName||theme.name||'Taak'} starten`);
        start.title='Start';
      }
      const group=$('.activity-swipe-actions-left',row);
      if(group){
        const count=group.querySelectorAll('.activity-swipe-action').length;
        if(count)group.style.setProperty('--activity-action-count',String(count));
        else group.remove();
      }
    }
  }

  function decorateTripActions(){
    const data=readData();
    const trips=Array.isArray(data.trips)?data.trips:[];
    const byId=new Map(trips.map(trip=>[String(trip.id),trip]));
    const origin=currentKnownLocation(data);

    for(const row of $$('.swipe-row[data-swipe-kind="trip"]')){
      const id=String(row.dataset.id||'');
      const trip=byId.get(id);
      if(!trip)continue;

      const nativeResume=$('.swipe-actions-left [data-action="reopen-trip"]',row);
      const canResume=!data.activeTrip&&data.lastCompletion?.type==='trip'&&String(data.lastCompletion.tripId)===id;
      if(nativeResume){
        if(nativeResume.textContent!=='Hervatten')nativeResume.textContent='Hervatten';
        nativeResume.setAttribute('aria-label','Rit hervatten');
        nativeResume.title='Hervatten';
      }

      let start=$('[data-log-start-trip]',row);
      const canStart=!canResume&&routeCanStart(trip,data,origin);
      if(!canStart){
        start?.remove();
      }else{
        const group=ensureLeftGroup(row);
        if(!start){
          start=document.createElement('button');
          start.type='button';
          start.className='swipe-action trip-swipe-action swipe-reopen log-quick-start';
          start.dataset.logStartTrip=id;
          start.textContent='Start';
          group.appendChild(start);
        }
        start.setAttribute('aria-label',`Rit naar ${trip.destination?.name||'bestemming'} starten`);
        start.title='Start';
      }

      const group=$('.swipe-actions-left',row);
      if(group&&!group.querySelector('.swipe-action'))group.remove();
    }
  }

  function waitForStartForm(timeout=3500){
    return new Promise(resolve=>{
      const existing=$('#startForm');
      if(existing){resolve(existing);return;}
      const started=Date.now();
      const observer=new MutationObserver(()=>{
        const form=$('#startForm');
        if(form){observer.disconnect();resolve(form);return;}
        if(Date.now()-started>timeout){observer.disconnect();resolve(null);}
      });
      observer.observe(document.body,{childList:true,subtree:true});
      setTimeout(()=>{observer.disconnect();resolve($('#startForm'));},timeout);
    });
  }

  async function startHistoricalTrip(id,button){
    if(busy)return;
    busy=true;
    try{
      const data=readData();
      const trip=(Array.isArray(data.trips)?data.trips:[]).find(item=>String(item.id)===String(id));
      const origin=currentKnownLocation(data);
      if(!routeCanStart(trip,data,origin))return;

      resetRow(button.closest('.swipe-row'));
      const trigger=$('[data-action="start"]');
      if(!trigger)return;
      trigger.click();
      const form=await waitForStartForm();
      if(!form)return;

      const destination=$('#startDestination',form);
      if(!destination||![...destination.options].some(option=>String(option.value)===String(trip.destination.id))){
        $('[data-action="cancel-start"]')?.click();
        return;
      }
      destination.value=String(trip.destination.id);
      destination.dispatchEvent(new Event('change',{bubbles:true}));

      const category=form.querySelector(`[name="category"][value="${CSS.escape(String(trip.category||''))}"]`);
      if(category)category.checked=true;
      if(typeof form.requestSubmit==='function')form.requestSubmit();
      else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    }finally{
      setTimeout(()=>{busy=false;},250);
    }
  }

  function startHistoricalTask(id,button){
    resetRow(button.closest('.activity-swipe-row'));
    window.LogTimeModule?.startFromEntry?.(id);
  }

  function positiveSwipeStart(event){
    if(event.button!=null&&event.button!==0)return;
    if(event.target.closest?.('button,input,select,textarea'))return;
    const surface=event.target.closest?.('.swipe-row[data-swipe-kind="trip"] .swipe-surface,.activity-swipe-row .activity-swipe-surface');
    if(!surface)return;
    const row=surface.closest('.swipe-row[data-swipe-kind="trip"],.activity-swipe-row[data-id]');
    if(!row)return;
    const action=positiveActionForRow(row);
    if(!action)return;
    positiveSwipe={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,dx:0,dy:0,horizontal:false,cancelled:false,row,action};
  }

  function positiveSwipeMove(event){
    const gesture=positiveSwipe;
    if(!gesture||gesture.pointerId!==event.pointerId||gesture.cancelled)return;
    gesture.dx=event.clientX-gesture.startX;
    gesture.dy=event.clientY-gesture.startY;
    if(!gesture.horizontal){
      if(Math.abs(gesture.dy)>10&&Math.abs(gesture.dy)>Math.abs(gesture.dx)){gesture.cancelled=true;return;}
      if(Math.abs(gesture.dx)>8&&Math.abs(gesture.dx)>Math.abs(gesture.dy))gesture.horizontal=true;
    }
  }

  function positiveSwipeEnd(event){
    const gesture=positiveSwipe;
    if(!gesture||gesture.pointerId!==event.pointerId)return;
    positiveSwipe=null;
    if(gesture.cancelled||!gesture.horizontal)return;
    const activate=gesture.dx>=POSITIVE_SWIPE_THRESHOLD&&Math.abs(gesture.dx)>Math.abs(gesture.dy);
    if(!activate)return;
    const action=gesture.action;
    setTimeout(()=>{
      if(!action?.isConnected)return;
      resetRow(gesture.row);
      action.click();
    },0);
  }

  function positiveSwipeCancel(event){
    if(!positiveSwipe||positiveSwipe.pointerId!==event.pointerId)return;
    positiveSwipe=null;
  }

  function scheduleDecorate(){
    if(decorateQueued)return;
    decorateQueued=true;
    requestAnimationFrame(()=>{
      decorateQueued=false;
      decorateTripActions();
      decorateTaskActions();
    });
  }

  function updateVersion(){
    const version=$('.km-shell-version-number');
    const badge=$('.km-shell-version');
    const today=$('#today');
    if(version&&version.textContent!==BUILD)version.textContent=BUILD;
    if(badge)badge.setAttribute('aria-label',`Geladen testversie ${BUILD}`);
    if(today){
      const date=new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
      const value=`${date} · ${BUILD}`;
      if(today.textContent!==value)today.textContent=value;
    }
  }

  function init(){
    updateVersion();
    scheduleDecorate();
    document.addEventListener('click',event=>{
      const taskButton=event.target.closest?.('[data-log-start-task]');
      if(taskButton){
        event.preventDefault();
        event.stopImmediatePropagation();
        startHistoricalTask(taskButton.dataset.logStartTask,taskButton);
        return;
      }
      const button=event.target.closest?.('[data-log-start-trip]');
      if(!button)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      startHistoricalTrip(button.dataset.logStartTrip,button);
    },true);
    document.addEventListener('pointerdown',positiveSwipeStart,true);
    document.addEventListener('pointermove',positiveSwipeMove,true);
    document.addEventListener('pointerup',positiveSwipeEnd,true);
    document.addEventListener('pointercancel',positiveSwipeCancel,true);
    const app=$('#app');
    if(app)new MutationObserver(scheduleDecorate).observe(app,{childList:true,subtree:true});
    const time=$('#main');
    if(time)new MutationObserver(scheduleDecorate).observe(time,{childList:true,subtree:true});
    new MutationObserver(()=>{updateVersion();scheduleDecorate();}).observe(document.body,{attributes:true,attributeFilter:['class']});
    window.addEventListener('log-shell-view-refresh',scheduleDecorate);
    window.addEventListener('log-time-state-change',scheduleDecorate);
    window.addEventListener('storage',event=>{if(event.key===DATA_KEY||event.key===TIME_KEY)scheduleDecorate();});
    window.addEventListener('pageshow',()=>{updateVersion();scheduleDecorate();});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
