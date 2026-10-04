(function(){
'use strict';

const BUILD='0.39-test.6';
window.LOG_TEST_BUILD=BUILD;
const KM='kmreg-test-v4-data';
const REFRESH_KEY='log-test-location-refresh-v1';
const ALLOWED_INTERVALS=new Set([5000,10000,15000,30000,60000,120000,300000]);
const AUTO_VISIBLE_INTERVAL=10000;
const ACTIVE_TRIP_INTERVAL=60000;
const IDLE_CACHE_MS=8000;
const ACTIVE_CACHE_MS=3000;
const MIN_TIMER_MS=750;
const listeners=new Set();
let latest=null,pending=null,pendingHighAccuracy=false,lastAttempt=0,visibleTrip='',started=false,pollTimer=null;

function installEnergyGuard(){
  if(window.__logEnergyIntervalGuard)return;
  const nativeSetInterval=window.setInterval.bind(window);
  window.setInterval=function(fn,delay,...args){
    let next=Math.max(0,Number(delay)||0);
    if(typeof fn==='function'){
      const source=Function.prototype.toString.call(fn),name=String(fn.name||'');
      if(next>0&&next<10000&&(source.includes('syncOwners')||name==='syncOwners'))next=10000;
      if(next>0&&next<10000&&(source.includes('keepRouterInstalled')||name==='keepRouterInstalled'))next=10000;
    }
    return nativeSetInterval(fn,next,...args);
  };
  window.__logEnergyIntervalGuard={installed:true,nativeSetInterval};
}
installEnergyGuard();

function state(){try{return JSON.parse(localStorage.getItem(KM)||'{}')||{};}catch(_){return {};}}
function trip(){return String(state().activeTrip?.id||'');}
function syncVisibleBuild(){
  document.querySelectorAll('.log-test-build-badge').forEach(el=>el.remove());
  document.querySelectorAll('.km-shell-version-number').forEach(el=>{if(el.textContent!==BUILD)el.textContent=BUILD;});
  document.querySelectorAll('.km-shell-version').forEach(el=>{const label=`Geladen testversie ${BUILD}`;if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);});
}
function ensureScript(src,key,onload){
  const existing=[...document.scripts].find(script=>script.dataset[key]==='1');
  if(existing){if(onload){if(existing.dataset.loaded==='1')onload();else existing.addEventListener('load',onload,{once:true});}return existing;}
  const script=document.createElement('script');script.src=src;script.async=false;script.dataset[key]='1';script.addEventListener('load',()=>{script.dataset.loaded='1';onload?.();},{once:true});document.head.appendChild(script);return script;
}
function loadDependencies(){
  ensureScript(`./test-build-ui.js?v=${BUILD}`,'logTestBuildUi');
  ensureScript(`./location-refresh-setting.js?v=${BUILD}`,'logLocationRefreshSetting');
  ensureScript(`./action-details-reset.js?v=${BUILD}`,'logActionDetailsReset');
  ensureScript(`./sharing.js?v=${BUILD}`,'logSharing',()=>ensureScript(`./sharing-private-ui.js?v=${BUILD}`,'logSharingUi'));
  ensureScript(`./shared-settings-ui.js?v=${BUILD}`,'logSharedSettingsUi');
  ensureScript(`./shared-config-bridge.js?v=${BUILD}`,'logSharedConfigBridge');
  ensureScript(`./shared-diff-rights.js?v=${BUILD}`,'logSharedDiffRights');
  ensureScript(`./shared-update-compact.js?v=${BUILD}`,'logSharedUpdateCompact');
  ensureScript(`./connection-chat.js?v=${BUILD}-chat1`,'logConnectionChat');
}
function refreshConfig(){
  try{
    const raw=localStorage.getItem(REFRESH_KEY);
    if(raw!==null){const parsed=JSON.parse(raw)||{},zones={};for(const [id,value] of Object.entries(parsed.zones||{})){const interval=Number(value);if(id&&ALLOWED_INTERVALS.has(interval))zones[id]=interval;}const global=Number(parsed.globalIntervalMs);return{globalIntervalMs:ALLOWED_INTERVALS.has(global)?global:0,zones};}
  }catch(_){}
  const legacy=Number(state()?.settings?.locationRefreshIntervalMs);return{globalIntervalMs:ALLOWED_INTERVALS.has(legacy)?legacy:0,zones:{}};
}
function locationCoordinates(location,snapshot,seen=new Set()){
  if(!location||seen.has(location.id))return null;seen.add(location.id);
  const hasLat=location.lat!==null&&location.lat!==''&&location.lat!==undefined,hasLng=location.lng!==null&&location.lng!==''&&location.lng!==undefined,lat=hasLat?Number(location.lat):NaN,lng=hasLng?Number(location.lng):NaN;
  if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180)return{lat,lng};
  return location.parentId?locationCoordinates((snapshot.locations||[]).find(item=>item.id===location.parentId),snapshot,seen):null;
}
function distanceMeters(a,b){const r=Math.PI/180,dLat=(b.lat-a.lat)*r,dLng=(b.lng-a.lng)*r,q=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(q)));}
function activeZoneInterval(){
  if(!latest?.coords)return 0;const snapshot=state(),config=refreshConfig(),locations=Array.isArray(snapshot.locations)?snapshot.locations:[],current={lat:Number(latest.coords.latitude),lng:Number(latest.coords.longitude)};if(!Number.isFinite(current.lat)||!Number.isFinite(current.lng))return 0;
  const defaultRadius=Math.max(25,Number(snapshot.settings?.recognitionRadius)||500),matches=[];
  for(const [id,value] of Object.entries(config.zones)){const interval=Number(value);if(!ALLOWED_INTERVALS.has(interval))continue;const location=locations.find(item=>item.id===id),coords=locationCoordinates(location,snapshot);if(!coords)continue;const recognitionRadius=Math.max(25,Number(location?.recognitionRadius)||defaultRadius),zoneRadius=Math.max(100,recognitionRadius*2);if(distanceMeters(current,coords)<=zoneRadius)matches.push(interval);}
  return matches.length?Math.min(...matches):0;
}
function interval(){const zone=activeZoneInterval();if(zone)return zone;const global=refreshConfig().globalIntervalMs;return global||(trip()?ACTIVE_TRIP_INTERVAL:AUTO_VISIBLE_INTERVAL);}
function intervalInfo(){const zone=activeZoneInterval();if(zone)return{intervalMs:zone,source:'zone'};const global=refreshConfig().globalIntervalMs;if(global)return{intervalMs:global,source:'global'};return{intervalMs:trip()?ACTIVE_TRIP_INTERVAL:AUTO_VISIBLE_INTERVAL,source:'automatic'};}
function request({maxAge=null,highAccuracy=null}={}){
  if(document.hidden)return Promise.reject(new Error('Log staat op de achtergrond.'));
  const active=Boolean(trip()),reuseAge=maxAge===null?(active?ACTIVE_CACHE_MS:IDLE_CACHE_MS):Math.max(0,Number(maxAge)||0),accurate=highAccuracy===null?active:Boolean(highAccuracy);
  if(reuseAge>0&&latest&&Date.now()-latest.timestamp<=reuseAge)return Promise.resolve(latest);
  if(pending){if(accurate&&!pendingHighAccuracy)return pending.catch(()=>null).then(()=>request({maxAge:0,highAccuracy:true}));return pending;}
  if(!navigator.geolocation)return Promise.reject(new Error('GPS wordt niet ondersteund.'));
  lastAttempt=Date.now();pendingHighAccuracy=accurate;window.dispatchEvent(new CustomEvent('log-location-check-start',{detail:{...intervalInfo(),highAccuracy:accurate,reuseAgeMs:reuseAge}}));
  pending=new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(pos=>{const c=pos.coords,now=Date.now();if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||now-pos.timestamp>15000||pos.timestamp>now+5000){reject(new Error('Geen actuele GPS-meting.'));return;}latest=pos;if(!document.hidden)for(const listener of listeners)try{listener(pos);}catch(error){console.warn('Locatie verwerken mislukt',error);}resolve(pos);},reject,{enableHighAccuracy:accurate,maximumAge:reuseAge,timeout:accurate?12000:8000})).catch(error=>{if(!document.hidden)for(const listener of listeners)try{listener(null,error);}catch(_){}throw error;}).finally(()=>{pending=null;pendingHighAccuracy=false;window.dispatchEvent(new CustomEvent('log-location-check-end'));});
  return pending;
}
function clearPollTimer(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}}
function schedulePoll(delay=null){
  clearPollTimer();if(document.hidden||!started)return;const elapsed=Date.now()-lastAttempt,target=delay===null?Math.max(MIN_TIMER_MS,interval()-elapsed):Math.max(MIN_TIMER_MS,Number(delay)||0);pollTimer=setTimeout(()=>{pollTimer=null;poll(false);},target);
}
function poll(force=false){
  if(document.hidden){clearPollTimer();return;}const id=trip();if(id!==visibleTrip){visibleTrip=id;force=true;}const due=Date.now()-lastAttempt>=interval();
  if(force||due){request().catch(()=>{}).finally(()=>schedulePoll());return;}schedulePoll();
}
function start(){if(started){schedulePoll(250);return;}started=true;visibleTrip=trip();poll(Date.now()-lastAttempt>1000);syncVisibleBuild();}
window.LogLocationPolling={request,interval,intervalInfo,refreshNow(){lastAttempt=0;poll(true);},subscribe(listener){listeners.add(listener);if(latest&&!document.hidden&&Date.now()-latest.timestamp<=interval())listener(latest);return()=>listeners.delete(listener);}};
window.addEventListener('log-km-state-change',()=>{const id=trip();if(id!==visibleTrip)poll(true);else schedulePoll();});
window.addEventListener('log-location-refresh-change',()=>{lastAttempt=0;poll(true);});
window.addEventListener('pageshow',()=>{start();syncVisibleBuild();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPollTimer();else{poll(true);syncVisibleBuild();}});
loadDependencies();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
