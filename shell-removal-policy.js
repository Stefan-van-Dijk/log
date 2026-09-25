(function(){
  'use strict';

  const BUILD='0.33.0';
  const DATA_KEY='kmreg-v4-data';
  const KM_STATE_EVENT='log-km-state-change';
  const SECTION_KEY='kmreg-shell-section-v1';
  const VIEW_ID='kmShellLocationsView';
  const policy=window.LogRemovalPolicy;
  if(!policy){console.error('LogRemovalPolicy ontbreekt.');return;}

  let decorateQueued=false;

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function readKm(){
    try{
      const raw=JSON.parse(localStorage.getItem(DATA_KEY)||'{}');
      if(!raw||typeof raw!=='object')return {};
      if(!Array.isArray(raw.locations))raw.locations=[];
      if(!Array.isArray(raw.trips))raw.trips=[];
      if(!Array.isArray(raw.events))raw.events=[];
      if(!Array.isArray(raw.trackPoints))raw.trackPoints=[];
      return raw;
    }catch(_){return {locations:[],trips:[],events:[],trackPoints:[]};}
  }

  function writeKm(raw){
    const newValue=JSON.stringify(raw);
    localStorage.setItem(DATA_KEY,newValue);
    if(localStorage.getItem(DATA_KEY)!==newValue)throw new Error('Locatiewijziging kon niet worden opgeslagen.');
  }

  function notifyKmStateChange(reason){
    window.dispatchEvent(new CustomEvent(KM_STATE_EVENT,{detail:{key:DATA_KEY,reason,source:'shell-removal'}}));
  }

  function descendantsOf(id,locations){
    const ids=[];
    const queue=[String(id)];
    const seen=new Set(queue);
    while(queue.length){
      const parentId=queue.shift();
      for(const location of locations){
        if(String(location?.parentId||'')!==parentId)continue;
        const childId=String(location.id||'');
        if(!childId||seen.has(childId))continue;
        seen.add(childId);
        ids.push(childId);
        queue.push(childId);
      }
    }
    return ids;
  }

  function referencesLocation(value,ids){
    return Boolean(value?.id&&ids.has(String(value.id)));
  }

  function locationPlan(id,raw=readKm()){
    const location=raw.locations.find(item=>String(item.id)===String(id));
    if(!location)return null;
    const descendants=descendantsOf(id,raw.locations);
    const allIds=new Set([String(id),...descendants]);
    const tripRefs=raw.trips.filter(trip=>['origin','destination','plannedDestination','expectedDestination'].some(key=>referencesLocation(trip?.[key],allIds)));
    const eventRefs=raw.events.filter(event=>referencesLocation(event?.location,allIds));
    const activeRefs=raw.activeTrip&&['origin','destination','plannedDestination','expectedDestination'].some(key=>referencesLocation(raw.activeTrip?.[key],allIds))?1:0;
    return policy.createPlan({
      entityType:'location',
      id,
      label:location.name||'Locatie',
      owned:[descendants.length?{key:'children',label:descendants.length===1?'sublocatie':'sublocaties',count:descendants.length,ids:descendants}:null],
      incoming:[
        tripRefs.length?{key:'trips',label:tripRefs.length===1?'historische rit':'historische ritten',count:tripRefs.length,ids:tripRefs.map(item=>item.id)}:null,
        eventRefs.length?{key:'events',label:eventRefs.length===1?'tussenpunt':'tussenpunten',count:eventRefs.length,ids:eventRefs.map(item=>item.id)}:null,
        activeRefs?{key:'activeTrip',label:'actieve rit',count:1}:null
      ],
      meta:{locationIds:[...allIds]}
    });
  }

  function tripPlan(id,raw=readKm()){
    const trip=raw.trips.find(item=>String(item.id)===String(id));
    if(!trip)return null;
    const events=raw.events.filter(event=>String(event.tripId||'')===String(id));
    const points=raw.trackPoints.filter(point=>String(point.tripId||'')===String(id));
    const from=trip.origin?.name||trip.origin?.label||'vertrek';
    const to=trip.destination?.name||trip.destination?.label||'bestemming';
    return policy.createPlan({
      entityType:'trip',
      id,
      label:`Rit ${from} → ${to}`,
      owned:[
        events.length?{key:'events',label:events.length===1?'tussenpunt':'tussenpunten',count:events.length,ids:events.map(item=>item.id)}:null,
        points.length?{key:'trackPoints',label:points.length===1?'GPS-punt':'GPS-punten',count:points.length}:{key:'trackPoints',label:'eventuele gekoppelde GPS-gegevens',count:null}
      ],
      incoming:[]
    });
  }

  function eventPlan(id,raw=readKm()){
    const item=raw.events.find(event=>String(event.id)===String(id));
    if(!item)return null;
    return policy.createPlan({entityType:'event',id,label:item.type==='tank'?'Tankpunt':'Tussenpunt',owned:[],incoming:[]});
  }

  function installStyles(){
    if($('#logShellRemovalStyle'))return;
    const style=document.createElement('style');
    style.id='logShellRemovalStyle';
    style.textContent=`
      .km-shell-location-swipe-archive{background:#8a6500!important;color:#fff!important}
      .log-location-archive{margin:14px 0 4px;overflow:hidden;border:.5px solid var(--line);border-radius:16px;background:var(--card)}
      .log-location-archive>summary{display:flex;align-items:center;gap:10px;min-height:52px;padding:11px 14px;list-style:none;cursor:pointer}.log-location-archive>summary::-webkit-details-marker{display:none}
      .log-location-archive-copy{flex:1;min-width:0}.log-location-archive-copy strong,.log-location-archive-copy small{display:block}.log-location-archive-copy small{margin-top:2px;color:var(--muted);font-size:11px}
      .log-location-archive-body{border-top:.5px solid var(--line)}.log-location-archive-row{display:flex;align-items:center;gap:10px;min-height:56px;padding:10px 13px}.log-location-archive-row+.log-location-archive-row{border-top:.5px solid var(--line)}
      .log-location-archive-row-copy{flex:1;min-width:0}.log-location-archive-row-copy strong,.log-location-archive-row-copy small{display:block}.log-location-archive-row-copy small{margin-top:2px;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.log-location-archive-row button{min-height:36px;padding:7px 10px;border:0;border-radius:10px;background:var(--card2);color:var(--accent);font:inherit;font-size:11px;font-weight:800}
    `;
    document.head.appendChild(style);
  }

  function hideLegacyDeleteFeedback(){
    const hide=()=>{
      const toast=$('#toast');
      if(toast&&/verwijderd/i.test(toast.textContent||'')){
        toast.classList.remove('show');
        toast.classList.add('hidden');
        toast.replaceChildren();
      }
      const undo=$('#kmShellUndo');
      if(undo&&/verwijderd/i.test(undo.textContent||''))undo.classList.remove('show');
    };
    [0,40,140,320].forEach(delay=>setTimeout(hide,delay));
  }

  function refreshLocations(reason='location-update'){
    localStorage.setItem(SECTION_KEY,'locations');
    notifyKmStateChange(reason);
    if(document.body.classList.contains('editor-view')){
      const back=$('[data-action="editor-back"]');
      if(back)back.click();
    }
  }

  function removeActiveLocationRows(ids){
    const view=$(`#${VIEW_ID}`);
    if(!view)return;
    for(const node of $$('[data-shell-location-node]',view)){
      if(ids.has(String(node.dataset.shellLocationNode||'')))node.remove();
    }
  }

  function archiveLocation(plan){
    const raw=readKm();
    const ids=new Set((plan.meta?.locationIds||[plan.id]).map(String));
    const items=raw.locations.filter(item=>ids.has(String(item.id)));
    if(!items.length)return;
    policy.archiveBatch({source:'km',entityType:'location',rootId:plan.id,items,reason:policy.archiveCopy(plan).message});
    raw.locations=raw.locations.filter(item=>!ids.has(String(item.id)));
    writeKm(raw);
    removeActiveLocationRows(ids);
    refreshLocations('location-archive');
  }

  async function deleteLocationGroup(plan){
    if(!await policy.confirmDelete(plan))return;
    const raw=readKm();
    const ids=new Set((plan.meta?.locationIds||[plan.id]).map(String));
    raw.locations=raw.locations.filter(item=>!ids.has(String(item.id)));
    writeKm(raw);
    removeActiveLocationRows(ids);
    refreshLocations('location-delete');
  }

  function replayNativeDelete(button){
    button.dataset.logRemovalApproved='1';
    button.click();
    hideLegacyDeleteFeedback();
  }

  async function handleLifecycleClick(event){
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;

    const locationButton=target.closest('[data-shell-location-swipe-action="delete"],[data-action="delete-location"]');
    if(locationButton){
      event.preventDefault();
      event.stopImmediatePropagation();
      const id=locationButton.dataset.locationId||locationButton.dataset.id||locationButton.closest('[data-id]')?.dataset.id;
      const plan=locationPlan(id);
      if(!plan)return;
      if(plan.action==='archive')archiveLocation(plan);
      else await deleteLocationGroup(plan);
      return;
    }

    const actionButton=target.closest('[data-action="delete-trip"],[data-action="delete-event"]');
    if(!actionButton)return;
    if(actionButton.dataset.logRemovalApproved==='1'){
      delete actionButton.dataset.logRemovalApproved;
      return;
    }
    const id=actionButton.dataset.id||actionButton.closest('[data-id]')?.dataset.id;
    const plan=actionButton.dataset.action==='delete-trip'?tripPlan(id):eventPlan(id);
    if(!plan)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(await policy.confirmDelete(plan))replayNativeDelete(actionButton);
  }

  function decorateLocationActions(){
    const view=$(`#${VIEW_ID}`);
    if(view){
      for(const button of $$('[data-shell-location-swipe-action="delete"]',view)){
        const id=button.dataset.locationId||button.closest('[data-shell-location-swipe]')?.dataset.shellLocationSwipe;
        const plan=locationPlan(id);
        if(!plan)continue;
        const archive=plan.action==='archive';
        const text=archive?'Archiveer':'Verwijder';
        if(button.textContent!==text)button.textContent=text;
        const aria=`${plan.label} ${archive?'archiveren':'verwijderen'}`;
        if(button.getAttribute('aria-label')!==aria)button.setAttribute('aria-label',aria);
        button.classList.toggle('km-shell-location-swipe-archive',archive);
        button.classList.toggle('km-shell-location-swipe-delete',!archive);
      }
    }

    for(const button of $$('[data-action="delete-location"]')){
      const id=button.dataset.id||button.closest('[data-id]')?.dataset.id;
      const plan=locationPlan(id);
      if(!plan)continue;
      const archive=plan.action==='archive';
      const text=archive?'Archiveren':'Verwijderen';
      if(button.textContent!==text)button.textContent=text;
      button.classList.toggle('km-shell-location-swipe-archive',archive);
    }
  }

  function archivedLocationGroups(){
    const records=policy.listArchived({source:'km',entityType:'location'});
    const groups=new Map();
    for(const record of records){
      if(!groups.has(record.batchId))groups.set(record.batchId,[]);
      groups.get(record.batchId).push(record);
    }
    return [...groups.values()].sort((a,b)=>String(b[0]?.archivedAt||'').localeCompare(String(a[0]?.archivedAt||'')));
  }

  function ensureLocationArchive(){
    const view=$(`#${VIEW_ID}`);
    if(!view)return;
    const groups=archivedLocationGroups();
    let archive=$('#logLocationArchive',view);
    if(!groups.length){archive?.remove();return;}
    const signature=groups.map(records=>records.map(record=>`${record.archiveId}:${record.archivedAt}`).join(',')).join('|');
    if(archive?.dataset.signature===signature)return;
    if(!archive){
      archive=document.createElement('details');
      archive.id='logLocationArchive';
      archive.className='log-location-archive';
      view.appendChild(archive);
    }
    const open=archive.open;
    const itemCount=groups.reduce((sum,records)=>sum+records.length,0);
    archive.dataset.signature=signature;
    archive.innerHTML=`<summary><span class="log-location-archive-copy"><strong>Archief</strong><small>${itemCount} ${itemCount===1?'locatie':'locaties'} · tik om te herstellen</small></span><span aria-hidden="true">›</span></summary><div class="log-location-archive-body">${groups.map(records=>{
      const root=records.find(record=>String(record.id)===String(record.rootId))||records[0];
      const name=root?.payload?.name||'Locatie';
      const extra=records.length>1?` · ${records.length-1} sublocatie${records.length===2?'':'s'}`:'';
      return `<div class="log-location-archive-row"><div class="log-location-archive-row-copy"><strong>${esc(name)}</strong><small>Gearchiveerd${extra}</small></div><button type="button" data-log-location-restore="${esc(root.batchId)}">Herstel</button></div>`;
    }).join('')}</div>`;
    archive.open=open;
  }

  function restoreLocationBatch(batchId){
    const records=policy.recordsForBatch(batchId).filter(record=>record.source==='km'&&record.entityType==='location');
    if(!records.length)return;
    const raw=readKm();
    const activeIds=new Set(raw.locations.map(item=>String(item.id)));
    for(const record of records){
      if(activeIds.has(String(record.id)))continue;
      raw.locations.push(record.payload);
      activeIds.add(String(record.id));
    }
    writeKm(raw);
    policy.removeBatch(batchId);
    refreshLocations('location-restore');
  }

  function scheduleDecorate(){
    if(decorateQueued)return;
    decorateQueued=true;
    requestAnimationFrame(()=>{
      decorateQueued=false;
      decorateLocationActions();
      ensureLocationArchive();
    });
  }

  function init(){
    installStyles();
    document.addEventListener('click',handleLifecycleClick,true);
    document.addEventListener('click',event=>{
      const restore=event.target.closest?.('[data-log-location-restore]');
      if(!restore)return;
      event.preventDefault();
      event.stopPropagation();
      restoreLocationBatch(restore.dataset.logLocationRestore);
    });
    const observer=new MutationObserver(scheduleDecorate);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('log-shell-view-refresh',scheduleDecorate);
    window.addEventListener(KM_STATE_EVENT,scheduleDecorate);
    window.addEventListener('pageshow',scheduleDecorate);
    window.addEventListener('storage',event=>{
      if(event.key===DATA_KEY||event.key===policy.ARCHIVE_KEY)scheduleDecorate();
    });
    scheduleDecorate();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
