(function(){
'use strict';

const KM='kmreg-test-v4-data';
const STORE='log-test-vehicles-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let queued=false;

function read(key,fallback={}){try{return JSON.parse(localStorage.getItem(key)||'{}')||fallback;}catch(_){return fallback;}}
function num(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function km(value){return new Intl.NumberFormat('nl-NL',{maximumFractionDigits:1}).format(num(value));}
function activeVehicleId(){
  const kmState=read(KM,{}),tripId=String(kmState.activeTrip?.vehicleId||'');
  if(VALID.test(tripId))return tripId;
  const uiId=String(window.LogVehicleStartUI?.currentVehicleId?.()||document.documentElement.dataset.logRideVehicle||'');
  if(VALID.test(uiId))return uiId;
  const activeId=String(window.LogVehicles?.active?.()?.vehicleId||read(STORE,{}).activeVehicleId||'');
  return VALID.test(activeId)?activeId:'';
}
function rawTrips(){const value=read(KM,{}).trips;return Array.isArray(value)?value:[];}
function allowedTripIds(vehicleId,trips){
  try{
    const projected=window.LogVehicles?.tripsForViewer?.(vehicleId);
    if(Array.isArray(projected))return new Set(projected.filter(item=>item?.visibility==='full'&&item?.id).map(item=>String(item.id)));
  }catch(_){ }
  return new Set(trips.filter(trip=>String(trip?.vehicleId||'')===vehicleId).map(trip=>String(trip.id||'')).filter(Boolean));
}
function recentSection(){return [...document.querySelectorAll('#app .section')].find(section=>section.querySelector('.section-title h2')?.textContent.trim()==='Recente ritten')||null;}
function eventsSection(){return [...document.querySelectorAll('#app .section')].find(section=>section.querySelector('.section-title h2')?.textContent.trim()==='Onderweg geregistreerd')||null;}
function setText(node,text){if(node&&node.textContent!==text)node.textContent=text;}
function scopeRecent(vehicleId,trips,allowed){
  const section=recentSection();if(!section)return[];
  const byId=new Map(trips.map(trip=>[String(trip.id||''),trip]));
  const visible=[];
  for(const entry of section.querySelectorAll('.trip-entry[data-id]')){
    const trip=byId.get(String(entry.dataset.id||''));
    const show=Boolean(trip&&String(trip.vehicleId||'')===vehicleId&&allowed.has(String(trip.id||'')));
    entry.hidden=!show;
    if(show)visible.push(trip);
  }
  section.querySelectorAll('.trip-group').forEach(group=>{group.hidden=!group.querySelector('.trip-entry[data-id]:not([hidden])');});
  setText(section.querySelector('.section-title .muted'),String(visible.length));
  let empty=section.querySelector('[data-log-vehicle-rides-empty]');
  const coreEmpty=section.querySelector('.empty:not([data-log-vehicle-rides-empty])');
  if(!visible.length&&!coreEmpty){
    if(!empty){empty=document.createElement('div');empty.className='empty';empty.dataset.logVehicleRidesEmpty='1';empty.textContent='Geen ritten voor deze auto in deze periode.';section.appendChild(empty);}
    empty.hidden=false;
  }else if(empty)empty.remove();
  return visible;
}
function totals(trips){
  return trips.reduce((out,trip)=>{
    out.total+=num(trip.actualKm);
    out.business+=num(trip.businessKm);
    out.commute+=num(trip.commuteKm);
    out.private+=num(trip.privateKm);
    return out;
  },{total:0,business:0,commute:0,private:0});
}
function scopeSummary(periodTrips){
  const summary=document.querySelector('#periodNavigator .summary');if(!summary)return;
  const values=totals(periodTrips),count=periodTrips.length;
  setText(summary.querySelector('.summary-total strong'),`${km(values.total)} km`);
  setText(summary.querySelector('.summary-total small'),`${count} ${count===1?'rit':'ritten'}`);
  const parts=[];
  if(values.business>0)parts.push(['business','Zakelijk',values.business]);
  if(values.commute>0)parts.push(['commute','Woon-werk',values.commute]);
  if(values.private>0)parts.push(['private','Privé',values.private]);
  let host=summary.querySelector('.summary-parts');
  if(!parts.length){host?.remove();return;}
  const html=parts.map(([kind,label,value])=>`<div class="summary-part category-${kind}"><span>${label}</span><strong>${km(value)} km</strong></div>`).join('');
  if(!host){host=document.createElement('div');host.className='summary-parts';summary.appendChild(host);}
  if(host.innerHTML!==html)host.innerHTML=html;
}
function scopeEvents(vehicleId,trips,allowed){
  const section=eventsSection();if(!section)return;
  const state=read(KM,{}),events=Array.isArray(state.events)?state.events:[],eventById=new Map(events.map(event=>[String(event.id||''),event])),tripById=new Map(trips.map(trip=>[String(trip.id||''),trip]));
  let count=0;
  section.querySelectorAll('.inline-event-swipe[data-id]').forEach(row=>{
    const event=eventById.get(String(row.dataset.id||'')),trip=event?.tripId?tripById.get(String(event.tripId)):null;
    const eventVehicle=String(event?.vehicleId||trip?.vehicleId||'');
    const show=Boolean(event&&eventVehicle===vehicleId&&(!trip||allowed.has(String(trip.id||''))));
    row.hidden=!show;if(show)count++;
  });
  setText(section.querySelector('.section-title .muted'),String(count));
  let empty=section.querySelector('[data-log-vehicle-events-empty]');
  if(!count){if(!empty){empty=document.createElement('div');empty.className='empty';empty.dataset.logVehicleEventsEmpty='1';empty.textContent='Geen punten voor deze auto in deze periode.';section.appendChild(empty);}}else empty?.remove();
}
function scopeHeader(vehicleId,trips,allowed){
  const title=document.getElementById('kmShellTitle'),meta=document.getElementById('kmShellMeta');
  if(title?.textContent.trim()!=='Ritten'||!meta)return;
  const count=trips.filter(trip=>String(trip.vehicleId||'')===vehicleId&&allowed.has(String(trip.id||''))).length;
  setText(meta,`${count} ${count===1?'rit':'ritten'} geregistreerd`);
}
function apply(){
  queued=false;
  const vehicleId=activeVehicleId();if(!VALID.test(vehicleId))return;
  const trips=rawTrips(),allowed=allowedTripIds(vehicleId,trips);
  const periodTrips=scopeRecent(vehicleId,trips,allowed);
  scopeSummary(periodTrips);
  scopeEvents(vehicleId,trips,allowed);
  scopeHeader(vehicleId,trips,allowed);
  document.documentElement.dataset.logRideVehicle=vehicleId;
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(apply);}
function init(){
  queue();
  new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});
  ['log-vehicle-scope-change','log-vehicles-change','log-km-state-change','log-shell-view-refresh','pageshow'].forEach(name=>window.addEventListener(name,queue));
  window.LogVehicleRideScope={vehicleId:activeVehicleId,refresh:queue};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
