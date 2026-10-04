(function(){
'use strict';

const KM='kmreg-test-v4-data';
const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-vehicles-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const DAY_LABELS=['Zo','Ma','Di','Wo','Do','Vr','Za'];
let queued=false;
let writing=false;
let currentDetailId='';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function selfId(){return String(window.LogIdentitySync?.personId?.()||read(TIME,{}).settings?.selfPersonId||'');}
function store(){const value=read(STORE,{});value.vehicles=value.vehicles&&typeof value.vehicles==='object'?value.vehicles:{};return value;}
function vehicleName(vehicle,index=0){return String(vehicle?.name||vehicle?.plate||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||`Auto ${index+1}`);}
function personName(personId){
  const id=String(personId||''),time=read(TIME,{}),people=Array.isArray(time.colleagues)?time.colleagues:[];
  const person=people.find(item=>String(item.id||'')===id||String(item.logPersonId||'')===id);
  if(person?.name)return String(person.name);
  if(id&&id===selfId())return'Ik';
  return id||'Onbekend';
}
function driverOptions(vehicle){
  const ids=[];
  const add=id=>{id=String(id||'');if(VALID.test(id)&&!ids.includes(id))ids.push(id);};
  add(selfId());add(vehicle?.ownerPersonId);for(const driver of Array.isArray(vehicle?.drivers)?vehicle.drivers:[])add(driver?.personId);
  return ids.map(id=>({id,name:personName(id)}));
}
function normalizeRideSettings(value,vehicle,legacy={},inheritLegacy=false){
  const source=value&&typeof value==='object'?value:{};
  const options=driverOptions(vehicle),allowed=new Set(options.map(item=>item.id));
  let driverPersonId=String(source.driverPersonId||'');
  if(!allowed.has(driverPersonId))driverPersonId=options[0]?.id||'';
  const legacyDays=Array.isArray(legacy.privateDays)?legacy.privateDays:[];
  const privateDays=(Array.isArray(source.privateDays)?source.privateDays:(inheritLegacy?legacyDays:[])).map(Number).filter(day=>Number.isInteger(day)&&day>=0&&day<=6);
  return{
    driverPersonId,
    driverName:String(source.driverName||personName(driverPersonId)||(inheritLegacy?legacy.name:'')||''),
    privateDays:[...new Set(privateDays)],
    privateTimeStart:String(source.privateTimeStart??(inheritLegacy?legacy.privateTimeStart:'')??''),
    privateTimeEnd:String(source.privateTimeEnd??(inheritLegacy?legacy.privateTimeEnd:'')??''),
    reportEmail:String(source.reportEmail??(inheritLegacy?legacy.reportEmail:'')??'')
  };
}
function persist(s,reason='vehicle-ride-settings'){
  if(writing)return;writing=true;
  try{
    s.updatedAt=new Date().toISOString();write(STORE,s);
    const km=read(KM,{});km.vehicleIdentitiesV1=JSON.parse(JSON.stringify(s));write(KM,km);
  }finally{writing=false;}
  window.dispatchEvent(new CustomEvent('log-vehicles-change',{detail:{reason}}));
}
function ensureSettings(){
  const s=store(),km=read(KM,{}),legacy=km.settings||{},active=String(s.activeVehicleId||''),ids=Object.keys(s.vehicles);let changed=false;
  for(const id of ids){const vehicle=s.vehicles[id];if(!vehicle)continue;if(!vehicle.rideSettings){vehicle.rideSettings=normalizeRideSettings(null,vehicle,legacy,id===active);vehicle.updatedAt=new Date().toISOString();changed=true;}}
  if(changed)persist(s,'vehicle-ride-settings-migrated');
  return s;
}
function settingsFor(vehicleId){const s=ensureSettings(),vehicle=s.vehicles[String(vehicleId||'')];return vehicle?normalizeRideSettings(vehicle.rideSettings,vehicle):null;}
function syncLegacyActive(){
  if(writing)return;
  const s=ensureSettings(),id=String(s.activeVehicleId||''),vehicle=s.vehicles[id];if(!vehicle)return;
  const settings=normalizeRideSettings(vehicle.rideSettings,vehicle),km=read(KM,{});km.settings=km.settings&&typeof km.settings==='object'?km.settings:{};
  km.settings.name=settings.driverName||personName(settings.driverPersonId);
  km.settings.defaultDriverPersonId=settings.driverPersonId;
  km.settings.privateDays=[...settings.privateDays];
  km.settings.privateTimeStart=settings.privateTimeStart;
  km.settings.privateTimeEnd=settings.privateTimeEnd;
  km.settings.reportEmail=settings.reportEmail;
  write(KM,km);
}
function saveSettings(vehicleId,next){
  const s=ensureSettings(),id=String(vehicleId||''),vehicle=s.vehicles[id];if(!vehicle)throw Error('Auto niet gevonden.');
  const normalized=normalizeRideSettings(next,vehicle);vehicle.rideSettings=normalized;vehicle.updatedAt=new Date().toISOString();persist(s);
  if(String(s.activeVehicleId||'')===id)syncLegacyActive();
  window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{reason:'vehicle-ride-settings',vehicleId:id}}));
  return normalized;
}
function decorateGeneralSettings(){
  const form=document.getElementById('settingsForm');if(!form)return;
  const s=ensureSettings(),vehicle=s.vehicles?.[String(s.activeVehicleId||'')],settings=vehicle?normalizeRideSettings(vehicle.rideSettings,vehicle):null;
  if(settings){
    const set=(name,value)=>{const field=form.elements?.[name];if(!field)return;if(field instanceof RadioNodeList){return;}field.value=String(value??'');};
    set('name',settings.driverName);set('privateTimeStart',settings.privateTimeStart);set('privateTimeEnd',settings.privateTimeEnd);set('reportEmail',settings.reportEmail);
    form.querySelectorAll('input[name="privateDays"]').forEach(input=>{input.checked=settings.privateDays.includes(Number(input.value));});
  }
  for(const details of form.querySelectorAll('details.accordion')){
    const title=String(details.querySelector('summary strong')?.textContent||'').trim();
    if(['Bestuurder & auto','Bestuurder','Ritten','Extra registraties','Rapportage'].includes(title)){details.hidden=true;details.style.display='none';if(details.open)details.open=false;}
    const timeTitle=details.querySelector('.range-setting-head strong');if(timeTitle&&timeTitle.textContent.trim()==='Tijdvenster bestemmingsvoorstel')timeTitle.textContent='Tijdsvenster voor analyse';
  }
}
function tripDistance(trip){
  for(const key of ['actualKm','distanceKm','kilometers','km','distance']){const n=Number(trip?.[key]);if(Number.isFinite(n))return n;}
  const start=Number(trip?.startOdometer??trip?.startKm),end=Number(trip?.endOdometer??trip?.endKm);return Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,end-start):0;
}
function visibleTrips(vehicleId){
  try{const rows=window.LogVehicles?.tripsForViewer?.(vehicleId);if(Array.isArray(rows))return rows;}catch(_){ }
  return (read(KM,{}).trips||[]).filter(trip=>String(trip?.vehicleId||'')===String(vehicleId||''));
}
function fullTrips(vehicleId){return visibleTrips(vehicleId).filter(trip=>trip?.kind!=='vehicle-gap');}
function reportTotals(vehicleId){const trips=fullTrips(vehicleId),total=trips.reduce((sum,trip)=>sum+tripDistance(trip),0);return{trips,total};}
function loc(value){return String(value?.name||value?.address||value||'');}
function dateTime(value){const d=new Date(value||0);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('nl-NL',{dateStyle:'short',timeStyle:'short'}).format(d);}
function category(value){return value==='business'?'Zakelijk':value==='commute'?'Woon-werk':value==='private'?'Privé':String(value||'');}
function csvCell(value){return`"${String(value??'').replaceAll('"','""')}"`;}
function csvFor(vehicleId){
  const rows=[['Datum','Vertrek','Bestemming','Start km','Eind km','Totaal km','Type','Reden']];
  for(const trip of visibleTrips(vehicleId)){
    if(trip?.kind==='vehicle-gap'){rows.push([dateTime(trip.startTime),'Ander gebruik','',trip.startOdometer??'',trip.endOdometer??'',trip.distanceKm??'','Afgeschermd','']);continue;}
    rows.push([dateTime(trip.departureTime||trip.startTime),loc(trip.origin),loc(trip.destination),trip.startOdometer??'',trip.endOdometer??'',tripDistance(trip),category(trip.category),trip.reason||'']);
  }
  return rows.map(row=>row.map(csvCell).join(';')).join('\n');
}
function fileName(vehicle){const safe=vehicleName(vehicle).toLocaleLowerCase('nl').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'auto';return`ritten-${safe}.csv`;}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
async function reportAction(vehicleId,action){
  const s=ensureSettings(),vehicle=s.vehicles?.[String(vehicleId||'')];if(!vehicle)return;
  const settings=normalizeRideSettings(vehicle.rideSettings,vehicle),{trips,total}=reportTotals(vehicleId),name=vehicleName(vehicle),csv=csvFor(vehicleId),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),filename=fileName(vehicle);
  if(action==='csv'){downloadBlob(blob,filename);return;}
  if(action==='share'){
    if(typeof File==='function'&&navigator.share&&navigator.canShare){const file=new File([blob],filename,{type:blob.type});try{if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:`Ritten ${name}`});return;}}catch(error){if(error?.name==='AbortError')return;}}
    downloadBlob(blob,filename);return;
  }
  if(action==='email'){
    const body=`${name}\n${trips.length} ${trips.length===1?'rit':'ritten'}\nTotaal: ${Math.round(total)} km`;
    location.href=`mailto:${encodeURIComponent(settings.reportEmail||'')}?subject=${encodeURIComponent('Kilometerregistratie '+name)}&body=${encodeURIComponent(body)}`;return;
  }
  if(action==='print'){
    const win=window.open('','_blank');if(!win)return;
    const rows=visibleTrips(vehicleId).map(trip=>trip?.kind==='vehicle-gap'?`<tr><td>${esc(dateTime(trip.startTime))}</td><td colspan="2">Ander gebruik</td><td>${esc(trip.distanceKm??'')}</td></tr>`:`<tr><td>${esc(dateTime(trip.departureTime||trip.startTime))}</td><td>${esc(loc(trip.origin))}</td><td>${esc(loc(trip.destination))}</td><td>${esc(Math.round(tripDistance(trip)))}</td></tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ritten ${esc(name)}</title><style>body{font:14px -apple-system,BlinkMacSystemFont,sans-serif;padding:24px;color:#111}h1{font-size:24px}table{border-collapse:collapse;width:100%}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style></head><body><h1>${esc(name)}</h1><p>${trips.length} ritten · ${esc(Math.round(total))} km</p><table><thead><tr><th>Datum</th><th>Vertrek</th><th>Bestemming</th><th>km</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);win.document.close();setTimeout(()=>win.print(),80);
  }
}
function copyFrom(form,targetVehicleId,sourceVehicleId){
  const s=ensureSettings(),target=s.vehicles?.[String(targetVehicleId||'')],source=s.vehicles?.[String(sourceVehicleId||'')];if(!target||!source)return;
  const sourceSettings=normalizeRideSettings(source.rideSettings,source),allowed=new Set(driverOptions(target).map(item=>item.id));
  const driver=allowed.has(sourceSettings.driverPersonId)?sourceSettings.driverPersonId:(driverOptions(target)[0]?.id||'');
  form.elements.driverPersonId.value=driver;
  form.querySelectorAll('input[name="vehiclePrivateDays"]').forEach(input=>{input.checked=sourceSettings.privateDays.includes(Number(input.value));});
  form.elements.privateTimeStart.value=sourceSettings.privateTimeStart;form.elements.privateTimeEnd.value=sourceSettings.privateTimeEnd;form.elements.reportEmail.value=sourceSettings.reportEmail;
}
function showSettings(vehicleId){
  const s=ensureSettings(),id=String(vehicleId||''),vehicle=s.vehicles?.[id];if(!vehicle)return;
  const settings=normalizeRideSettings(vehicle.rideSettings,vehicle),list=Object.values(s.vehicles),others=list.filter(item=>String(item.vehicleId)!==id),drivers=driverOptions(vehicle),{trips,total}=reportTotals(id);
  const dayOptions=DAY_LABELS.map((label,index)=>`<label class="auto-setting-day"><input type="checkbox" name="vehiclePrivateDays" value="${index}" ${settings.privateDays.includes(index)?'checked':''}><span>${label}</span></label>`).join('');
  const copy=others.length?`<div class="auto-settings-copy"><label>Overnemen van<select name="copyVehicleId"><option value="">Kies een auto</option>${others.map((item,index)=>`<option value="${esc(item.vehicleId)}">${esc(vehicleName(item,index))}</option>`).join('')}</select></label><button type="button" class="btn secondary" data-auto-settings-copy>Overnemen</button></div>`:'';
  const panel=window.LogCardsUI?.sheet?.(`${vehicleName(vehicle)} · Instellingen`,`<form class="auto-settings-form" data-auto-settings-form="${esc(id)}">
    ${copy}
    <section class="auto-settings-section"><h3>Bestuurder</h3><label>Standaard bestuurder<select name="driverPersonId">${drivers.map(item=>`<option value="${esc(item.id)}" ${item.id===settings.driverPersonId?'selected':''}>${esc(item.name)}</option>`).join('')}</select></label></section>
    <section class="auto-settings-section"><h3>Ritten privé</h3><label>Standaard privédagen</label><div class="auto-setting-days">${dayOptions}</div><div class="auto-setting-times"><label>Privé vanaf<input type="time" name="privateTimeStart" value="${esc(settings.privateTimeStart)}"></label><label>Privé tot<input type="time" name="privateTimeEnd" value="${esc(settings.privateTimeEnd)}"></label></div><small>Deze regels gelden alleen voor deze auto.</small></section>
    <section class="auto-settings-section"><h3>Rapportage</h3><label>E-mailadres<input type="email" name="reportEmail" value="${esc(settings.reportEmail)}"></label><div class="auto-report-summary"><strong>${esc(Math.round(total))} km</strong><span>${trips.length} ${trips.length===1?'rit':'ritten'} van deze auto</span></div><div class="auto-report-actions"><button type="button" class="btn secondary" data-auto-report="email">E-mail</button><button type="button" class="btn secondary" data-auto-report="share">Deel CSV</button><button type="button" class="btn secondary" data-auto-report="csv">Download CSV</button><button type="button" class="btn secondary" data-auto-report="print">Print / PDF</button></div></section>
    <button type="submit" class="btn primary full">Bewaar instellingen</button><p role="status" data-auto-settings-status></p>
  </form>`);
  if(!panel)return;
  const form=panel.querySelector('[data-auto-settings-form]'),status=panel.querySelector('[data-auto-settings-status]');
  panel.querySelector('[data-auto-settings-copy]')?.addEventListener('click',()=>{const source=form.elements.copyVehicleId?.value;if(source){copyFrom(form,id,source);if(status)status.textContent='Instellingen overgenomen. Bewaar om toe te passen.';}});
  form?.addEventListener('submit',event=>{event.preventDefault();const days=[...form.querySelectorAll('input[name="vehiclePrivateDays"]:checked')].map(input=>Number(input.value));try{saveSettings(id,{driverPersonId:form.elements.driverPersonId.value,privateDays:days,privateTimeStart:form.elements.privateTimeStart.value,privateTimeEnd:form.elements.privateTimeEnd.value,reportEmail:form.elements.reportEmail.value});if(status)status.textContent='Instellingen bewaard.';}catch(error){if(status)status.textContent=error.message;}});
  panel.querySelectorAll('[data-auto-report]').forEach(button=>button.addEventListener('click',async()=>{const days=[...form.querySelectorAll('input[name="vehiclePrivateDays"]:checked')].map(input=>Number(input.value));saveSettings(id,{driverPersonId:form.elements.driverPersonId.value,privateDays:days,privateTimeStart:form.elements.privateTimeStart.value,privateTimeEnd:form.elements.privateTimeEnd.value,reportEmail:form.elements.reportEmail.value});await reportAction(id,button.dataset.autoReport);}));
}
function decorateAutoDetail(){
  const detail=document.querySelector('.auto-detail');if(!detail||detail.querySelector('[data-auto-settings]'))return;
  const id=currentDetailId;if(!VALID.test(id))return;
  const button=document.createElement('button');button.type='button';button.className='btn secondary full';button.dataset.autoSettings='1';button.textContent='Instellingen & rapportage';
  const deleteButton=detail.querySelector('[data-auto-delete]');if(deleteButton)deleteButton.insertAdjacentElement('beforebegin',button);else detail.appendChild(button);
  button.addEventListener('click',()=>{window.LogCardsUI?.close?.();setTimeout(()=>showSettings(id),35);});
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorateGeneralSettings();decorateAutoDetail();});}
function installStyles(){
  if(document.getElementById('logVehicleSettingsModuleStyles'))return;
  const style=document.createElement('style');style.id='logVehicleSettingsModuleStyles';style.textContent=`
    #settingsForm>details[hidden]{display:none!important}
    .auto-settings-form{display:grid;gap:12px}.auto-settings-section{display:grid;gap:9px;padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--card2)}.auto-settings-section h3{margin:0;font-size:14px}.auto-settings-section label{display:grid;gap:5px;font-size:12px;font-weight:650}.auto-settings-section input,.auto-settings-section select,.auto-settings-copy select{width:100%;padding:11px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text)}
    .auto-settings-copy{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}.auto-setting-days{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}.auto-setting-day{position:relative}.auto-setting-day input{position:absolute;opacity:0}.auto-setting-day span{display:grid;place-items:center;min-height:38px;border:1px solid var(--line);border-radius:9px;color:var(--muted);font-size:10px}.auto-setting-day input:checked+span{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--text)}
    .auto-setting-times{display:grid;grid-template-columns:1fr 1fr;gap:8px}.auto-report-summary{display:flex;justify-content:space-between;align-items:end;gap:8px;padding:9px 0}.auto-report-summary strong{font-size:20px}.auto-report-summary span{color:var(--muted);font-size:11px}.auto-report-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.auto-settings-section>small{color:var(--muted);font-size:11px}
    @media(max-width:520px){.auto-settings-copy{grid-template-columns:1fr}.auto-setting-days{gap:4px}.auto-setting-times{grid-template-columns:1fr 1fr}}
  `;document.head.appendChild(style);
}
function init(){
  installStyles();ensureSettings();syncLegacyActive();queue();
  document.addEventListener('click',event=>{const open=event.target.closest?.('[data-auto-open]');if(open){currentDetailId=String(open.dataset.autoOpen||'');setTimeout(queue,0);}},true);
  new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('log-vehicles-change',()=>{if(!writing){ensureSettings();syncLegacyActive();}queue();});
  window.addEventListener('log-vehicle-scope-change',()=>{syncLegacyActive();queue();});
  window.addEventListener('pageshow',()=>{ensureSettings();syncLegacyActive();queue();});
  window.LogVehicleRideSettings={get:settingsFor,save:saveSettings,sync:syncLegacyActive,show:showSettings,report:reportAction};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
