(function(){
'use strict';

const BUILD='0.40';
window.LOG_BUILD=BUILD;
window.LOG_TEST_BUILD=BUILD;

function installProductionKeyRouting(){
  if(window.__logProductionKeyRoutingInstalled)return;
  window.__logProductionKeyRoutingInstalled=true;
  const proto=Storage.prototype;
  const nativeGet=proto.getItem,nativeSet=proto.setItem,nativeRemove=proto.removeItem;
  const explicit=new Map([
    ['urenregistratie.test.pwa.v1','urenregistratie.pwa.v1'],
    ['kmreg-test-v4-data','kmreg-v4-data'],
    ['kmreg-test-shell-section-v1','kmreg-shell-section-v1'],
    ['log-test-location-refresh-v1','log-location-refresh-v1']
  ]);
  const keyFor=key=>{
    const text=String(key);
    if(explicit.has(text))return explicit.get(text);
    if(text.startsWith('kmreg-test-'))return `kmreg-${text.slice(11)}`;
    if(text.startsWith('log-test-'))return `log-${text.slice(9)}`;
    if(text.startsWith('registratie-test-'))return `registratie-${text.slice(17)}`;
    if(text.includes('.test.'))return text.replace('.test.','.');
    return text;
  };
  proto.getItem=function(key){return nativeGet.call(this,keyFor(key));};
  proto.setItem=function(key,value){return nativeSet.call(this,keyFor(key),value);};
  proto.removeItem=function(key){return nativeRemove.call(this,keyFor(key));};
  window.__logProductionKeyFor=keyFor;
}
installProductionKeyRouting();

const KM='kmreg-v4-data';
const REFRESH_KEY='log-location-refresh-v1';
const ALLOWED_INTERVALS=new Set([60000,120000,300000]);
const DEFAULT_AUTO_INTERVAL=300000;
const ACTIVE_TRIP_INTERVAL=60000;
const OPEN_CACHE_MS=15000;
const ACTION_CACHE_MS=30000;
const ACTIVE_ACTION_CACHE_MS=10000;
const SUBSCRIBE_CACHE_MS=60000;
const MIN_TIMER_MS=1000;
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

function ensureScript(src,key,onload){
  const existing=[...document.scripts].find(script=>script.dataset[key]==='1');
  if(existing){if(onload){if(existing.dataset.loaded==='1')onload();else existing.addEventListener('load',onload,{once:true});}return existing;}
  const script=document.createElement('script');script.src=src;script.async=false;script.dataset[key]='1';script.addEventListener('load',()=>{script.dataset.loaded='1';onload?.();},{once:true});document.head.appendChild(script);return script;
}
function loadDependencies(){
  ensureScript(`./build-ui.js?v=${BUILD}`,'logBuildUi');
  ensureScript(`./location-refresh-setting.js?v=${BUILD}`,'logLocationRefreshSetting');
  ensureScript(`./action-details-reset.js?v=${BUILD}`,'logActionDetailsReset');
  ensureScript(`./sharing.js?v=${BUILD}`,'logSharing',()=>ensureScript(`./sharing-private-ui.js?v=${BUILD}`,'logSharingUi'));
  ensureScript(`./shared-settings-ui.js?v=${BUILD}`,'logSharedSettingsUi');
  ensureScript(`./shared-config-bridge.js?v=${BUILD}`,'logSharedConfigBridge');
  ensureScript(`./shared-diff-rights.js?v=${BUILD}`,'logSharedDiffRights');
  ensureScript(`./shared-update-compact.js?v=${BUILD}`,'logSharedUpdateCompact');
  ensureScript(`./connection-chat.js?v=${BUILD}`,'logConnectionChat');
}

function state(){try{return JSON.parse(localStorage.getItem(KM)||'{}')||{};}catch(_){return {};}}
function trip(){return String(state().activeTrip?.id||'');}
function refreshConfig(){
  try{
    const raw=localStorage.getItem(REFRESH_KEY),parsed=raw!==null?(JSON.parse(raw)||{}):{},interval=Number(parsed.globalIntervalMs);
    return{automaticEnabled:parsed.automaticEnabled===true,globalIntervalMs:ALLOWED_INTERVALS.has(interval)?interval:DEFAULT_AUTO_INTERVAL};
  }catch(_){return{automaticEnabled:false,globalIntervalMs:DEFAULT_AUTO_INTERVAL};}
}
function interval(){if(trip())return ACTIVE_TRIP_INTERVAL;const config=refreshConfig();return config.automaticEnabled?config.globalIntervalMs:0;}
function intervalInfo(){if(trip())return{intervalMs:ACTIVE_TRIP_INTERVAL,source:'active-trip',automatic:true};const config=refreshConfig();return config.automaticEnabled?{intervalMs:config.globalIntervalMs,source:'automatic-visible',automatic:true}:{intervalMs:0,source:'event-only',automatic:false};}
function syncVisibleBuild(){
  window.LOG_BUILD=BUILD;window.LOG_TEST_BUILD=BUILD;
  document.querySelectorAll('.log-test-build-badge').forEach(el=>el.remove());
  document.querySelectorAll('.km-shell-version-label').forEach(el=>el.remove());
  document.querySelectorAll('.km-shell-version-number').forEach(el=>{if(el.textContent!==BUILD)el.textContent=BUILD;});
  document.querySelectorAll('.km-shell-version').forEach(el=>el.setAttribute('aria-label',`Geladen versie ${BUILD}`));
}
function request({maxAge=null,highAccuracy=null,reason='request'}={}){
  if(document.hidden)return Promise.reject(new Error('Log staat op de achtergrond.'));
  const active=Boolean(trip()),reuseAge=maxAge===null?(active?ACTIVE_ACTION_CACHE_MS:ACTION_CACHE_MS):Math.max(0,Number(maxAge)||0),accurate=highAccuracy===null?active:Boolean(highAccuracy);
  if(reuseAge>0&&latest&&Date.now()-latest.timestamp<=reuseAge)return Promise.resolve(latest);
  if(pending){if(accurate&&!pendingHighAccuracy)return pending.catch(()=>null).then(()=>request({maxAge:0,highAccuracy:true,reason}));return pending;}
  if(!navigator.geolocation)return Promise.reject(new Error('GPS wordt niet ondersteund.'));
  lastAttempt=Date.now();pendingHighAccuracy=accurate;
  window.dispatchEvent(new CustomEvent('log-location-check-start',{detail:{...intervalInfo(),reason,highAccuracy:accurate,reuseAgeMs:reuseAge}}));
  pending=new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(pos=>{
    const c=pos.coords,now=Date.now();
    if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||now-pos.timestamp>30000||pos.timestamp>now+5000){reject(new Error('Geen actuele GPS-meting.'));return;}
    latest=pos;
    if(!document.hidden)for(const listener of listeners)try{listener(pos);}catch(error){console.warn('Locatie verwerken mislukt',error);}
    resolve(pos);
  },reject,{enableHighAccuracy:accurate,maximumAge:reuseAge,timeout:accurate?12000:8000})).catch(error=>{
    if(!document.hidden)for(const listener of listeners)try{listener(null,error);}catch(_){}
    throw error;
  }).finally(()=>{pending=null;pendingHighAccuracy=false;window.dispatchEvent(new CustomEvent('log-location-check-end',{detail:{reason}}));});
  return pending;
}
function clearPollTimer(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null;}}
function schedulePoll(){
  clearPollTimer();if(document.hidden||!started)return;
  const ms=interval();if(!ms)return;
  const elapsed=Date.now()-lastAttempt,target=Math.max(MIN_TIMER_MS,ms-elapsed);
  pollTimer=setTimeout(()=>{pollTimer=null;request({maxAge:0,highAccuracy:Boolean(trip()),reason:trip()?'ride-periodic':'automatic-periodic'}).catch(()=>{}).finally(schedulePoll);},target);
}
function checkOnOpen(reason='open'){if(document.hidden)return;request({maxAge:OPEN_CACHE_MS,highAccuracy:Boolean(trip()),reason}).catch(()=>{}).finally(schedulePoll);}
function checkForAction(reason='user-action'){if(document.hidden)return;request({maxAge:trip()?ACTIVE_ACTION_CACHE_MS:ACTION_CACHE_MS,highAccuracy:Boolean(trip()),reason}).catch(()=>{});}
function isActionElement(target){const element=target?.closest?.('button,a,[role="button"],input[type="button"],input[type="submit"],input[type="checkbox"],input[type="radio"],select');if(!element||element.disabled||element.closest('[inert]')||element.matches('[data-location-no-check]'))return false;return true;}
function start(){if(started){checkOnOpen('reopen');return;}started=true;visibleTrip=trip();checkOnOpen('app-open');syncVisibleBuild();}
window.LogLocationPolling={request,interval,intervalInfo,refreshNow(){lastAttempt=0;return request({maxAge:0,highAccuracy:true,reason:'manual-refresh'}).finally(schedulePoll);},checkForAction,automaticEnabled(){return refreshConfig().automaticEnabled;},subscribe(listener){listeners.add(listener);if(latest&&!document.hidden&&Date.now()-latest.timestamp<=SUBSCRIBE_CACHE_MS)listener(latest);return()=>listeners.delete(listener);}};
window.addEventListener('log-km-state-change',()=>{const id=trip();if(id!==visibleTrip){visibleTrip=id;lastAttempt=0;request({maxAge:0,highAccuracy:Boolean(id),reason:id?'ride-start':'ride-stop'}).catch(()=>{}).finally(schedulePoll);}});
window.addEventListener('log-location-refresh-change',()=>{clearPollTimer();schedulePoll();});
window.addEventListener('pageshow',()=>{start();syncVisibleBuild();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPollTimer();else{checkOnOpen('foreground');syncVisibleBuild();}});
document.addEventListener('click',event=>{if(isActionElement(event.target))checkForAction();},false);
loadDependencies();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();