(function(){
'use strict';

const STORE='log-test-vehicles-v1';
let queued=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch(_){return{};}}
function vehicleName(vehicle,index=0){return String(vehicle?.name||vehicle?.plate||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||`Voertuig ${index+1}`);}
function formatOdometer(value){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat('nl-NL',{maximumFractionDigits:0}).format(n)+' km':'—';}
function locationLabel(location){return String(location?.name||location?.address||'');}
function drivableVehicles(){
  if(!window.LogVehicles?.list)return[];
  return window.LogVehicles.list().filter(vehicle=>window.LogVehicles.rightsFor?.(vehicle.vehicleId)?.includes('drive'));
}
function singleMarkup(vehicle){
  const status=read().vehicles?.[vehicle.vehicleId]?.lastKnown||vehicle.lastKnown||null;
  const details=[status?.odometer!=null?formatOdometer(status.odometer):'',status?.location?`laatst bij ${locationLabel(status.location)}`:''].filter(Boolean).join(' · ');
  return `<div class="log-start-vehicle-single-main"><span class="log-start-vehicle-single-icon" aria-hidden="true">🚗</span><div><strong>${esc(vehicleName(vehicle))}</strong>${details?`<small>${esc(details)}</small>`:''}</div></div>`;
}
function decorate(){
  queued=false;
  const form=document.getElementById('startForm');
  if(!form)return;
  const wrap=form.querySelector('.log-start-vehicle');
  if(!wrap)return;

  const choice=form.querySelector('.start-inline-choice');
  if(choice&&wrap.nextElementSibling!==choice)choice.insertAdjacentElement('beforebegin',wrap);

  const vehicles=drivableVehicles();
  const select=wrap.querySelector('[data-log-start-vehicle]');
  const hint=wrap.querySelector('[data-log-start-vehicle-hint]');
  let single=wrap.querySelector('[data-log-start-vehicle-single]');

  if(vehicles.length===1){
    const vehicle=vehicles[0];
    if(select)select.value=vehicle.vehicleId;
    wrap.classList.add('log-start-vehicle-one');
    wrap.querySelector('label')?.setAttribute('hidden','');
    if(select){select.hidden=true;select.setAttribute('aria-hidden','true');}
    if(hint)hint.hidden=true;
    if(!single){
      single=document.createElement('div');
      single.dataset.logStartVehicleSingle='1';
      single.className='log-start-vehicle-single';
      wrap.appendChild(single);
    }
    const markup=singleMarkup(vehicle);
    if(single.innerHTML!==markup)single.innerHTML=markup;
  }else{
    wrap.classList.remove('log-start-vehicle-one');
    wrap.querySelector('label')?.removeAttribute('hidden');
    if(select){select.hidden=false;select.removeAttribute('aria-hidden');}
    if(hint)hint.hidden=false;
    single?.remove();
  }
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(decorate);}
function styles(){
  if(document.getElementById('logVehicleStartLayoutStyles'))return;
  const style=document.createElement('style');style.id='logVehicleStartLayoutStyles';style.textContent=`
    #startForm>.log-start-vehicle{margin:12px 0 18px}
    #startForm>.log-start-vehicle-one{margin:8px 0 16px;padding:0}
    .log-start-vehicle-single{padding:8px 2px;color:var(--muted)}
    .log-start-vehicle-single-main{display:flex;align-items:center;gap:9px}
    .log-start-vehicle-single-icon{font-size:16px;opacity:.72}
    .log-start-vehicle-single-main>div{min-width:0}
    .log-start-vehicle-single strong{display:block;color:var(--text);font-size:13px;font-weight:650}
    .log-start-vehicle-single small{display:block;margin-top:2px;font-size:11px;color:var(--muted)}
  `;document.head.appendChild(style);
}
function init(){
  styles();queue();
  new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});
  ['log-vehicles-change','log-km-state-change','pageshow'].forEach(name=>window.addEventListener(name,queue));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
