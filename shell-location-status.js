(function(){
  'use strict';

  const VIEW_ID='kmShellLocationsView';
  const SECTION_KEY='kmreg-shell-section-v1';
  const DATA_KEY='kmreg-v4-data';
  const KM_STATE_EVENT='log-km-state-change';
  let viewObserver=null;
  let observedView=null;
  let enhancementObserver=null;
  let toastTimer=null;
  let syncQueued=false;
  let enhancementQueued=false;
  let actionLocationFilter='';
  let actionTypeFilter='';

  const $=(selector,root=document)=>root.querySelector(selector);
  const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

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
      .km-location-action-filter{margin:10px 0 6px}
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
    const text=name?`Deze locatie is al geregistreerd als ${name}.`:'Deze locatie is al geregistreerd.';
    if(toast.textContent!==text)toast.textContent=text;
    clearTimeout(toastTimer);
    toast.classList.remove('show');
    requestAnimationFrame(()=>toast.classList.add('show'));
    toastTimer=setTimeout(()=>toast.classList.remove('show'),2600);
  }

  function setText(element,value){
    if(element&&element.textContent!==value)element.textContent=value;
  }

  function setHtml(element,value){
    if(element&&element.innerHTML!==value)element.innerHTML=value;
  }

  function syncSubLocationEditor(){
    const form=$('#locationForm');
    const parentSelect=$('#kmShellParentId',form||document);
    const address=form?.elements?.address;
    if(!form||!parentSelect||!address)return;

    const hasOwnAddress=Object.prototype.hasOwnProperty.call(address.dataset,'kmOwnAddress');
    if(!hasOwnAddress)address.dataset.kmOwnAddress=address.value||'';

    const parentId=String(parentSelect.value||'');
    const snapshot=readData();
    const parent=parentId?snapshot.locations.find(location=>String(location.id)===parentId):null;
    const group=address.closest('.form-group');
    const hint=$('.location-link-hint',form);
    const attribution=$('.osm-attribution',form);
    const parentHint=$('#kmShellParentHint',form);

    if(parentId){
      if(address.dataset.kmSubLocation!=='1')address.dataset.kmOwnAddress=address.value||'';
      address.dataset.kmSubLocation='1';
      address.disabled=true;
      const inheritedAddress='';
      if(address.value!==inheritedAddress)address.value=inheritedAddress;
      if(group&&group.hidden!==true)group.hidden=true;
      setHtml(hint,`<strong>Sublocatie van ${html(parent?.name||'hoofdlocatie')}</strong><br>Geen eigen adres nodig. Log gebruikt eigen GPS als die is ingevuld; anders de GPS van de hoofdlocatie.`);
      setText(parentHint,`Sublocatie van ${parent?.name||'hoofdlocatie'}. Het adres komt van de hoofdlocatie; eigen GPS is alleen nodig voor preciezere herkenning.`);
      if(attribution&&attribution.hidden!==true)attribution.hidden=true;
    }else{
      address.disabled=false;
      if(address.dataset.kmSubLocation==='1'){
        const own=address.dataset.kmOwnAddress||'';
        if(address.value!==own)address.value=own;
      }
      delete address.dataset.kmSubLocation;
      if(group&&group.hidden!==false)group.hidden=false;
      setHtml(hint,'<strong>Adres ↔ GPS</strong><br>Ontbrekende gegevens worden automatisch aangevuld; huidige GPS vervangt alleen de coördinaten.');
      setText(parentHint,'Als hoofdlocatie kan deze plek zelf sublocaties bevatten.');
      if(attribution&&attribution.hidden!==false)attribution.hidden=false;
    }
  }

  function syncSubLocationList(){
    const snapshot=readData();
    document.querySelectorAll(`#${VIEW_ID} .km-shell-location-node[data-depth="1"]`).forEach(node=>{
      const location=snapshot.locations.find(item=>String(item.id)===String(node.dataset.shellLocationNode||''));
      const parent=location?.parentId?snapshot.locations.find(item=>item.id===location.parentId):null;
      const subtitle=$('.km-shell-location-copy small',node);
      setText(subtitle,parent?`Onder ${parent.name}`:'Sublocatie');
    });
  }

  function actionLocationLabel(location,locations){
    if(!location)return'Locatie ontbreekt';
    const parent=location.parentId?locations.find(item=>item.id===location.parentId):null;
    return parent?`${parent.name} › ${location.name}`:location.name;
  }

  function actionLocationRelated(ruleLocation,filterLocation,locations){
    if(!filterLocation)return true;
    if(!ruleLocation)return false;
    if(ruleLocation===filterLocation)return true;
    const ruleLoc=locations.find(item=>item.id===ruleLocation);
    const filterLoc=locations.find(item=>item.id===filterLocation);
    return ruleLoc?.parentId===filterLocation||filterLoc?.parentId===ruleLocation;
  }

  function syncActionLocationFilter(){
    const addButton=$('[data-la-new]');
    const module=addButton?.closest('.cards-module');
    const snapshot=window.LogLocationActions?.snapshot?.();
    if(!module||!snapshot||!Array.isArray(snapshot.rules)||!Array.isArray(snapshot.locations))return;

    if(actionLocationFilter&&!snapshot.locations.some(location=>location.id===actionLocationFilter))actionLocationFilter='';

    let wrap=$('[data-la-location-filter-wrap]',module);
    if(!wrap){
      wrap=document.createElement('div');
      wrap.className='cards-filter km-location-action-filter';
      wrap.dataset.laLocationFilterWrap='1';
      wrap.innerHTML='<label><span>Type</span><select data-la-type-filter aria-label="Filter acties op type"><option value="">Alle typen</option><option value="ride">Ritten</option><option value="task">Taken</option><option value="card">Kaarten</option></select></label><label><span>Locatie</span><select data-la-location-filter aria-label="Filter acties op locatie"></select></label>';
      addButton.insertAdjacentElement('afterend',wrap);
    }

    const typeSelect=$('[data-la-type-filter]',wrap);
    if(typeSelect&&typeSelect.value!==actionTypeFilter)typeSelect.value=actionTypeFilter;
    const select=$('[data-la-location-filter]',wrap);
    if(!select)return;
    const optionSignature=JSON.stringify(snapshot.locations.map(location=>[location.id,location.name,location.parentId||'']));
    if(select.dataset.locationSignature!==optionSignature){
      select.innerHTML='<option value="">Alle locaties</option>'+snapshot.locations.map(location=>`<option value="${html(location.id)}">${html(actionLocationLabel(location,snapshot.locations))}</option>`).join('');
      select.dataset.locationSignature=optionSignature;
    }
    if(select.value!==actionLocationFilter)select.value=actionLocationFilter;

    let summary=$('[data-la-filter-summary]',module);
    if(!summary){
      summary=document.createElement('div');summary.dataset.laFilterSummary='1';
      summary.className='cards-filter';summary.style.margin='8px 0';
      summary.innerHTML='<span data-la-filter-text style="flex:1;font-size:13px"></span><button type="button" data-la-clear-filters>Filters wissen</button>';
      wrap.insertAdjacentElement('afterend',summary);
    }
    const search=window.LogLocationActions?.getSearch?.()||'';
    const filters=[actionTypeFilter?({ride:'Ritten',task:'Taken',card:'Kaarten'})[actionTypeFilter]:'',
      actionLocationFilter?actionLocationLabel(snapshot.locations.find(l=>l.id===actionLocationFilter),snapshot.locations):'',
      search?'Zoeken: '+search:''].filter(Boolean);
    setText($('[data-la-filter-text]',summary),filters.join(' · '));
    if(summary.hidden!==!filters.length)summary.hidden=!filters.length;
    $('[data-la-clear-filters]',summary).onclick=()=>{
      actionTypeFilter='';actionLocationFilter='';
      const input=$('#kmShellSearchInput');if(input){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));}
      window.LogLocationActions?.search?.('');syncActionLocationFilter();
    };
    let visible=0;
    module.querySelectorAll('[data-la-row]').forEach(row=>{
      const id=row.querySelector('[data-la-open]')?.dataset.laOpen||'';
      const rule=snapshot.rules.find(item=>item.id===id);
      const show=!!rule&&(!actionTypeFilter||rule.type===actionTypeFilter)&&actionLocationRelated(rule.locationId,actionLocationFilter,snapshot.locations);
      if(row.hidden===show)row.hidden=!show;
      if(show)visible++;
    });

    let empty=$('[data-la-location-filter-empty]',module);
    if(!empty){
      empty=document.createElement('p');
      empty.className='cards-empty';
      empty.dataset.laLocationFilterEmpty='1';
      empty.textContent='Geen acties voor deze selectie.';
      module.appendChild(empty);
    }
    const shouldHide=(!actionLocationFilter&&!actionTypeFilter)||visible>0;
    module.querySelectorAll('.cards-empty:not([data-la-location-filter-empty])').forEach(node=>{
      const hidden=Boolean(actionLocationFilter||actionTypeFilter);if(node.hidden!==hidden)node.hidden=hidden;
    });
    if(empty.hidden!==shouldHide)empty.hidden=shouldHide;
  }

  function syncEnhancements(){
    enhancementQueued=false;
    syncSubLocationEditor();
    syncSubLocationList();
    syncActionLocationFilter();
  }

  function queueEnhancements(){
    if(enhancementQueued)return;
    enhancementQueued=true;
    requestAnimationFrame(syncEnhancements);
  }

  function addedElementIsRelevant(node){
    if(!(node instanceof Element))return false;
    return node.matches('#locationForm,#kmShellLocationParentSection,#kmShellLocationsView,[data-la-new],[data-la-row],.cards-module')||
      !!node.querySelector?.('#locationForm,#kmShellLocationParentSection,#kmShellLocationsView,[data-la-new],[data-la-row],.cards-module');
  }

  function bindEnhancementObserver(){
    if(enhancementObserver)return;
    enhancementObserver=new MutationObserver(mutations=>{
      if(mutations.some(mutation=>[...mutation.addedNodes].some(addedElementIsRelevant)))queueEnhancements();
    });
    enhancementObserver.observe(document.body,{childList:true,subtree:true});
    queueEnhancements();
  }

  function init(){
    installStyles();

    bindViewObserver();
    bindEnhancementObserver();

    document.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-shell-current-location]');
      if(button?.classList.contains('km-location-confirmed'))showConfirmation(button.dataset.registeredLocation||'');
      setTimeout(()=>{
        bindViewObserver();
        queueEnhancements();
      },0);
    },{passive:true});

    document.addEventListener('change',event=>{
      if(event.target.matches?.('#kmShellParentId'))queueEnhancements();
      if(event.target.matches?.('[data-la-type-filter]')){
        actionTypeFilter=String(event.target.value||'');
        syncActionLocationFilter();
      }
      if(event.target.matches?.('[data-la-location-filter]')){
        actionLocationFilter=String(event.target.value||'');
        syncActionLocationFilter();
      }
    });

    const bodyObserver=new MutationObserver(()=>{
      bindViewObserver();
      queueEnhancements();
    });
    bodyObserver.observe(document.body,{attributes:true,attributeFilter:['class'],childList:true,subtree:false});

    window.addEventListener('kmreg-shell-select-section',event=>{
      if(event.detail?.section==='locations')requestAnimationFrame(restoreLocationsView);
      queueEnhancements();
    });

    window.addEventListener(KM_STATE_EVENT,()=>{queueSync();queueEnhancements();});
    window.addEventListener('log-shell-view-refresh',queueEnhancements);

    window.addEventListener('pageshow',()=>{
      bindViewObserver();
      queueEnhancements();
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
