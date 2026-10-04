(function(){
'use strict';

const KM='kmreg-test-v4-data';
const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-vehicles-v1';
const SECTION='kmreg-test-shell-section-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let root=null;
let query='';
let queued=false;
let observer=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function vehicleName(vehicle,index=0){return String(vehicle?.name||vehicle?.plate||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||`Auto ${index+1}`);}
function locationLabel(value){return String(value?.name||value?.address||'');}
function km(value){const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat('nl-NL',{maximumFractionDigits:0}).format(n)+' km':'—';}
function currentSection(){return String(localStorage.getItem(SECTION)||'');}
function state(){try{return window.LogVehicles?.state?.()||read(STORE,{});}catch(_){return read(STORE,{});}}
function vehicles(){
  try{const list=window.LogVehicles?.list?.();if(Array.isArray(list))return list;}catch(_){ }
  return Object.values(state().vehicles||{});
}
function statusFor(vehicle){
  try{return window.LogVehiclePosition?.lastKnown?.(vehicle.vehicleId)||vehicle.lastKnown||null;}catch(_){return vehicle.lastKnown||null;}
}
function personName(personId){
  const id=String(personId||''),time=read(TIME,{}),people=Array.isArray(time.colleagues)?time.colleagues:[];
  const person=people.find(item=>String(item.id||item.logPersonId||'')===id||String(item.logPersonId||'')===id);
  if(person?.name)return String(person.name);
  const self=String(window.LogIdentitySync?.personId?.()||'');
  if(id&&id===self)return'Ik';
  return'Onbekend';
}
function driverNames(vehicle){
  return (Array.isArray(vehicle?.drivers)?vehicle.drivers:[]).map(item=>personName(item.personId)).filter(Boolean);
}
function usage(vehicleId){
  const data=read(KM,{}),id=String(vehicleId||''),trips=(Array.isArray(data.trips)?data.trips:[]).filter(trip=>String(trip?.vehicleId||'')===id);
  return{trips:trips.length,active:String(data.activeTrip?.vehicleId||'')===id};
}
function idRow(vehicle){return `<div class="log-vehicle-id" hidden><span>ID</span><strong>${esc(vehicle.vehicleId)}</strong></div>`;}
function card(vehicle,index,activeId){
  const status=statusFor(vehicle),drivers=driverNames(vehicle),use=usage(vehicle.vehicleId),name=vehicleName(vehicle,index),detail=[vehicle.plate,[vehicle.brand,vehicle.model].filter(Boolean).join(' ')].filter(Boolean).join(' · '),search=[name,detail,locationLabel(status?.location),personName(vehicle.ownerPersonId),drivers.join(' ')].join(' ').toLocaleLowerCase('nl');
  if(query&&!search.includes(query))return'';
  const isActive=vehicle.vehicleId===activeId;
  return `<article class="log-vehicle-card auto-module-card${isActive?' active':''}" data-vehicle-card="${esc(vehicle.vehicleId)}" data-auto-search="${esc(search)}">
    <button type="button" class="auto-module-open" data-auto-open="${esc(vehicle.vehicleId)}" aria-label="${esc(name)} openen">
      <div class="log-vehicle-card-head">
        <span class="auto-module-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5.5 16.5h13M7 16.5l1-5h8l1 5M9 11.5l1-3h4l1 3"/><circle cx="8" cy="17.5" r="1.5"/><circle cx="16" cy="17.5" r="1.5"/></svg></span>
        <div class="auto-module-title"><strong>${esc(name)}</strong><small>${esc(detail||'Geen kenteken')}</small></div>
        ${isActive?'<span class="log-vehicle-active">Actief</span>':''}
      </div>
      <div class="auto-module-status">
        <span><small>Stand</small><strong>${esc(status?.odometer!=null?km(status.odometer):(vehicle.initialOdometer!==undefined&&String(vehicle.initialOdometer)!==''?km(vehicle.initialOdometer):'—'))}</strong></span>
        <span><small>Locatie</small><strong>${esc(status?.location?locationLabel(status.location):'Onbekend')}</strong></span>
      </div>
      <div class="auto-module-foot"><span>${use.trips} ${use.trips===1?'rit':'ritten'}</span><span>Op naam van ${esc(personName(vehicle.ownerPersonId))}</span></div>
    </button>
    ${idRow(vehicle)}
  </article>`;
}
function moduleMarkup(){
  const list=vehicles(),s=state(),activeId=String(s.activeVehicleId||window.LogVehicles?.active?.()?.vehicleId||''),cards=list.map((vehicle,index)=>card(vehicle,index,activeId)).filter(Boolean).join('');
  return `<section class="vehicle-module">
    <div class="auto-module-toolbar"><button type="button" class="btn primary" data-auto-add>＋ Auto toevoegen</button></div>
    <div class="auto-module-list">${cards||'<div class="empty">Geen auto’s gevonden.</div>'}</div>
  </section>`;
}
function syncChrome(){
  if(currentSection()!=='autos')return;
  const list=vehicles(),title=document.getElementById('kmShellTitle'),meta=document.getElementById('kmShellMeta');
  if(title&&title.textContent!=='Auto’s')title.textContent='Auto’s';
  const text=`${list.length} ${list.length===1?'auto':'auto’s'}`;
  if(meta&&meta.textContent!==text)meta.textContent=text;
  if(document.title!=='Auto’s · Log')document.title='Auto’s · Log';
}
function patchNavIcon(){
  const svg='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 16.5h15M6.5 16.5l1.2-5.5h8.6l1.2 5.5M9 11l1-3h4l1 3"/><circle cx="8" cy="17.5" r="1.5"/><circle cx="16" cy="17.5" r="1.5"/></svg>';
  document.querySelectorAll('[data-shell-section="autos"],[data-shell-tab="autos"],.km-shell-module-row[data-module-id="autos"] .km-shell-module-icon').forEach(node=>{
    const current=node.matches('svg')?node:node.querySelector('svg');
    if(current?.dataset.autoIcon==='1')return;
    if(current){const holder=document.createElement('span');holder.innerHTML=svg;const next=holder.firstElementChild;next.dataset.autoIcon='1';current.replaceWith(next);}
  });
}
function hideSettingsVehicleBlock(){
  const block=document.getElementById('kmShellVehicleIdentities');
  if(block){block.hidden=true;block.style.display='none';}
}
function findVehicleCardInSheet(id){return [...document.querySelectorAll('[data-vehicle-card]')].find(card=>String(card.dataset.vehicleCard||'')===String(id)&&card.closest('.cards-dialog,.cards-sheet,[role="dialog"]'))||null;}
function openLegacyEditor(id=''){
  window.LogVehicles?.showManager?.();
  let attempts=0;
  const run=()=>{
    const panel=document.querySelector('.cards-dialog,.cards-sheet,[role="dialog"]');
    if(!panel&&attempts++<20){setTimeout(run,35);return;}
    const target=id?findVehicleCardInSheet(id)?.querySelector('[data-vehicle-edit]'):panel?.querySelector('[data-vehicle-new]');
    if(target){target.click();return;}
    if(attempts++<20)setTimeout(run,35);
  };
  setTimeout(run,20);
}
function openPosition(id){
  window.LogVehicles?.showManager?.();
  let attempts=0;
  const run=()=>{
    const target=findVehicleCardInSheet(id)?.querySelector('[data-vehicle-position]');
    if(target){target.click();return;}
    if(attempts++<25)setTimeout(run,40);
  };
  setTimeout(run,30);
}
function openRides(id){
  try{window.LogVehicles?.select?.(id);}catch(_){ }
  window.LogCardsUI?.close?.();
  localStorage.setItem(SECTION,'rides');
  window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section:'rides'}}));
}
function detail(id){
  const list=vehicles(),vehicle=list.find(item=>String(item.vehicleId||'')===String(id));if(!vehicle)return;
  const status=statusFor(vehicle),drivers=driverNames(vehicle),use=usage(id),canManage=window.LogVehicles?.rightsFor?.(id)?.includes('manage')!==false;
  const owner=personName(vehicle.ownerPersonId),name=vehicleName(vehicle,list.indexOf(vehicle));
  const panel=window.LogCardsUI?.sheet?.(name,`<div class="auto-detail">
    <div class="auto-detail-grid">
      <span><small>Stand</small><strong>${esc(status?.odometer!=null?km(status.odometer):(vehicle.initialOdometer!==undefined&&String(vehicle.initialOdometer)!==''?km(vehicle.initialOdometer):'—'))}</strong></span>
      <span><small>Laatste locatie</small><strong>${esc(status?.location?locationLabel(status.location):'Onbekend')}</strong></span>
      <span><small>Op naam van</small><strong>${esc(owner)}</strong></span>
      <span><small>Bestuurders</small><strong>${esc(drivers.length?drivers.join(', '):'Geen')}</strong></span>
      <span><small>Ritten</small><strong>${use.trips}</strong></span>
      <span><small>Kenteken</small><strong>${esc(vehicle.plate||'—')}</strong></span>
    </div>
    <button type="button" class="btn primary full" data-auto-rides>Bekijk ritten</button>
    ${canManage?'<button type="button" class="btn secondary full" data-auto-edit>Bewerk auto</button><button type="button" class="btn secondary full" data-auto-position>Stand / locatie bijwerken</button><button type="button" class="btn danger full" data-auto-delete>Verwijder auto</button>':''}
  </div>`);
  if(!panel)return;
  panel.querySelector('[data-auto-rides]')?.addEventListener('click',()=>openRides(id));
  panel.querySelector('[data-auto-edit]')?.addEventListener('click',()=>{window.LogCardsUI?.close?.();setTimeout(()=>openLegacyEditor(id),35);});
  panel.querySelector('[data-auto-position]')?.addEventListener('click',()=>{window.LogCardsUI?.close?.();setTimeout(()=>openPosition(id),35);});
  panel.querySelector('[data-auto-delete]')?.addEventListener('click',()=>{window.LogCardsUI?.close?.();setTimeout(()=>window.LogVehicleDelete?.confirm?.(id),35);});
}
function bindRoot(){
  if(!root)return;
  root.onclick=event=>{
    const add=event.target.closest('[data-auto-add]');if(add){openLegacyEditor('');return;}
    const open=event.target.closest('[data-auto-open]');if(open){detail(open.dataset.autoOpen);return;}
  };
}
function mount(){
  if(currentSection()!=='autos'){unmount();return;}
  const host=document.getElementById('kmShellPlaceholderView');if(!host)return;
  root=host;
  const markup=moduleMarkup();
  if(!root.querySelector('.vehicle-module')||root.dataset.autoSignature!==markup){root.innerHTML=markup;root.dataset.autoSignature=markup;bindRoot();}
  syncChrome();patchNavIcon();hideSettingsVehicleBlock();
}
function unmount(){if(root){root.onclick=null;root=null;}syncChrome();}
function refresh(){queue();}
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;patchNavIcon();hideSettingsVehicleBlock();if(currentSection()==='autos')mount();});}
function search(value){query=String(value||'').trim().toLocaleLowerCase('nl');mount();return root?.querySelectorAll('.auto-module-card').length||0;}
function installStyles(){
  if(document.getElementById('logVehicleModuleStyles'))return;
  const style=document.createElement('style');style.id='logVehicleModuleStyles';style.textContent=`
    #kmShellVehicleIdentities{display:none!important}
    .vehicle-module{display:grid;gap:12px;padding:2px 0 18px}
    .auto-module-toolbar{display:flex;justify-content:flex-end;margin-bottom:2px}.auto-module-toolbar .btn{min-height:42px;padding:10px 13px}
    .auto-module-list{display:grid;gap:9px}
    .auto-module-card{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:14px;background:var(--card)}
    .auto-module-card.active{border-color:color-mix(in srgb,var(--accent) 44%,var(--line))}
    .auto-module-open{display:block;width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer}
    .auto-module-card .log-vehicle-card-head{display:flex;align-items:center;gap:10px;padding:14px 14px 10px}
    .auto-module-icon{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border:1px solid var(--line);border-radius:12px;color:var(--accent);background:var(--card2)}
    .auto-module-icon svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .auto-module-title{flex:1;min-width:0}.auto-module-title strong,.auto-module-title small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.auto-module-title strong{font-size:16px}.auto-module-title small{margin-top:3px;color:var(--muted);font-size:11px}
    .auto-module-card .log-vehicle-active{flex:none;padding:5px 7px;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
    .auto-module-status{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px 12px}.auto-module-status>span{min-width:0;padding:10px;border-radius:10px;background:var(--card2)}.auto-module-status small,.auto-module-status strong{display:block}.auto-module-status small{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.auto-module-status strong{margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
    .auto-module-foot{display:flex;justify-content:space-between;gap:8px;padding:10px 14px;border-top:1px solid var(--line);color:var(--muted);font-size:10px}.auto-module-foot span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .auto-module-card .log-vehicle-id{grid-template-columns:auto 1fr;gap:8px;padding:9px 14px;border-top:1px solid var(--line);font-size:11px}.auto-module-card .log-vehicle-id span{color:var(--muted)}.auto-module-card .log-vehicle-id strong{text-align:right;font-family:"SFMono-Regular",Consolas,monospace}
    .auto-detail{display:grid;gap:9px}.auto-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px}.auto-detail-grid>span{min-width:0;padding:11px;border:1px solid var(--line);border-radius:11px;background:var(--card2)}.auto-detail-grid small,.auto-detail-grid strong{display:block}.auto-detail-grid small{color:var(--muted);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.auto-detail-grid strong{margin-top:4px;overflow-wrap:anywhere;font-size:12px}.auto-detail .btn.danger{margin-top:4px}
    @media(max-width:520px){.auto-module-card .log-vehicle-card-head{padding:12px 12px 9px}.auto-module-status{padding:0 12px 10px}.auto-module-foot{padding:9px 12px}.auto-detail-grid{grid-template-columns:1fr 1fr}}
  `;document.head.appendChild(style);
}
function init(){
  installStyles();queue();
  ['log-shell-view-refresh','log-vehicles-change','log-km-state-change','log-navigation-modules-change','pageshow','storage'].forEach(name=>window.addEventListener(name,queue));
  observer=new MutationObserver(queue);observer.observe(document.documentElement,{childList:true,subtree:true});
  window.LogVehicleModule={mount,unmount,refresh,search,open:detail};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
