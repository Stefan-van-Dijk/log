(function(){
  'use strict';

  const BUILD='0.31.10-test.73';
  const VIEW_ID='kmShellLocationsView';
  const SECTION_KEY='kmreg-test-shell-section-v1';
  const DATA_KEY='kmreg-test-v4-data';
  const KM_STATE_EVENT='log-km-state-change';
  let viewObserver=null;
  let observedView=null;
  let toastTimer=null;
  let syncQueued=false;

  const $=(selector,root=document)=>root.querySelector(selector);

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

  function installStyles(){
    if($('#kmShellLocationStatusStyle'))return;
    const style=document.createElement('style');
    style.id='kmShellLocationStatusStyle';
    style.textContent=`
      .km-shell-location-actions{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .km-shell-location-actions.km-location-known{grid-template-columns:minmax(0,1fr) minmax(0,2fr)!important}
      .km-shell-location-actions [data-shell-current-location]{min-width:0!important;padding-left:10px!important;padding-right:10px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px!important;transition:background .18s ease,color .18s ease}
      .km-shell-location-actions [data-shell-current-location].km-location-confirmed{background:color-mix(in srgb,var(--good) 13%,var(--surface))!important;color:var(--good)!important}
      .km-shell-location-actions [data-shell-current-location].km-location-confirmed:active{background:color-mix(in srgb,var(--good) 21%,var(--surface))!important}
      .km-shell-location-buttons [data-shell-edit-location]{display:none!important}
      .km-shell-location-confirmation{position:fixed;z-index:118;left:50%;bottom:calc(104px + env(safe-area-inset-bottom));max-width:min(88vw,430px);padding:10px 14px;border:.5px solid color-mix(in srgb,var(--good) 34%,var(--line));border-radius:999px;background:color-mix(in srgb,var(--surface) 92%,transparent);color:var(--good);box-shadow:0 10px 30px rgba(0,0,0,.18);-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);font-size:12px;font-weight:750;text-align:center;opacity:0;transform:translate(-50%,8px);transition:opacity .18s ease,transform .18s ease;pointer-events:none}
      .km-shell-location-confirmation.show{opacity:1;transform:translate(-50%,0)}
    `;
    document.head.appendChild(style);
  }

  function readData(){
    try{
      const value=JSON.parse(localStorage.getItem(DATA_KEY)||'{}');
      return {
        raw:value&&typeof value==='object'?value:{},
        locations:Array.isArray(value?.locations)?value.locations:[],
        trips:Array.isArray(value?.trips)?value.trips:[],
        events:Array.isArray(value?.events)?value.events:[]
      };
    }catch(_){return {raw:{},locations:[],trips:[],events:[]};}
  }

  function locationTripCount(location,snapshot){
    if(!location)return 0;
    const seen=new Set();
    for(const trip of snapshot.trips){
      if(trip?.origin?.id===location.id||trip?.destination?.id===location.id)seen.add(trip.id);
    }
    for(const event of snapshot.events){
      if(event?.tripId&&event?.location?.id===location.id)seen.add(event.tripId);
    }
    return seen.size;
  }

  function reorderLocationTree(mode){
    const view=$(`#${VIEW_ID}`);
    const tree=$('.km-shell-location-tree',view||document);
    if(!view||!tree)return;
    const snapshot=readData();
    const byId=new Map(snapshot.locations.map(location=>[String(location.id),location]));
    const groups=[];
    let group=null;
    for(const node of [...tree.children]){
      if(!node.matches?.('.km-shell-location-node'))continue;
      if(node.dataset.depth==='0'||!group){
        group={id:String(node.dataset.shellLocationNode||''),nodes:[node]};
        groups.push(group);
      }else group.nodes.push(node);
    }
    groups.sort((a,b)=>{
      const left=byId.get(a.id),right=byId.get(b.id);
      const leftName=String(left?.name||'');
      const rightName=String(right?.name||'');
      if(mode==='alpha')return leftName.localeCompare(rightName,'nl',{sensitivity:'base'});
      return locationTripCount(right,snapshot)-locationTripCount(left,snapshot)||leftName.localeCompare(rightName,'nl',{sensitivity:'base'});
    });
    const fragment=document.createDocumentFragment();
    for(const item of groups)for(const node of item.nodes)fragment.appendChild(node);
    tree.appendChild(fragment);
  }

  function setLocationSortMode(mode){
    mode=mode==='alpha'?'alpha':'smart';
    const snapshot=readData();
    const raw=snapshot.raw;
    if(!raw.settings||typeof raw.settings!=='object')raw.settings={};
    raw.settings.locationSortMode=mode;
    localStorage.setItem(DATA_KEY,JSON.stringify(raw));
    window.dispatchEvent(new CustomEvent(KM_STATE_EVENT,{detail:{key:DATA_KEY,reason:'location-sort',source:'shell-location-status'}}));
    const view=$(`#${VIEW_ID}`);
    view?.querySelectorAll('.km-shell-location-sort [data-mode]').forEach(button=>{
      button.classList.toggle('active',button.dataset.mode===mode);
    });
    reorderLocationTree(mode);
  }

  function matchedName(view){
    const status=$('#kmStableCurrentStatus',view);
    const match=status?.textContent?.match(/^Huidige locatie:\s*(.*?)\s*·/i);
    if(match?.[1])return match[1].trim();
    const current=$('.km-shell-location-node.km-current-location .km-shell-location-copy strong',view);
    return current?.textContent?.trim()||'';
  }

  function syncButton(){
    syncQueued=false;
    const view=$(`#${VIEW_ID}`);
    const button=$('[data-shell-current-location]',view||document);
    if(!view||!button)return;
    const name=matchedName(view);
    const confirmed=Boolean(name);
    const actions=button.closest('.km-shell-location-actions');
    actions?.classList.toggle('km-location-known',confirmed);
    button.classList.toggle('km-location-confirmed',confirmed);
    button.dataset.registeredLocation=name;
    const label=confirmed?`✓ ${name}`:'Huidige locatie';
    if(button.textContent!==label)button.textContent=label;
    if(confirmed){
      button.setAttribute('aria-label',`Huidige locatie is geregistreerd als ${name}. Tik om opnieuw te controleren.`);
      button.title=`Geregistreerd als ${name}`;
    }else{
      button.setAttribute('aria-label','Huidige locatie controleren');
      button.removeAttribute('title');
    }
  }

  function queueSync(){
    if(syncQueued)return;
    syncQueued=true;
    requestAnimationFrame(syncButton);
  }

  function bindViewObserver(){
    const view=$(`#${VIEW_ID}`);
    if(!view||view===observedView){queueSync();return;}
    viewObserver?.disconnect();
    observedView=view;
    viewObserver=new MutationObserver(queueSync);
    viewObserver.observe(view,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    queueSync();
  }

  function restoreLocationsView(){
    if(localStorage.getItem(SECTION_KEY)!=='locations')return;
    if(document.body.classList.contains('editor-view'))return;
    if($('#kmShellSettings')?.classList.contains('open'))return;
    const view=$(`#${VIEW_ID}`);
    if(!view)return;
    document.body.classList.add('km-shell-locations-mode');
    document.body.classList.remove('km-shell-placeholder-mode');
    view.hidden=false;
    const placeholder=$('#kmShellPlaceholderView');
    if(placeholder)placeholder.hidden=true;
    queueSync();
  }

  function showConfirmation(name){
    let toast=$('#kmShellLocationConfirmation');
    if(!toast){
      toast=document.createElement('div');
      toast.id='kmShellLocationConfirmation';
      toast.className='km-shell-location-confirmation';
      toast.setAttribute('role','status');
      toast.setAttribute('aria-live','polite');
      document.body.appendChild(toast);
    }
    toast.textContent=name?`Deze locatie is al geregistreerd als ${name}.`:'Deze locatie is al geregistreerd.';
    clearTimeout(toastTimer);
    toast.classList.remove('show');
    requestAnimationFrame(()=>toast.classList.add('show'));
    toastTimer=setTimeout(()=>toast.classList.remove('show'),2600);
  }

  function init(){
    installStyles();
    updateVersion();
    bindViewObserver();

    document.addEventListener('click',event=>{
      const sort=event.target.closest?.(`#${VIEW_ID} .km-shell-location-sort [data-mode]`);
      if(!sort)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setLocationSortMode(sort.dataset.mode);
    },true);

    document.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-shell-current-location]');
      if(button?.classList.contains('km-location-confirmed'))showConfirmation(button.dataset.registeredLocation||'');
      setTimeout(()=>{
        updateVersion();
        bindViewObserver();
      },0);
    },{passive:true});

    const bodyObserver=new MutationObserver(()=>{
      updateVersion();
      bindViewObserver();
    });
    bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:false});

    window.addEventListener('kmreg-test-shell-select-section',event=>{
      if(event.detail?.section!=='locations')return;
      requestAnimationFrame(restoreLocationsView);
    });

    window.addEventListener(KM_STATE_EVENT,queueSync);

    window.addEventListener('pageshow',()=>{
      updateVersion();
      bindViewObserver();
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
