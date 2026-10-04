(function(){
'use strict';

const KM='kmreg-test-v4-data';
const STORE='log-test-vehicles-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let queued=false;

function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function vehicleName(vehicle,index=0){return String(vehicle?.name||vehicle?.plate||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||`Auto ${index+1}`);}
function usage(vehicleId){
  const km=read(KM,{}),id=String(vehicleId||'');
  const trips=(Array.isArray(km.trips)?km.trips:[]).filter(trip=>String(trip?.vehicleId||'')===id);
  const events=(Array.isArray(km.events)?km.events:[]).filter(event=>String(event?.vehicleId||'')===id);
  const active=String(km.activeTrip?.vehicleId||'')===id;
  return{trips:trips.length,events:events.length,active};
}
function sheet(title,html){return window.LogCardsUI?.sheet?.(title,html)||null;}
function removeVehicle(vehicleId){
  const id=String(vehicleId||'');if(!VALID.test(id))throw Error('Ongeldige auto.');
  const store=read(STORE,{}),vehicles=store.vehicles&&typeof store.vehicles==='object'?store.vehicles:{};
  const vehicle=vehicles[id];if(!vehicle)throw Error('Auto niet gevonden.');
  const info=usage(id);if(info.active)throw Error('Deze auto heeft nu een actieve rit en kan niet worden verwijderd.');
  if(info.trips||info.events)throw Error(`Deze auto heeft nog ${info.trips} ${info.trips===1?'rit':'ritten'}${info.events?` en ${info.events} onderweg geregistreerde ${info.events===1?'registratie':'registraties'}`:''}. Verwijderen zou historie losmaken.`);
  const ids=Object.keys(vehicles).filter(key=>key!==id);
  if(!ids.length)throw Error('De laatste auto kan niet worden verwijderd. Voeg eerst een andere auto toe.');

  let nextId=String(store.activeVehicleId||'');
  if(nextId===id||!vehicles[nextId])nextId=ids[0];
  delete vehicles[id];store.vehicles=vehicles;store.activeVehicleId=nextId;store.updatedAt=new Date().toISOString();write(STORE,store);

  const km=read(KM,{});km.settings=km.settings&&typeof km.settings==='object'?km.settings:{};
  km.settings.activeVehicleId=nextId;km.settings.logVehicleId=nextId;
  if(km.vehicleIdentitiesV1&&typeof km.vehicleIdentitiesV1==='object'){
    km.vehicleIdentitiesV1=JSON.parse(JSON.stringify(store));
  }
  write(KM,km);
  try{window.LogVehicles?.select?.(nextId);}catch(_){ }
  window.dispatchEvent(new CustomEvent('log-vehicles-change',{detail:{reason:'vehicle-deleted',vehicleId:id,nextVehicleId:nextId}}));
  window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{reason:'vehicle-deleted',vehicleId:id,nextVehicleId:nextId}}));
  return nextId;
}
function confirmDelete(vehicleId){
  const store=read(STORE,{}),vehicle=store.vehicles?.[String(vehicleId||'')];if(!vehicle)return;
  const info=usage(vehicleId),name=vehicleName(vehicle);
  if(info.active){sheet('Auto verwijderen','<p class="cards-notice">Deze auto heeft nu een actieve rit. Rond die rit eerst af.</p>');return;}
  if(info.trips||info.events){
    sheet('Auto verwijderen',`<p class="cards-notice"><strong>${escapeHtml(name)}</strong> heeft nog ${info.trips} ${info.trips===1?'rit':'ritten'}${info.events?` en ${info.events} onderweg geregistreerde ${info.events===1?'registratie':'registraties'}`:''}. De auto wordt daarom niet verwijderd zolang deze historie eraan gekoppeld is.</p>`);return;
  }
  if(Object.keys(store.vehicles||{}).length<=1){sheet('Auto verwijderen','<p class="cards-notice">De laatste auto kan niet worden verwijderd. Voeg eerst een andere auto toe.</p>');return;}
  const panel=sheet('Auto verwijderen',`<p class="cards-notice">Wil je <strong>${escapeHtml(name)}</strong> verwijderen?</p><button type="button" class="btn danger full" data-confirm-vehicle-delete>Verwijder auto</button><button type="button" class="btn secondary full" data-cancel-vehicle-delete style="margin-top:8px">Annuleer</button><p role="status" data-vehicle-delete-status></p>`);if(!panel)return;
  panel.querySelector('[data-cancel-vehicle-delete]')?.addEventListener('click',()=>window.LogCardsUI?.close?.());
  panel.querySelector('[data-confirm-vehicle-delete]')?.addEventListener('click',()=>{
    const status=panel.querySelector('[data-vehicle-delete-status]');
    try{removeVehicle(vehicleId);window.LogCardsUI?.close?.();setTimeout(()=>window.LogVehicles?.showManager?.(),50);}catch(error){if(status)status.textContent=error.message;}
  });
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function decorate(){
  queued=false;
  document.querySelectorAll('[data-vehicle-card]').forEach(card=>{
    const id=String(card.dataset.vehicleCard||'');if(!VALID.test(id))return;
    const actions=card.querySelector('.log-vehicle-actions');if(!actions||actions.querySelector('[data-vehicle-delete]'))return;
    if(!window.LogVehicles?.rightsFor?.(id)?.includes('manage'))return;
    const button=document.createElement('button');button.type='button';button.className='btn secondary';button.dataset.vehicleDelete='1';button.textContent='Verwijder';button.addEventListener('click',()=>confirmDelete(id));actions.appendChild(button);
  });
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(decorate);}
function init(){
  queue();new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});
  ['log-vehicles-change','pageshow'].forEach(name=>window.addEventListener(name,queue));
  window.LogVehicleDelete={remove:removeVehicle,confirm:confirmDelete};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
