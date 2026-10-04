(function(){
'use strict';

const KM='kmreg-test-v4-data';
const STORE='log-test-vehicles-v1';
const PERIOD_KEY='log-test-vehicle-report-period-v1';
const MODES=['day','week','month','quarter','year','all'];
let queued=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function periodState(){
  const raw=read(PERIOD_KEY,{}),mode=MODES.includes(raw.mode)?raw.mode:'week',date=new Date(raw.anchor||Date.now());
  return{mode,anchor:Number.isNaN(date.getTime())?new Date():date};
}
function savePeriod(state){write(PERIOD_KEY,{mode:state.mode,anchor:state.anchor.toISOString()});window.dispatchEvent(new CustomEvent('log-vehicle-report-period-change',{detail:{mode:state.mode,anchor:state.anchor.toISOString()}}));}
function startOfDay(date){const d=new Date(date);d.setHours(0,0,0,0);return d;}
function startOfWeek(date){const d=startOfDay(date),day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d;}
function startOfMonth(date){const d=startOfDay(date);d.setDate(1);return d;}
function startOfQuarter(date){const d=startOfMonth(date);d.setMonth(Math.floor(d.getMonth()/3)*3);return d;}
function startOfYear(date){const d=startOfDay(date);d.setMonth(0,1);return d;}
function periodStart(state){if(state.mode==='day')return startOfDay(state.anchor);if(state.mode==='week')return startOfWeek(state.anchor);if(state.mode==='month')return startOfMonth(state.anchor);if(state.mode==='quarter')return startOfQuarter(state.anchor);if(state.mode==='year')return startOfYear(state.anchor);return null;}
function periodRange(state=periodState()){
  if(state.mode==='all')return{start:null,end:null};
  const start=periodStart(state),end=new Date(start);
  if(state.mode==='day')end.setDate(end.getDate()+1);
  else if(state.mode==='week')end.setDate(end.getDate()+7);
  else if(state.mode==='month')end.setMonth(end.getMonth()+1);
  else if(state.mode==='quarter')end.setMonth(end.getMonth()+3);
  else end.setFullYear(end.getFullYear()+1);
  return{start,end};
}
function shift(state,step){
  if(state.mode==='all')return state;
  const date=periodStart(state);
  if(state.mode==='day')date.setDate(date.getDate()+step);
  else if(state.mode==='week')date.setDate(date.getDate()+step*7);
  else if(state.mode==='month')date.setMonth(date.getMonth()+step);
  else if(state.mode==='quarter')date.setMonth(date.getMonth()+step*3);
  else date.setFullYear(date.getFullYear()+step);
  return{mode:state.mode,anchor:date};
}
function isoWeek(date){const d=startOfDay(date);d.setDate(d.getDate()+4-(d.getDay()||7));const yearStart=new Date(d.getFullYear(),0,1);return Math.ceil((((d-yearStart)/86400000)+1)/7);}
function modeLabel(mode){return mode==='day'?'Dag':mode==='week'?'Week':mode==='month'?'Maand':mode==='quarter'?'Kwartaal':mode==='year'?'Jaar':'Alles';}
function periodLabel(state=periodState()){
  const range=periodRange(state),start=range.start;
  if(state.mode==='day')return new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(start);
  if(state.mode==='week')return`Week ${isoWeek(start)}`;
  if(state.mode==='month')return new Intl.DateTimeFormat('nl-NL',{month:'long',year:'numeric'}).format(start);
  if(state.mode==='quarter')return`Q${Math.floor(start.getMonth()/3)+1} ${start.getFullYear()}`;
  if(state.mode==='year')return String(start.getFullYear());
  return'Alle tijden';
}
function periodSubLabel(state=periodState()){
  const range=periodRange(state);if(state.mode==='day'||state.mode==='year')return'';if(state.mode==='all')return'Volledige historie';
  const end=new Date(range.end);end.setDate(end.getDate()-1);
  const startText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short'}).format(range.start),endText=new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric'}).format(end);
  return`${startText} – ${endText}`;
}
function tripTime(trip){return new Date(trip?.departureTime||trip?.startTime||trip?.startedAt||trip?.date||trip?.createdAt||0);}
function inSelectedPeriod(trip,state=periodState()){
  const range=periodRange(state);if(!range.start)return true;
  const date=tripTime(trip);return !Number.isNaN(date.getTime())&&date>=range.start&&date<range.end;
}
function allVehicleTrips(vehicleId){
  try{const rows=window.LogVehicles?.tripsForViewer?.(vehicleId);if(Array.isArray(rows))return rows;}catch(_){ }
  return (read(KM,{}).trips||[]).filter(trip=>String(trip?.vehicleId||'')===String(vehicleId||''));
}
function selectedTrips(vehicleId,state=periodState()){return allVehicleTrips(vehicleId).filter(trip=>inSelectedPeriod(trip,state));}
function fullTrips(vehicleId,state=periodState()){return selectedTrips(vehicleId,state).filter(trip=>trip?.kind!=='vehicle-gap');}
function tripDistance(trip){for(const key of ['actualKm','distanceKm','kilometers','km','distance']){const n=Number(trip?.[key]);if(Number.isFinite(n))return n;}const start=Number(trip?.startOdometer??trip?.startKm),end=Number(trip?.endOdometer??trip?.endKm);return Number.isFinite(start)&&Number.isFinite(end)?Math.max(0,end-start):0;}
function reportTotals(vehicleId,state=periodState()){const trips=fullTrips(vehicleId,state);return{trips,total:trips.reduce((sum,trip)=>sum+tripDistance(trip),0)};}
function loc(value){return String(value?.name||value?.address||value||'');}
function dateTime(value){const d=new Date(value||0);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('nl-NL',{dateStyle:'short',timeStyle:'short'}).format(d);}
function category(value){return value==='business'?'Zakelijk':value==='commute'?'Woon-werk':value==='private'?'Privé':String(value||'');}
function csvCell(value){return`"${String(value??'').replaceAll('"','""')}"`;}
function csvFor(vehicleId,state){
  const rows=[['Periode',periodLabel(state)],['Datum','Vertrek','Bestemming','Start km','Eind km','Totaal km','Type','Reden']];
  for(const trip of selectedTrips(vehicleId,state)){
    if(trip?.kind==='vehicle-gap'){rows.push([dateTime(trip.startTime),'Ander gebruik','',trip.startOdometer??'',trip.endOdometer??'',trip.distanceKm??'','Afgeschermd','']);continue;}
    rows.push([dateTime(trip.departureTime||trip.startTime),loc(trip.origin),loc(trip.destination),trip.startOdometer??'',trip.endOdometer??'',tripDistance(trip),category(trip.category),trip.reason||'']);
  }
  return rows.map(row=>row.map(csvCell).join(';')).join('\n');
}
function vehicleName(vehicle){return String(vehicle?.name||vehicle?.plate||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||'Auto');}
function safeSlug(value){return String(value||'').toLocaleLowerCase('nl').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function fileName(vehicle,state){return`ritten-${safeSlug(vehicleName(vehicle))||'auto'}-${safeSlug(periodLabel(state))||'periode'}.csv`;}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}
async function runReport(vehicleId,action){
  const vehicles=read(STORE,{}).vehicles||{},vehicle=vehicles[String(vehicleId||'')];if(!vehicle)return;
  const state=periodState(),rows=selectedTrips(vehicleId,state),{trips,total}=reportTotals(vehicleId,state),csv=csvFor(vehicleId,state),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),filename=fileName(vehicle,state),name=vehicleName(vehicle),email=String(vehicle?.rideSettings?.reportEmail||'');
  if(action==='csv'){downloadBlob(blob,filename);return;}
  if(action==='share'){
    if(typeof File==='function'&&navigator.share&&navigator.canShare){const file=new File([blob],filename,{type:blob.type});try{if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:`Ritten ${name} · ${periodLabel(state)}`});return;}}catch(error){if(error?.name==='AbortError')return;}}
    downloadBlob(blob,filename);return;
  }
  if(action==='email'){
    const body=`${name}\n${periodLabel(state)}${periodSubLabel(state)?` · ${periodSubLabel(state)}`:''}\n${trips.length} ${trips.length===1?'rit':'ritten'}\nTotaal: ${Math.round(total)} km`;
    location.href=`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Kilometerregistratie '+name+' · '+periodLabel(state))}&body=${encodeURIComponent(body)}`;return;
  }
  if(action==='print'){
    const win=window.open('','_blank');if(!win)return;
    const tableRows=rows.map(trip=>trip?.kind==='vehicle-gap'?`<tr><td>${esc(dateTime(trip.startTime))}</td><td colspan="2">Ander gebruik</td><td>${esc(trip.distanceKm??'')}</td></tr>`:`<tr><td>${esc(dateTime(trip.departureTime||trip.startTime))}</td><td>${esc(loc(trip.origin))}</td><td>${esc(loc(trip.destination))}</td><td>${esc(Math.round(tripDistance(trip)))}</td></tr>`).join('');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Ritten ${esc(name)}</title><style>body{font:14px -apple-system,BlinkMacSystemFont,sans-serif;padding:24px;color:#111}h1{font-size:24px}table{border-collapse:collapse;width:100%}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}</style></head><body><h1>${esc(name)}</h1><p><strong>${esc(periodLabel(state))}</strong>${periodSubLabel(state)?` · ${esc(periodSubLabel(state))}`:''}</p><p>${trips.length} ritten · ${esc(Math.round(total))} km</p><table><thead><tr><th>Datum</th><th>Vertrek</th><th>Bestemming</th><th>km</th></tr></thead><tbody>${tableRows}</tbody></table></body></html>`);win.document.close();setTimeout(()=>win.print(),80);
  }
}
function selectorMarkup(state){
  const all=state.mode==='all',sub=periodSubLabel(state);
  return`<div class="auto-report-period" data-auto-report-period><div class="auto-report-period-tabs">${MODES.map(mode=>`<button type="button" class="${state.mode===mode?'active':''}" data-auto-period-mode="${mode}">${modeLabel(mode)}</button>`).join('')}</div><div class="auto-report-period-nav">${all?'<span></span>':'<button type="button" class="auto-report-period-arrow" data-auto-period-shift="-1" aria-label="Vorige periode">‹</button>'}<button type="button" class="auto-report-period-title" data-auto-period-now title="Huidige periode"><strong>${esc(periodLabel(state))}</strong>${sub?`<small>${esc(sub)}</small>`:''}</button>${all?'<span></span>':'<button type="button" class="auto-report-period-arrow" data-auto-period-shift="1" aria-label="Volgende periode">›</button>'}</div></div>`;
}
function reportSection(form){return [...form.querySelectorAll('.auto-settings-section')].find(section=>String(section.querySelector('h3')?.textContent||'').trim()==='Rapportage')||null;}
function updateForm(form){
  if(!form)return;const id=String(form.dataset.autoSettingsForm||''),section=reportSection(form);if(!id||!section)return;
  let holder=section.querySelector('[data-auto-report-period]');
  const state=periodState(),markup=selectorMarkup(state);
  if(!holder){const email=section.querySelector('label');email?.insertAdjacentHTML('afterend',markup);holder=section.querySelector('[data-auto-report-period]');}
  else holder.outerHTML=markup;
  const summary=section.querySelector('.auto-report-summary'),{trips,total}=reportTotals(id,state);
  if(summary)summary.innerHTML=`<strong>${esc(Math.round(total))} km</strong><span>${trips.length} ${trips.length===1?'rit':'ritten'} · ${esc(periodLabel(state))}</span>`;
}
function decorate(){queued=false;document.querySelectorAll('[data-auto-settings-form]').forEach(updateForm);}
function queue(){if(queued)return;queued=true;requestAnimationFrame(decorate);}
function onClick(event){
  const reportButton=event.target.closest?.('[data-auto-report]');
  if(reportButton){const form=reportButton.closest('[data-auto-settings-form]');if(!form)return;event.preventDefault();event.stopImmediatePropagation();runReport(form.dataset.autoSettingsForm,reportButton.dataset.autoReport);return;}
  const modeButton=event.target.closest?.('[data-auto-period-mode]');
  if(modeButton){event.preventDefault();const state=periodState();state.mode=MODES.includes(modeButton.dataset.autoPeriodMode)?modeButton.dataset.autoPeriodMode:'week';state.anchor=new Date();savePeriod(state);queue();return;}
  const shiftButton=event.target.closest?.('[data-auto-period-shift]');
  if(shiftButton){event.preventDefault();savePeriod(shift(periodState(),Number(shiftButton.dataset.autoPeriodShift)||0));queue();return;}
  const nowButton=event.target.closest?.('[data-auto-period-now]');
  if(nowButton){event.preventDefault();const state=periodState();state.anchor=new Date();savePeriod(state);queue();}
}
function installStyles(){
  if(document.getElementById('logVehicleReportPeriodStyles'))return;
  const style=document.createElement('style');style.id='logVehicleReportPeriodStyles';style.textContent=`
    .auto-report-period{display:grid;gap:8px;margin:10px 0 12px}.auto-report-period-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:5px;border:1px solid var(--line);border-radius:12px;background:var(--card2)}
    .auto-report-period-tabs button{min-height:34px;padding:7px 4px;border:0;border-radius:8px;background:transparent;color:var(--muted);font-size:11px;font-weight:750}.auto-report-period-tabs button.active{background:var(--card);color:var(--text)}
    .auto-report-period-nav{display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:7px}.auto-report-period-arrow{width:38px;height:38px;border:1px solid var(--line);border-radius:10px;background:var(--card2);color:var(--text);font-size:22px}.auto-report-period-title{min-height:38px;padding:4px 7px;border:0;background:transparent;color:var(--text);text-align:center}.auto-report-period-title strong,.auto-report-period-title small{display:block}.auto-report-period-title strong{font-size:14px}.auto-report-period-title small{margin-top:2px;color:var(--muted);font-size:10px}
  `;document.head.appendChild(style);
}
function init(){installStyles();queue();document.addEventListener('click',onClick,true);new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('log-vehicle-report-period-change',queue);window.addEventListener('pageshow',queue);window.LogVehicleReportPeriod={state:periodState,range:periodRange,trips:selectedTrips,label:periodLabel};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
