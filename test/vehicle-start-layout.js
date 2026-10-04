(function(){
'use strict';

let queued=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function vehicleName(vehicle,index=0){return String(vehicle?.name||vehicle?.plate||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||`Voertuig ${index+1}`);}
function drivableVehicles(){
  if(!window.LogVehicles?.list)return[];
  return window.LogVehicles.list().filter(vehicle=>window.LogVehicles.rightsFor?.(vehicle.vehicleId)?.includes('drive'));
}
function selectedVehicle(select,vehicles){
  return vehicles.find(vehicle=>vehicle.vehicleId===String(select?.value||''))||vehicles[0]||null;
}
function ensureHeroControl(form,wrap,vehicles,select){
  const hero=document.querySelector('.hero.start-preparing');
  if(!hero)return;
  let row=hero.querySelector('[data-log-hero-vehicle]');
  if(!row){
    row=document.createElement('div');
    row.dataset.logHeroVehicle='1';
    row.className='log-hero-vehicle';
    const p=hero.querySelector('p');
    if(p)p.insertAdjacentElement('afterend',row);
    else hero.querySelector('[data-action="cancel-start"],[data-action="start"]')?.insertAdjacentElement('beforebegin',row);
  }

  const selected=selectedVehicle(select,vehicles);
  if(!selected){row.remove();return;}

  if(vehicles.length===1){
    if(select&&select.value!==selected.vehicleId)select.value=selected.vehicleId;
    const markup=`<span class="log-hero-vehicle-name">${esc(vehicleName(selected))}</span>`;
    if(row.innerHTML!==markup)row.innerHTML=markup;
    row.classList.remove('selectable');
    return;
  }

  row.classList.add('selectable');
  const options=vehicles.map((vehicle,index)=>`<option value="${esc(vehicle.vehicleId)}"${vehicle.vehicleId===selected.vehicleId?' selected':''}>${esc(vehicleName(vehicle,index))}</option>`).join('');
  let proxy=row.querySelector('[data-log-hero-vehicle-select]');
  if(!proxy){
    row.innerHTML=`<select data-log-hero-vehicle-select aria-label="Auto voor deze rit">${options}</select>`;
    proxy=row.querySelector('[data-log-hero-vehicle-select]');
    proxy.addEventListener('change',()=>{
      if(!select)return;
      select.value=proxy.value;
      select.dispatchEvent(new Event('change',{bubbles:true}));
      queue();
    });
  }else{
    const current=proxy.value;
    if(proxy.innerHTML!==options)proxy.innerHTML=options;
    proxy.value=selected.vehicleId||current;
  }
}
function decorate(){
  queued=false;
  const form=document.getElementById('startForm');
  const existingHero=document.querySelector('[data-log-hero-vehicle]');
  if(!form){existingHero?.remove();return;}
  const wrap=form.querySelector('.log-start-vehicle');
  if(!wrap)return;

  wrap.hidden=true;
  wrap.setAttribute('aria-hidden','true');
  const vehicles=drivableVehicles();
  const select=wrap.querySelector('[data-log-start-vehicle]');
  if(!vehicles.length){existingHero?.remove();return;}
  ensureHeroControl(form,wrap,vehicles,select);
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(decorate);}
function styles(){
  if(document.getElementById('logVehicleStartLayoutStyles'))return;
  const style=document.createElement('style');style.id='logVehicleStartLayoutStyles';style.textContent=`
    #startForm>.log-start-vehicle[hidden]{display:none!important}
    .hero.start-preparing .log-hero-vehicle{display:flex;align-items:center;min-height:22px;margin:-2px 0 12px;color:var(--muted);font-size:12px;font-weight:600}
    .hero.start-preparing .log-hero-vehicle-name{opacity:.88}
    .hero.start-preparing .log-hero-vehicle select{appearance:auto;-webkit-appearance:auto;max-width:100%;padding:0 20px 0 0;border:0;background:transparent;color:var(--muted);font:inherit;font-weight:650;outline:0}
    .hero.start-preparing .log-hero-vehicle.selectable select{cursor:pointer}
  `;document.head.appendChild(style);
}
function init(){
  styles();queue();
  new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});
  ['log-vehicles-change','log-km-state-change','pageshow'].forEach(name=>window.addEventListener(name,queue));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
