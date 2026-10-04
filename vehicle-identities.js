(function(){
'use strict';

const KM='kmreg-test-v4-data';
const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-vehicles-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const DRIVER_RIGHTS=['drive','view-own-trips','view-gaps','request-trip-details'];
let mutating=false;
let mountQueued=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function randomId(){const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);return Array.from(bytes,b=>ALPHABET[b&63]).join('');}
function selfId(){const value=window.LogIdentitySync?.personId?.()||read(TIME,{}).settings?.selfPersonId||'';return String(value);}
function vehicleName(vehicle,index=0){return String(vehicle?.name||vehicle?.plate||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||`Voertuig ${index+1}`);}
function normalizeDriver(value){const personId=String(value?.personId||'');if(!VALID.test(personId))return null;const rights=Array.isArray(value?.rights)?value.rights.filter(Boolean):DRIVER_RIGHTS;return{personId,rights:[...new Set(rights)],addedAt:value?.addedAt||new Date().toISOString()};}
function state(){
  const current=read(STORE,{}),vehicles={};
  for(const [id,value] of Object.entries(current.vehicles||{})){
    if(!VALID.test(id)||!value||typeof value!=='object')continue;
    vehicles[id]={...value,vehicleId:id,drivers:(Array.isArray(value.drivers)?value.drivers:[]).map(normalizeDriver).filter(Boolean)};
  }
  return{version:1,activeVehicleId:VALID.test(String(current.activeVehicleId||''))?String(current.activeVehicleId):'',vehicles,updatedAt:current.updatedAt||null};
}
function save(value){value.updatedAt=new Date().toISOString();write(STORE,value);window.dispatchEvent(new CustomEvent('log-vehicles-change'));queueMount();}
function metadataFromKm(km){const s=km.settings||{};return{name:String(s.vehicleName||s.carName||''),plate:String(s.plate||''),brand:String(s.vehicleBrand||''),model:String(s.vehicleModel||'')};}
function syncLegacyPointer(vehicle){
  if(!vehicle)return;
  const km=read(KM,{});km.settings=km.settings&&typeof km.settings==='object'?km.settings:{};
  km.settings.activeVehicleId=vehicle.vehicleId;
  km.settings.logVehicleId=vehicle.vehicleId;
  km.settings.plate=vehicle.plate||'';
  km.settings.vehicleBrand=vehicle.brand||'';
  km.settings.vehicleModel=vehicle.model||'';
  if(vehicle.name)km.settings.vehicleName=vehicle.name;
  write(KM,km);
}
function knownTripVehicleIds(km){
  const ids=new Set();
  for(const trip of Array.isArray(km.trips)?km.trips:[])if(VALID.test(String(trip?.vehicleId||'')))ids.add(String(trip.vehicleId));
  if(VALID.test(String(km.activeTrip?.vehicleId||'')))ids.add(String(km.activeTrip.vehicleId));
  for(const event of Array.isArray(km.events)?km.events:[])if(VALID.test(String(event?.vehicleId||'')))ids.add(String(event.vehicleId));
  return ids;
}
function migrate(){
  if(mutating)return state();mutating=true;
  try{
    const km=read(KM,{});km.settings=km.settings&&typeof km.settings==='object'?km.settings:{};
    const s=state(),me=selfId(),meta=metadataFromKm(km),known=knownTripVehicleIds(km);
    let active=VALID.test(String(s.activeVehicleId||''))?s.activeVehicleId:(VALID.test(String(km.settings.activeVehicleId||''))?String(km.settings.activeVehicleId):(VALID.test(String(km.settings.logVehicleId||''))?String(km.settings.logVehicleId):''));
    if(!active)active=[...known][0]||randomId();
    known.add(active);
    let changed=false;
    for(const id of known){
      if(!s.vehicles[id]){
        const isActive=id===active;
        s.vehicles[id]={schema:'log.vehicle.v1',version:1,vehicleId:id,name:isActive?meta.name:'',plate:isActive?meta.plate:'',brand:isActive?meta.brand:'',model:isActive?meta.model:'',ownerPersonId:VALID.test(me)?me:'',drivers:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
        changed=true;
      }
    }
    const activeVehicle=s.vehicles[active];
    if(activeVehicle){
      if(!VALID.test(String(activeVehicle.ownerPersonId||''))&&VALID.test(me)){activeVehicle.ownerPersonId=me;changed=true;}
      const hasMeta=Boolean(meta.name||meta.plate||meta.brand||meta.model);
      if(hasMeta){
        for(const key of ['name','plate','brand','model'])if(meta[key]&&activeVehicle[key]!==meta[key]){activeVehicle[key]=meta[key];changed=true;}
      }
    }
    const tag=id=>{if(!VALID.test(String(id||'')))return active;return String(id);};
    if(Array.isArray(km.trips))for(const trip of km.trips){const next=tag(trip.vehicleId);if(trip.vehicleId!==next){trip.vehicleId=next;changed=true;}}
    if(km.activeTrip&&typeof km.activeTrip==='object'){const next=tag(km.activeTrip.vehicleId);if(km.activeTrip.vehicleId!==next){km.activeTrip.vehicleId=next;changed=true;}}
    if(Array.isArray(km.events))for(const event of km.events){const next=tag(event.vehicleId);if(event.vehicleId!==next){event.vehicleId=next;changed=true;}}
    if(s.activeVehicleId!==active){s.activeVehicleId=active;changed=true;}
    if(km.settings.activeVehicleId!==active||km.settings.logVehicleId!==active){km.settings.activeVehicleId=active;km.settings.logVehicleId=active;changed=true;}
    if(changed){write(KM,km);save(s);}
    patchIdentityApi();
    return s;
  }finally{mutating=false;}
}
function list(){const s=migrate();return Object.values(s.vehicles).sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));}
function active(){const s=migrate();return s.vehicles[s.activeVehicleId]||null;}
function select(vehicleId){
  const s=migrate(),id=String(vehicleId||'');if(!s.vehicles[id])throw Error('Voertuig niet gevonden.');
  s.activeVehicleId=id;save(s);syncLegacyPointer(s.vehicles[id]);window.LogIdentitySync?.tagLocalRegistrations?.();window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{reason:'vehicle-selected',vehicleId:id}}));return s.vehicles[id];
}
function create(data={}){
  const s=migrate(),me=selfId();let id=randomId();while(s.vehicles[id])id=randomId();
  const owner=VALID.test(String(data.ownerPersonId||''))?String(data.ownerPersonId):me;
  const vehicle={schema:'log.vehicle.v1',version:1,vehicleId:id,name:String(data.name||''),plate:String(data.plate||''),brand:String(data.brand||''),model:String(data.model||''),ownerPersonId:owner,drivers:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  s.vehicles[id]=vehicle;s.activeVehicleId=id;save(s);syncLegacyPointer(vehicle);window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{reason:'vehicle-created',vehicleId:id}}));return vehicle;
}
function update(vehicleId,patch={}){
  const s=migrate(),id=String(vehicleId||''),vehicle=s.vehicles[id];if(!vehicle)throw Error('Voertuig niet gevonden.');
  for(const key of ['name','plate','brand','model'])if(Object.prototype.hasOwnProperty.call(patch,key))vehicle[key]=String(patch[key]||'');
  if(Object.prototype.hasOwnProperty.call(patch,'ownerPersonId')){const owner=String(patch.ownerPersonId||'');if(!VALID.test(owner))throw Error('Kies een geldige eigenaar.');vehicle.ownerPersonId=owner;}
  if(Array.isArray(patch.drivers))vehicle.drivers=patch.drivers.map(normalizeDriver).filter(Boolean).filter(driver=>driver.personId!==vehicle.ownerPersonId);
  vehicle.updatedAt=new Date().toISOString();save(s);if(s.activeVehicleId===id)syncLegacyPointer(vehicle);window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{reason:'vehicle-updated',vehicleId:id}}));return vehicle;
}
function addDriver(vehicleId,personId){
  const s=migrate(),vehicle=s.vehicles[String(vehicleId||'')],id=String(personId||'');if(!vehicle)throw Error('Voertuig niet gevonden.');if(!VALID.test(id))throw Error('Ongeldige PersonId.');if(id===vehicle.ownerPersonId)return vehicle;
  const current=(vehicle.drivers||[]).find(driver=>driver.personId===id);if(!current)vehicle.drivers.push({personId:id,rights:[...DRIVER_RIGHTS],addedAt:new Date().toISOString()});
  vehicle.updatedAt=new Date().toISOString();save(s);return vehicle;
}
function removeDriver(vehicleId,personId){const s=migrate(),vehicle=s.vehicles[String(vehicleId||'')];if(!vehicle)throw Error('Voertuig niet gevonden.');vehicle.drivers=(vehicle.drivers||[]).filter(driver=>driver.personId!==String(personId||''));vehicle.updatedAt=new Date().toISOString();save(s);return vehicle;}
function rightsFor(vehicleId,personId=selfId()){
  const vehicle=state().vehicles[String(vehicleId||'')];if(!vehicle)return[];const id=String(personId||'');
  if(id===vehicle.ownerPersonId)return['manage','drive','view-all-trips','view-own-trips','view-gaps','request-trip-details','share'];
  return [...((vehicle.drivers||[]).find(driver=>driver.personId===id)?.rights||[])];
}
function firstValue(obj,keys){for(const key of keys){const value=obj?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function tripStart(trip){return firstValue(trip,['departureTime','startTime','startedAt','start','date','createdAt']);}
function tripEnd(trip){return firstValue(trip,['arrivalTime','endTime','endedAt','end','updatedAt']);}
function odoStart(trip){const value=firstValue(trip,['startOdometer','odometerStart','startKm','kmStart','startMileage']);return Number.isFinite(Number(value))?Number(value):null;}
function odoEnd(trip){const value=firstValue(trip,['endOdometer','odometerEnd','endKm','kmEnd','endMileage']);return Number.isFinite(Number(value))?Number(value):null;}
function distanceKm(trip){const value=firstValue(trip,['distanceKm','kilometers','km','distance']);return Number.isFinite(Number(value))?Number(value):null;}
function tripsForViewer(vehicleId,viewerPersonId=selfId()){
  const id=String(vehicleId||''),viewer=String(viewerPersonId||''),vehicle=state().vehicles[id];if(!vehicle)return[];
  const rights=rightsFor(id,viewer),canAll=rights.includes('view-all-trips'),canOwn=rights.includes('view-own-trips'),canGaps=rights.includes('view-gaps');if(!canAll&&!canOwn)return[];
  const trips=(read(KM,{}).trips||[]).filter(trip=>String(trip?.vehicleId||'')===id).slice().sort((a,b)=>new Date(tripStart(a)||0)-new Date(tripStart(b)||0));
  if(canAll)return trips.map(trip=>({...trip,visibility:'full'}));
  const out=[];
  for(const trip of trips){
    if(String(trip.driverPersonId||'')===viewer){out.push({...trip,visibility:'full'});continue;}
    if(!canGaps)continue;
    const previous=out[out.length-1];
    const start=tripStart(trip),end=tripEnd(trip),startKm=odoStart(trip),endKm=odoEnd(trip),km=distanceKm(trip);
    if(previous?.kind==='vehicle-gap'){
      previous.endTime=end||previous.endTime;
      if(previous.startOdometer==null&&startKm!=null)previous.startOdometer=startKm;
      if(endKm!=null)previous.endOdometer=endKm;
      if(km!=null)previous.distanceKm=(Number(previous.distanceKm)||0)+km;
      previous.hiddenTripCount+=1;
    }else out.push({kind:'vehicle-gap',visibility:'gap',vehicleId:id,startTime:start,endTime:end,startOdometer:startKm,endOdometer:endKm,distanceKm:km,hiddenTripCount:1,requestable:rights.includes('request-trip-details')});
  }
  return out;
}
function connectedPeople(){
  const time=read(TIME,{}),people=Array.isArray(time.colleagues)?time.colleagues:[],me=selfId(),rows=[];
  for(const person of people){const id=String(person.id||'');if(!VALID.test(id))continue;if(id===me){rows.push({personId:id,name:person.name||'Ik',self:true});continue;}if(window.LogPersonConnections?.isConnected?.(id))rows.push({personId:id,name:person.name||id,self:false});}
  if(VALID.test(me)&&!rows.some(row=>row.personId===me))rows.unshift({personId:me,name:'Ik',self:true});
  return rows;
}
function personName(personId){const id=String(personId||''),row=connectedPeople().find(item=>item.personId===id);if(row)return row.name;const person=(read(TIME,{}).colleagues||[]).find(item=>String(item.id)===id);return person?.name||id;}
function cardMarkup(vehicle,index,activeId){
  const isActive=vehicle.vehicleId===activeId,owner=personName(vehicle.ownerPersonId),drivers=(vehicle.drivers||[]).length;
  return `<div class="log-vehicle-card${isActive?' active':''}" data-vehicle-card="${esc(vehicle.vehicleId)}"><div class="log-vehicle-card-head"><span class="log-vehicle-icon">🚗</span><div><strong>${esc(vehicleName(vehicle,index))}</strong><small>${esc(vehicle.plate||[vehicle.brand,vehicle.model].filter(Boolean).join(' ')||'Geen kenteken')}</small></div>${isActive?'<span class="log-vehicle-active">Actief</span>':''}</div><div class="log-vehicle-id"><span>VehicleId</span><strong>${esc(vehicle.vehicleId)}</strong></div><div class="log-vehicle-meta"><span>Op naam van</span><strong>${esc(owner||'Onbekend')}</strong><span>Bestuurders</span><strong>${drivers}</strong></div><div class="log-vehicle-actions">${isActive?'':'<button type="button" class="btn secondary" data-vehicle-use>Gebruik</button>'}<button type="button" class="btn secondary" data-vehicle-edit>Bewerk</button></div></div>`;
}
function sheet(title,html){return window.LogCardsUI?.sheet?.(title,html)||null;}
function showManager(){
  const s=migrate(),vehicles=Object.values(s.vehicles),panel=sheet('Voertuigen',`<p class="cards-notice">Elke auto heeft een eigen 12-teken VehicleId. Nieuwe ritten worden aan het actieve voertuig gekoppeld.</p><div class="log-vehicle-list">${vehicles.map((vehicle,index)=>cardMarkup(vehicle,index,s.activeVehicleId)).join('')}</div><button type="button" class="btn primary full" data-vehicle-new>＋ Voertuig toevoegen</button>`);if(!panel)return;
  panel.querySelector('[data-vehicle-new]')?.addEventListener('click',()=>showForm(''));
  panel.querySelectorAll('[data-vehicle-card]').forEach(card=>{
    const id=card.dataset.vehicleCard;
    card.querySelector('[data-vehicle-use]')?.addEventListener('click',()=>{select(id);showManager();});
    card.querySelector('[data-vehicle-edit]')?.addEventListener('click',()=>showForm(id));
  });
}
function showForm(vehicleId=''){
  const s=migrate(),vehicle=vehicleId?s.vehicles[vehicleId]:null,people=connectedPeople(),owner=vehicle?.ownerPersonId||selfId(),drivers=new Set((vehicle?.drivers||[]).map(driver=>driver.personId));
  const options=people.map(person=>`<option value="${esc(person.personId)}"${person.personId===owner?' selected':''}>${esc(person.name)}</option>`).join('');
  const driverRows=people.filter(person=>person.personId!==owner).map(person=>`<label class="log-vehicle-driver"><input type="checkbox" value="${esc(person.personId)}"${drivers.has(person.personId)?' checked':''}><span>${esc(person.name)}</span></label>`).join('')||'<p class="cards-notice">Maak eerst een bevestigde persoonsverbinding om iemand als bestuurder toe te voegen.</p>';
  const panel=sheet(vehicle?'Voertuig bewerken':'Voertuig toevoegen',`<form class="people-form" data-vehicle-form><label>Naam<input name="name" maxlength="80" value="${esc(vehicle?.name||'')}"></label><label>Kenteken<input name="plate" maxlength="20" value="${esc(vehicle?.plate||'')}"></label><label>Merk<input name="brand" maxlength="80" value="${esc(vehicle?.brand||'')}"></label><label>Model<input name="model" maxlength="80" value="${esc(vehicle?.model||'')}"></label><label>Op naam van<select name="ownerPersonId">${options}</select></label><div><strong>Bestuurders</strong><div class="log-vehicle-drivers">${driverRows}</div><small>Een bestuurder krijgt alleen eigen ritten te zien plus afgeschermde gaten tussen ritten.</small></div><button type="submit" class="btn primary full">Bewaar</button><button type="button" class="btn secondary full" data-vehicle-back>Terug</button><p role="status" data-vehicle-status></p></form>`);if(!panel)return;
  const form=panel.querySelector('[data-vehicle-form]'),status=panel.querySelector('[data-vehicle-status]');
  form.elements.ownerPersonId?.addEventListener('change',()=>showForm(vehicleId));
  panel.querySelector('[data-vehicle-back]')?.addEventListener('click',showManager);
  form.addEventListener('submit',event=>{event.preventDefault();try{const fd=new FormData(form),ownerPersonId=String(fd.get('ownerPersonId')||''),selected=[...form.querySelectorAll('.log-vehicle-driver input:checked')].map(input=>input.value).filter(id=>id!==ownerPersonId),drivers=selected.map(personId=>({personId,rights:[...DRIVER_RIGHTS],addedAt:new Date().toISOString()})),data={name:fd.get('name'),plate:fd.get('plate'),brand:fd.get('brand'),model:fd.get('model'),ownerPersonId,drivers};if(vehicle)update(vehicle.vehicleId,data);else{const created=create(data);update(created.vehicleId,{drivers});}showManager();}catch(error){status.textContent=error.message;}});
}
function mountSettings(){
  mountQueued=false;migrate();hideLegacyVehicleId();
  const identity=document.getElementById('kmShellIdentitySync');if(!identity||document.getElementById('kmShellVehicleIdentities'))return;
  const a=active(),count=list().length,name=vehicleName(a||{},0);
  identity.insertAdjacentHTML('afterend',`<details class="km-shell-settings-accordion" id="kmShellVehicleIdentities"><summary><span class="km-shell-settings-accordion-title"><strong>Voertuigen</strong><small>${count} ${count===1?'voertuig':'voertuigen'} · actief ${esc(name)}</small></span><span class="km-shell-settings-accordion-arrow">›</span></summary><div class="km-shell-settings-accordion-body"><p class="cards-notice">Voertuigen hebben ieder een eigen VehicleId. Ritten horen bij een voertuig én een bestuurder.</p><button type="button" class="btn secondary full" data-vehicle-manage>Voertuigen beheren</button></div></details>`);
  document.querySelector('[data-vehicle-manage]')?.addEventListener('click',showManager);
}
function queueMount(){if(mountQueued)return;mountQueued=true;requestAnimationFrame(mountSettings);}
function hideLegacyVehicleId(){
  document.querySelectorAll('.log-identity-card span').forEach(span=>{if(span.textContent.trim()==='VehicleId'){span.nextElementSibling?.remove();span.remove();}});
  const small=document.querySelector('#kmShellIdentitySync summary small');if(small&&/·\s*auto\s+/i.test(small.textContent))small.textContent=small.textContent.replace(/\s*·\s*auto\s+\S+/i,'');
}
function patchIdentityApi(){
  const api=window.LogIdentitySync;if(!api||api.__multiVehiclePatched)return;
  api.vehicleId=()=>active()?.vehicleId||'';
  api.vehicles=()=>list();
  api.__multiVehiclePatched=true;
}
function installStyles(){if(document.getElementById('logVehicleIdentityStyles'))return;const style=document.createElement('style');style.id='logVehicleIdentityStyles';style.textContent=`
.log-vehicle-list{display:grid;gap:10px;margin:12px 0 16px}.log-vehicle-card{padding:13px;border:1px solid var(--line);border-radius:15px;background:var(--card2)}.log-vehicle-card.active{box-shadow:inset 3px 0 0 var(--accent)}.log-vehicle-card-head{display:flex;align-items:center;gap:10px}.log-vehicle-card-head>div{flex:1}.log-vehicle-card-head strong,.log-vehicle-card-head small{display:block}.log-vehicle-card-head small{margin-top:3px;color:var(--muted)}.log-vehicle-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:color-mix(in srgb,var(--accent) 12%,transparent)}.log-vehicle-active{padding:5px 8px;border-radius:999px;background:color-mix(in srgb,var(--good,#49d17d) 18%,transparent);font-size:10px;font-weight:750}.log-vehicle-id,.log-vehicle-meta{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;margin-top:11px}.log-vehicle-id span,.log-vehicle-meta span{font-size:11px;color:var(--muted)}.log-vehicle-id strong,.log-vehicle-meta strong{font-size:12px;text-align:right;overflow-wrap:anywhere}.log-vehicle-id strong{font-family:"SFMono-Regular",Consolas,monospace}.log-vehicle-actions{display:flex;gap:8px;margin-top:12px}.log-vehicle-actions .btn{flex:1}.log-vehicle-drivers{display:grid;gap:7px;margin:8px 0}.log-vehicle-driver{display:flex!important;grid-template-columns:none!important;align-items:center;gap:9px!important;padding:9px 10px;border:1px solid var(--line);border-radius:11px}.log-vehicle-driver input{width:20px!important;height:20px!important;flex:none}
`;document.head.appendChild(style);}
function init(){
  installStyles();migrate();patchIdentityApi();queueMount();
  new MutationObserver(()=>{hideLegacyVehicleId();queueMount();}).observe(document.documentElement,{childList:true,subtree:true});
  ['log-km-state-change','log-time-state-change','log-person-connections-change','pageshow'].forEach(name=>window.addEventListener(name,()=>{migrate();patchIdentityApi();queueMount();}));
  window.LogVehicles={state,migrate,list,active,select,create,update,addDriver,removeDriver,rightsFor,tripsForViewer,showManager};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
