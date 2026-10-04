(function(){
'use strict';

const STORE='log-test-vehicles-v1';
const KM='kmreg-test-v4-data';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let queued=false;
let currentUiVehicleId='';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{return JSON.parse(localStorage.getItem(key)||'{}')||fallback;}catch(_){return fallback;}}
function vehicleName(vehicle,index=0){return String(vehicle?.name||vehicle?.plate||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||`Voertuig ${index+1}`);}
function formatOdometer(value){const n=Number(value);return Number.isFinite(n)&&String(value??'')!==''?new Intl.NumberFormat('nl-NL',{maximumFractionDigits:0}).format(n)+' km':'Nog geen beginstand';}
function locationLabel(location){return String(location?.name||location?.address||'');}
function drivableVehicles(){
  if(!window.LogVehicles?.list)return[];
  return window.LogVehicles.list().filter(vehicle=>window.LogVehicles.rightsFor?.(vehicle.vehicleId)?.includes('drive'));
}
function kmState(){return read(KM,{});}
function vehicleRecord(vehicleId){return read(STORE,{}).vehicles?.[String(vehicleId||'')]||null;}
function storedStatus(vehicleId){return vehicleRecord(vehicleId)?.lastKnown||null;}
function statusFor(vehicleId){
  let status=null;
  try{status=window.LogVehiclePosition?.lastKnown?.(vehicleId)||storedStatus(vehicleId);}catch(_){status=storedStatus(vehicleId);}
  if(status)return status;
  const vehicle=vehicleRecord(vehicleId);
  if(vehicle&&vehicle.initialOdometer!==undefined&&vehicle.initialOdometer!==null&&String(vehicle.initialOdometer)!==''){
    return{location:null,odometer:Number(vehicle.initialOdometer),time:vehicle.registrationStart||null,source:'initial'};
  }
  return null;
}
function startSelect(){return document.querySelector('#startForm [data-log-start-vehicle]');}
function desiredVehicleId(vehicles){
  const activeTripId=String(kmState().activeTrip?.vehicleId||'');
  if(VALID.test(activeTripId)&&vehicles.some(vehicle=>vehicle.vehicleId===activeTripId))return activeTripId;
  const startId=String(startSelect()?.value||'');
  if(VALID.test(startId)&&vehicles.some(vehicle=>vehicle.vehicleId===startId))return startId;
  const activeId=String(window.LogVehicles?.active?.()?.vehicleId||read(STORE,{}).activeVehicleId||'');
  if(VALID.test(activeId)&&vehicles.some(vehicle=>vehicle.vehicleId===activeId))return activeId;
  return String(vehicles[0]?.vehicleId||'');
}
function syncHiddenStartSelect(vehicleId){
  const select=startSelect();
  if(!select||select.value===vehicleId)return;
  select.value=vehicleId;
  select.dispatchEvent(new Event('change',{bubbles:true}));
}
function chooseVehicle(vehicleId){
  const id=String(vehicleId||'');if(!VALID.test(id))return;
  syncHiddenStartSelect(id);
  const previous=currentUiVehicleId;
  currentUiVehicleId=id;
  try{
    if(String(window.LogVehicles?.active?.()?.vehicleId||'')!==id)window.LogVehicles?.select?.(id);
  }catch(error){console.warn('Auto kiezen mislukt',error);}
  if(previous!==id)window.dispatchEvent(new CustomEvent('log-vehicle-scope-change',{detail:{vehicleId:id,source:'user'}}));
  queue();
}
function updateHeroStatus(vehicleId){
  const hero=document.querySelector('.hero:not(.active-hero)');if(!hero)return;
  const status=statusFor(vehicleId),odometer=hero.querySelector('.home-odometer');
  if(odometer){const text=formatOdometer(status?.odometer);if(odometer.textContent!==text)odometer.textContent=text;}
  const paragraph=hero.querySelector('.log-top-subtitle')||hero.querySelector('p');
  if(paragraph){
    const label=status?.location?locationLabel(status.location):'';
    const text=label?`Laatste bestemming: ${label}`:(status?.odometer!=null?'Nog geen bestemming voor deze auto.':'Vul bij de auto eerst de beginstand in.');
    if(paragraph.textContent!==text)paragraph.textContent=text;
    paragraph.title=text;
  }
}
function visualMarkup(name,selectable){
  return `<div class="log-hero-vehicle-visual"><span class="log-hero-vehicle-name">${esc(name)}</span>${selectable?'<span class="log-hero-vehicle-chevron" aria-hidden="true">⌄</span>':''}</div>`;
}
function positionHeroControl(row){
  if(!row)return;
  const height=44;
  row.style.top='';
  row.style.height=`${height}px`;
  row.style.minHeight=`${height}px`;
  row.style.maxHeight=`${height}px`;
}
function ensureHeroControl(vehicles,vehicleId){
  const hero=document.querySelector('.hero:not(.active-hero)');
  const existing=document.querySelector('[data-log-hero-vehicle]');
  if(!hero){existing?.remove();return;}
  const selected=vehicles.find(vehicle=>vehicle.vehicleId===vehicleId)||vehicles[0]||null;
  if(!selected){existing?.remove();return;}
  let row=hero.querySelector('[data-log-hero-vehicle]');
  if(!row){row=document.createElement('div');row.dataset.logHeroVehicle='1';row.className='log-hero-vehicle';hero.appendChild(row);}
  const selectable=vehicles.length>1;
  row.classList.toggle('selectable',selectable);
  if(!selectable){
    const markup=visualMarkup(vehicleName(selected),false);
    if(row.dataset.mode!=='single'||row.innerHTML!==markup){row.dataset.mode='single';row.innerHTML=markup;}
    positionHeroControl(row);
    return;
  }
  if(row.dataset.mode!=='multi'){
    row.dataset.mode='multi';
    row.innerHTML=visualMarkup(vehicleName(selected),true)+'<select data-log-hero-vehicle-select aria-label="Auto kiezen"></select>';
    row.querySelector('[data-log-hero-vehicle-select]')?.addEventListener('change',event=>chooseVehicle(event.target.value));
  }
  const select=row.querySelector('[data-log-hero-vehicle-select]');
  const optionKey=vehicles.map((vehicle,index)=>`${vehicle.vehicleId}:${vehicleName(vehicle,index)}`).join('|');
  if(select&&select.dataset.optionKey!==optionKey){
    select.innerHTML=vehicles.map((vehicle,index)=>`<option value="${esc(vehicle.vehicleId)}">${esc(vehicleName(vehicle,index))}</option>`).join('');
    select.dataset.optionKey=optionKey;
  }
  if(select&&select.value!==vehicleId)select.value=vehicleId;
  const name=row.querySelector('.log-hero-vehicle-name');if(name&&name.textContent!==vehicleName(selected))name.textContent=vehicleName(selected);
  positionHeroControl(row);
}
function decorate(){
  queued=false;
  const vehicles=drivableVehicles();
  if(!vehicles.length){document.querySelector('[data-log-hero-vehicle]')?.remove();return;}
  const hidden=document.querySelector('#startForm .log-start-vehicle');
  if(hidden){hidden.hidden=true;hidden.setAttribute('aria-hidden','true');}
  const nextId=desiredVehicleId(vehicles);
  if(!VALID.test(nextId))return;
  const previous=currentUiVehicleId;
  currentUiVehicleId=nextId;
  document.documentElement.dataset.logRideVehicle=nextId;
  ensureHeroControl(vehicles,nextId);
  updateHeroStatus(nextId);
  if(previous&&previous!==nextId)window.dispatchEvent(new CustomEvent('log-vehicle-scope-change',{detail:{vehicleId:nextId,source:'context'}}));
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(decorate);}
function styles(){
  let style=document.getElementById('logVehicleStartLayoutStyles');
  if(!style){style=document.createElement('style');style.id='logVehicleStartLayoutStyles';document.head.appendChild(style);}
  style.textContent=`
    #startForm .log-start-vehicle[hidden]{display:none!important}
    .hero:not(.active-hero){position:relative}
    .hero:not(.active-hero)>.home-odometer,.hero:not(.active-hero) .log-top-identity>.home-odometer{max-width:64%}
    .hero:not(.active-hero)>p,.hero:not(.active-hero) .log-top-subtitle,.hero:not(.active-hero) .log-top-identity>p{max-width:100%!important;width:100%!important;padding-right:0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;overflow-wrap:normal!important}
    .log-hero-vehicle{position:absolute;z-index:2;top:18px;right:18px;width:30%;max-width:168px;display:flex;align-items:center;justify-content:center;padding:5px 10px;box-sizing:border-box;border:1px solid var(--line);border-radius:12px;background:var(--card2);overflow:hidden;text-align:center;color:var(--text)}
    .log-hero-vehicle-visual{display:flex;align-items:center;justify-content:center;gap:7px;max-width:100%}
    .log-hero-vehicle-name{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:700}
    .log-hero-vehicle-chevron{flex:none;color:var(--muted);font-size:16px;line-height:1}
    .log-hero-vehicle select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
    .log-hero-vehicle:not(.selectable){color:var(--muted);background:transparent}
    @media(max-width:520px){
      .hero:not(.active-hero)>.home-odometer,.hero:not(.active-hero) .log-top-identity>.home-odometer{max-width:65%}
      .log-hero-vehicle{top:14px;right:14px;width:29%;padding:5px 8px;border-radius:11px}
      .log-hero-vehicle-name{font-size:13px}
    }
  `;
}
function init(){
  styles();queue();
  new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});
  ['log-vehicles-change','log-km-state-change','log-shell-view-refresh','pageshow','resize'].forEach(name=>window.addEventListener(name,queue));
  window.LogVehicleStartUI={currentVehicleId:()=>currentUiVehicleId,choose:chooseVehicle,refresh:queue};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
