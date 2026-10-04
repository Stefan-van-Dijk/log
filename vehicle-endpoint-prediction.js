(function(){
'use strict';

const KM='kmreg-test-v4-data';
const STORE='log-test-vehicles-v1';
const START_PENDING='log-test-pending-vehicle-start-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let reconciling=false;
let applyingStart=false;
let bindAttempts=0;
let queued=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function number(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function timeValue(value){const n=Date.parse(String(value||''));return Number.isFinite(n)?n:0;}
function locationLabel(location){return String(location?.name||location?.address||'Onbekende locatie');}
function coord(value){
  if(!value)return null;
  const lat=number(value.lat??value.latitude??value.coords?.latitude),lng=number(value.lng??value.longitude??value.coords?.longitude);
  return lat!=null&&lng!=null&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
function distanceMeters(a,b){
  const aa=coord(a),bb=coord(b);if(!aa||!bb)return null;
  const r=Math.PI/180,dLat=(bb.lat-aa.lat)*r,dLng=(bb.lng-aa.lng)*r;
  const q=Math.sin(dLat/2)**2+Math.cos(aa.lat*r)*Math.cos(bb.lat*r)*Math.sin(dLng/2)**2;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(q)));
}
function sameText(a,b){return String(a||'').trim().toLocaleLowerCase('nl')===String(b||'').trim().toLocaleLowerCase('nl');}
function sameLocation(a,b){
  if(!a||!b)return false;
  if(a.id&&b.id&&String(a.id)===String(b.id))return true;
  const d=distanceMeters(a,b);if(d!=null&&d<=75)return true;
  return Boolean(a.address&&b.address&&sameText(a.address,b.address));
}
function vehicleName(vehicle,index=0){return String(vehicle?.name||vehicle?.plate||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||`Voertuig ${index+1}`);}
function tripArrival(trip){return trip?.arrivalTime||trip?.endTime||trip?.endedAt||trip?.updatedAt||trip?.departureTime||trip?.createdAt||null;}
function tripStatus(trip){
  if(!trip)return null;
  const odometer=number(trip.endOdometer??trip.odometerEnd??trip.endKm??trip.kmEnd??trip.endMileage);
  const location=trip.destination?clone(trip.destination):null;
  const time=tripArrival(trip);
  if(!location&&odometer==null)return null;
  return{location,odometer,time,source:'trip',sourceTripId:String(trip.id||'')||null,updatedAt:new Date().toISOString()};
}
function lastTripByVehicle(km){
  const map=new Map();
  for(const trip of Array.isArray(km.trips)?km.trips:[]){
    const vehicleId=String(trip?.vehicleId||'');if(!VALID.test(vehicleId))continue;
    const previous=map.get(vehicleId);if(!previous||timeValue(tripArrival(trip))>=timeValue(tripArrival(previous)))map.set(vehicleId,trip);
  }
  return map;
}
function statusEqual(a,b){return JSON.stringify(a||null)===JSON.stringify(b||null);}
function mirrorToKm(store,km){
  const next={...store};
  if(JSON.stringify(km.vehicleIdentitiesV1||null)!==JSON.stringify(next)){km.vehicleIdentitiesV1=next;return true;}
  return false;
}
function reconcile(){
  if(reconciling||!window.LogVehicles?.migrate)return false;
  reconciling=true;
  try{
    window.LogVehicles.migrate();
    const store=read(STORE,{}),km=read(KM,{}),latest=lastTripByVehicle(km);
    store.vehicles=store.vehicles&&typeof store.vehicles==='object'?store.vehicles:{};
    let changed=false;
    for(const [vehicleId,vehicle] of Object.entries(store.vehicles)){
      if(!VALID.test(vehicleId)||!vehicle)continue;
      const trip=latest.get(vehicleId),derived=tripStatus(trip),current=vehicle.lastKnown||null;
      if(derived){
        const derivedTime=timeValue(derived.time),currentTime=timeValue(current?.time);
        if(!current||derivedTime>=currentTime){
          const next={...derived,updatedAt:current?.sourceTripId===derived.sourceTripId&&current?.updatedAt?current.updatedAt:derived.updatedAt};
          if(!statusEqual(current,next)){vehicle.lastKnown=next;vehicle.updatedAt=new Date().toISOString();changed=true;}
        }
      }else if(!current&&vehicleId===store.activeVehicleId&&km.lastEndpoint){
        const legacy={location:clone(km.lastEndpoint.location||null),odometer:number(km.lastEndpoint.odometer),time:km.lastEndpoint.time||null,source:'legacy',sourceTripId:null,updatedAt:new Date().toISOString()};
        if(legacy.location||legacy.odometer!=null){vehicle.lastKnown=legacy;changed=true;}
      }
    }
    if(changed){store.updatedAt=new Date().toISOString();write(STORE,store);}
    const mirrored=mirrorToKm(store,km);if(mirrored)write(KM,km);
    if(changed)window.dispatchEvent(new CustomEvent('log-vehicles-change',{detail:{reason:'vehicle-last-known'}}));
    return changed;
  }finally{reconciling=false;}
}
function lastKnown(vehicleId){reconcile();return clone(read(STORE,{}).vehicles?.[String(vehicleId||'')]?.lastKnown||null);}
function setLastKnown(vehicleId,{location=null,odometer=null,time=null,source='manual'}={}){
  const id=String(vehicleId||''),store=read(STORE,{}),vehicle=store.vehicles?.[id];if(!vehicle)throw Error('Voertuig niet gevonden.');
  const kmValue=number(odometer);if(kmValue==null||kmValue<0)throw Error('Vul een geldige kilometerstand in.');
  if(!location)throw Error('Kies de laatst bekende locatie.');
  vehicle.lastKnown={location:clone(location),odometer:kmValue,time:time||new Date().toISOString(),source,sourceTripId:null,updatedAt:new Date().toISOString()};
  vehicle.updatedAt=new Date().toISOString();store.updatedAt=vehicle.updatedAt;write(STORE,store);
  const km=read(KM,{});mirrorToKm(store,km);write(KM,km);
  window.dispatchEvent(new CustomEvent('log-vehicles-change',{detail:{reason:'vehicle-last-known-manual',vehicleId:id}}));
  return clone(vehicle.lastKnown);
}
function drivableVehicles(){
  if(!window.LogVehicles?.list)return[];
  return window.LogVehicles.list().filter(vehicle=>window.LogVehicles.rightsFor?.(vehicle.vehicleId)?.includes('drive'));
}
function predict({position=null,origin=null}={}){
  reconcile();
  const km=read(KM,{}),radius=Math.max(100,Number(km.settings?.recognitionRadius)||500),activeId=String(window.LogVehicles?.active?.()?.vehicleId||'');
  const candidates=[];
  for(const [index,vehicle] of drivableVehicles().entries()){
    const status=lastKnown(vehicle.vehicleId);if(!status?.location)continue;
    let meters=null,reason='';
    if(origin&&sameLocation(origin,status.location)){meters=0;reason='zelfde opgeslagen locatie';}
    else if(position&&coord(position)&&coord(status.location)){meters=distanceMeters(position,status.location);reason='afstand tot laatst bekende locatie';}
    else if(origin&&coord(origin)&&coord(status.location)){meters=distanceMeters(origin,status.location);reason='afstand tot vertrekpunt';}
    if(meters==null)continue;
    candidates.push({vehicle,status,meters,reason,index});
  }
  candidates.sort((a,b)=>a.meters-b.meters||timeValue(b.status.time)-timeValue(a.status.time));
  if(!candidates.length){
    const fallback=drivableVehicles().find(vehicle=>vehicle.vehicleId===activeId)||drivableVehicles()[0]||null;
    return{vehicle:fallback,status:fallback?lastKnown(fallback.vehicleId):null,confidence:'low',ambiguous:false,distanceMeters:null,reason:'geen vergelijkbare voertuiglocatie',candidates:[]};
  }
  const best=candidates[0],second=candidates[1];
  const ambiguous=Boolean(second&&best.meters<=radius&&second.meters<=radius&&Math.abs(second.meters-best.meters)<=Math.max(60,radius*.25));
  const confidence=!ambiguous&&best.meters<=radius?'high':!ambiguous&&best.meters<=radius*2?'medium':'low';
  return{...best,confidence,ambiguous,candidates,radius};
}
function formatOdometer(value){const n=number(value);return n==null?'—':new Intl.NumberFormat('nl-NL',{maximumFractionDigits:0}).format(n)+' km';}
function locationOptions(selected=''){
  const km=read(KM,{}),locations=Array.isArray(km.locations)?km.locations:[];
  return locations.map(location=>`<option value="${esc(location.id)}"${String(location.id)===String(selected)?' selected':''}>${esc(locationLabel(location))}</option>`).join('');
}
function showPositionEditor(vehicleId){
  const vehicle=read(STORE,{}).vehicles?.[String(vehicleId||'')];if(!vehicle)return;
  const km=read(KM,{}),locations=Array.isArray(km.locations)?km.locations:[],current=vehicle.lastKnown||{},selected=String(current.location?.id||'');
  if(!locations.length){window.LogCardsUI?.sheet?.('Voertuigpositie','<p class="cards-notice">Voeg eerst een locatie toe voordat je de voertuigpositie handmatig vastlegt.</p>');return;}
  const panel=window.LogCardsUI?.sheet?.('Laatste voertuigpositie',`<form class="people-form" data-vehicle-position-form><label>Locatie<select name="locationId" required>${locationOptions(selected)}</select></label><label>Kilometerstand<input name="odometer" type="number" min="0" step="1" inputmode="numeric" required value="${esc(current.odometer??'')}"></label><p class="cards-notice">Deze stand geldt als laatst bekende positie totdat een nieuwere afgeronde rit beschikbaar is.</p><button type="submit" class="btn primary full">Bewaar positie</button><p role="status" data-vehicle-position-status></p></form>`);if(!panel)return;
  const form=panel.querySelector('[data-vehicle-position-form]'),status=panel.querySelector('[data-vehicle-position-status]');
  form.addEventListener('submit',event=>{event.preventDefault();try{const fd=new FormData(form),location=locations.find(item=>String(item.id)===String(fd.get('locationId')));setLastKnown(vehicleId,{location,odometer:fd.get('odometer'),source:'manual'});window.LogCardsUI?.close?.();setTimeout(()=>window.LogVehicles?.showManager?.(),40);}catch(error){status.textContent=error.message;}});
}
function decorateVehicleCards(){
  document.querySelectorAll('[data-vehicle-card]').forEach(card=>{
    const id=String(card.dataset.vehicleCard||''),vehicle=read(STORE,{}).vehicles?.[id];if(!vehicle)return;
    const status=vehicle.lastKnown||null,meta=card.querySelector('.log-vehicle-meta');
    let row=card.querySelector('[data-vehicle-last-known]');
    if(!row){row=document.createElement('div');row.dataset.vehicleLastKnown='1';row.className='log-vehicle-last-known';meta?.insertAdjacentElement('afterend',row);}
    row.innerHTML=`<span>Laatste locatie</span><strong>${esc(status?.location?locationLabel(status.location):'Nog onbekend')}</strong><span>Kilometerstand</span><strong>${esc(formatOdometer(status?.odometer))}</strong>`;
    const actions=card.querySelector('.log-vehicle-actions');
    if(actions&&!actions.querySelector('[data-vehicle-position]')&&window.LogVehicles?.rightsFor?.(id)?.includes('manage')){
      const button=document.createElement('button');button.type='button';button.className='btn secondary';button.dataset.vehiclePosition='1';button.textContent='Positie';button.addEventListener('click',()=>showPositionEditor(id));actions.appendChild(button);
    }
  });
}
function currentOrigin(form){
  const km=read(KM,{}),value=String(form?.elements?.originId?.value||'');
  if(value==='__last__')return km.lastEndpoint?.location||null;
  return (Array.isArray(km.locations)?km.locations:[]).find(location=>String(location.id)===value)||null;
}
async function precisePosition(){
  try{
    if(window.LogLocationPrecision?.precise)return await window.LogLocationPrecision.precise('vehicle-departure');
    if(window.LogLocationPolling?.request)return await window.LogLocationPolling.request({maxAge:5000,highAccuracy:true});
  }catch(_){ }
  return null;
}
function predictionText(result){
  if(!result?.vehicle)return'Geen bruikbaar voertuigvoorstel.';
  const name=vehicleName(result.vehicle),location=result.status?.location?locationLabel(result.status.location):'onbekende locatie',odo=formatOdometer(result.status?.odometer);
  if(result.ambiguous)return`Meerdere auto's passen bij deze vertrekplek. Kies de auto · ${name} is één van de opties.`;
  if(result.confidence==='high')return`Voorstel: ${name} · laatst bij ${location} · ${odo}.`;
  if(result.confidence==='medium')return`Waarschijnlijk ${name} · ${Math.round(result.distanceMeters)} m van je vertrekplek · controleer de keuze.`;
  return`Geen zekere match. Huidige keuze blijft staan${location?` · ${name} laatst bij ${location}`:''}.`;
}
async function updateStartPrediction(form){
  if(!form?.isConnected)return;
  const select=form.querySelector('[data-log-start-vehicle]'),hint=form.querySelector('[data-log-start-vehicle-hint]');if(!select||!hint)return;
  const token=String(Date.now());form.dataset.vehiclePredictionToken=token;hint.textContent='Auto bepalen…';
  const position=await precisePosition();if(!form.isConnected||form.dataset.vehiclePredictionToken!==token)return;
  const result=predict({position,origin:currentOrigin(form)});form._vehiclePrediction=result;
  if(result?.vehicle&&!result.ambiguous&&result.confidence==='high')select.value=result.vehicle.vehicleId;
  hint.textContent=predictionText(result);
}
function decorateStartForm(){
  const form=document.getElementById('startForm');if(!form||form.dataset.vehiclePredictionBound==='1')return;
  const vehicles=drivableVehicles();if(!vehicles.length)return;
  form.dataset.vehiclePredictionBound='1';
  const activeId=String(window.LogVehicles?.active?.()?.vehicleId||'');
  const wrap=document.createElement('div');wrap.className='form-group log-start-vehicle';
  wrap.innerHTML=`<label>Auto</label><select data-log-start-vehicle aria-label="Auto voor deze rit">${vehicles.map((vehicle,index)=>{const status=lastKnown(vehicle.vehicleId);return`<option value="${esc(vehicle.vehicleId)}"${vehicle.vehicleId===activeId?' selected':''}>${esc(vehicleName(vehicle,index))}${status?.odometer!=null?' · '+esc(formatOdometer(status.odometer)):''}</option>`;}).join('')}</select><div class="start-suggestion" data-log-start-vehicle-hint>Auto bepalen…</div>`;
  const confirm=form.querySelector('.start-confirm');confirm?.insertAdjacentElement('beforebegin',wrap);
  wrap.querySelector('select')?.addEventListener('change',event=>{const vehicle=read(STORE,{}).vehicles?.[event.target.value],status=vehicle?.lastKnown;wrap.querySelector('[data-log-start-vehicle-hint]').textContent=`Gekozen: ${vehicleName(vehicle||{})}${status?.location?' · '+locationLabel(status.location):''}${status?.odometer!=null?' · '+formatOdometer(status.odometer):''}.`;});
  form.elements.originId?.addEventListener('change',()=>updateStartPrediction(form));
  updateStartPrediction(form);
}
function rememberStartChoice(form){
  const select=form?.querySelector('[data-log-start-vehicle]'),vehicleId=String(select?.value||'');if(!VALID.test(vehicleId))return;
  const originChoice=String(form.elements?.originId?.value||'');
  sessionStorage.setItem(START_PENDING,JSON.stringify({vehicleId,originChoice,createdAt:Date.now()}));
  try{if(window.LogVehicles?.active?.()?.vehicleId!==vehicleId)window.LogVehicles?.select?.(vehicleId);}catch(error){console.warn('Voertuig kiezen voor rit mislukt',error);}
}
function pendingStart(){try{return JSON.parse(sessionStorage.getItem(START_PENDING)||'null');}catch(_){return null;}}
function applyPendingStart(){
  if(applyingStart)return;
  const pending=pendingStart();if(!pending)return;
  if(Date.now()-Number(pending.createdAt||0)>20000){sessionStorage.removeItem(START_PENDING);return;}
  const km=read(KM,{}),active=km.activeTrip;if(!active)return;
  const vehicle=read(STORE,{}).vehicles?.[String(pending.vehicleId||'')];if(!vehicle){sessionStorage.removeItem(START_PENDING);return;}
  applyingStart=true;
  try{
    active.vehicleId=vehicle.vehicleId;
    const status=vehicle.lastKnown||null,odo=number(status?.odometer);
    if(odo!=null){active.startOdometer=odo;active.estimatedStartOdometer=odo;}
    if(pending.originChoice==='__last__'&&status?.location)active.origin=clone(status.location);
    km.settings=km.settings&&typeof km.settings==='object'?km.settings:{};km.settings.activeVehicleId=vehicle.vehicleId;km.settings.logVehicleId=vehicle.vehicleId;
    write(KM,km);sessionStorage.removeItem(START_PENDING);
    setTimeout(()=>window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{reason:'vehicle-start-context',vehicleId:vehicle.vehicleId}})),0);
  }finally{applyingStart=false;}
}
function installStyles(){
  if(document.getElementById('logVehicleEndpointStyles'))return;
  const style=document.createElement('style');style.id='logVehicleEndpointStyles';style.textContent=`
    .log-vehicle-last-known{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}
    .log-vehicle-last-known span{font-size:11px;color:var(--muted)}.log-vehicle-last-known strong{font-size:12px;text-align:right}
    .log-start-vehicle{margin:10px 0 12px}.log-start-vehicle select{width:100%;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--card2);color:var(--text)}
  `;document.head.appendChild(style);
}
function queueDecorate(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorateVehicleCards();decorateStartForm();});}
function patchApi(){
  const api=window.LogVehicles;if(!api){if(bindAttempts++<150)setTimeout(patchApi,60);return;}
  api.lastKnown=lastKnown;api.setLastKnown=setLastKnown;api.predictDeparture=predict;api.reconcileLastKnown=reconcile;
}
function init(){
  installStyles();patchApi();setTimeout(()=>{reconcile();queueDecorate();},120);
  new MutationObserver(queueDecorate).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('submit',event=>{if(event.target?.id==='startForm')rememberStartChoice(event.target);},true);
  ['log-km-state-change','log-vehicles-change','pageshow'].forEach(name=>window.addEventListener(name,()=>{if(name==='log-km-state-change')applyPendingStart();setTimeout(()=>{reconcile();queueDecorate();},0);}));
  window.LogVehiclePosition={reconcile,lastKnown,setLastKnown,predict,showPositionEditor,applyPendingStart};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
