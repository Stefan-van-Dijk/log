(function(){
  'use strict';
  const BUILD='0.37-test.31';
  window.LOG_TEST_BUILD=BUILD;
  const listeners=new Set(),KM='kmreg-test-v4-data';
  let latest=null,pending=null,lastAttempt=0,visibleTrip='',started=false;

  function syncVisibleBuild(){
    document.querySelectorAll('.log-test-build-badge').forEach(el=>el.remove());
    document.querySelectorAll('.km-shell-version-number').forEach(el=>{if(el.textContent!==BUILD)el.textContent=BUILD;});
    document.querySelectorAll('.km-shell-version').forEach(el=>{const label=`Geladen testversie ${BUILD}`;if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);});
  }
  function loadTestBuildUI(){
    const existing=document.querySelector('script[data-log-test-build-ui]');
    if(existing&&existing.src.includes(`v=${BUILD}`))return;
    existing?.remove();
    const script=document.createElement('script');
    script.src=`./test-build-ui.js?v=${BUILD}`;
    script.async=false;
    script.dataset.logTestBuildUi='1';
    document.head.appendChild(script);
  }
  function loadActionDetailsReset(){
    if(document.querySelector('script[data-log-action-details-reset]'))return;
    const script=document.createElement('script');
    script.src=`./action-details-reset.js?v=${BUILD}`;
    script.async=false;
    script.dataset.logActionDetailsReset='1';
    document.head.appendChild(script);
  }
  function loadSharingUI(){
    const wanted=`sharing-private-ui.js?v=${BUILD}`;
    const existing=[...document.querySelectorAll('script[data-log-sharing-ui]')];
    if(existing.some(script=>script.src.includes(wanted)))return;
    existing.forEach(script=>script.remove());
    const ui=document.createElement('script');
    ui.src=`./sharing-private-ui.js?v=${BUILD}`;
    ui.async=false;
    ui.dataset.logSharingUi='1';
    document.head.appendChild(ui);
  }
  function loadSharing(){
    const existing=document.querySelector('script[data-log-sharing]');
    if(existing){
      if(window.LogSharing)loadSharingUI();
      else existing.addEventListener('load',loadSharingUI,{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=`./sharing.js?v=${BUILD}`;
    script.async=false;
    script.dataset.logSharing='1';
    script.addEventListener('load',loadSharingUI,{once:true});
    document.head.appendChild(script);
  }
  function loadSharedSettingsUI(){
    if(document.querySelector('script[data-log-shared-settings-ui]'))return;
    const script=document.createElement('script');
    script.src=`./shared-settings-ui.js?v=${BUILD}`;
    script.async=false;
    script.dataset.logSharedSettingsUi='1';
    document.head.appendChild(script);
  }
  function loadSharedConfigBridge(){
    if(document.querySelector('script[data-log-shared-config-bridge]'))return;
    const script=document.createElement('script');
    script.src=`./shared-config-bridge.js?v=${BUILD}`;
    script.async=false;
    script.dataset.logSharedConfigBridge='1';
    document.head.appendChild(script);
  }
  function loadSharedDiffRights(){
    if(document.querySelector('script[data-log-shared-diff-rights]'))return;
    const script=document.createElement('script');
    script.src=`./shared-diff-rights.js?v=${BUILD}`;
    script.async=false;
    script.dataset.logSharedDiffRights='1';
    document.head.appendChild(script);
  }
  function loadSharedUpdateCompact(){
    if(document.querySelector('script[data-log-shared-update-compact]'))return;
    const script=document.createElement('script');
    script.src=`./shared-update-compact.js?v=${BUILD}`;
    script.async=false;
    script.dataset.logSharedUpdateCompact='1';
    document.head.appendChild(script);
  }
  function trip(){try{return JSON.parse(localStorage.getItem(KM)||'{}').activeTrip?.id||'';}catch(_){return '';}}
  function interval(){return trip()?60000:6000;}
  function request({maxAge=0}={}){
    if(document.hidden)return Promise.reject(new Error('Log staat op de achtergrond.'));
    if(maxAge>0&&latest&&Date.now()-latest.timestamp<=maxAge)return Promise.resolve(latest);
    if(pending)return pending;
    if(!navigator.geolocation)return Promise.reject(new Error('GPS wordt niet ondersteund.'));
    lastAttempt=Date.now();
    pending=new Promise((resolve,reject)=>{
      navigator.geolocation.getCurrentPosition(pos=>{
        const c=pos.coords,now=Date.now();
        if(!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||now-pos.timestamp>15000||pos.timestamp>now+5000){reject(new Error('Geen actuele GPS-meting.'));return;}
        latest=pos;
        if(!document.hidden)for(const listener of listeners)try{listener(pos);}catch(error){console.warn('Locatie verwerken mislukt',error);}
        resolve(pos);
      },reject,{enableHighAccuracy:true,maximumAge:0,timeout:12000});
    }).catch(error=>{if(!document.hidden)for(const listener of listeners)try{listener(null,error);}catch(_){}throw error;}).finally(()=>{pending=null;});
    return pending;
  }
  function poll(force=false){
    if(document.hidden)return;
    const id=trip();if(id!==visibleTrip){visibleTrip=id;force=true;}
    if(force||Date.now()-lastAttempt>=interval())request().catch(()=>{});
  }
  function start(){if(!started){started=true;setInterval(()=>poll(),1000);}poll(Date.now()-lastAttempt>1000);syncVisibleBuild();}
  window.LogLocationPolling={request,interval,subscribe(listener){listeners.add(listener);if(latest&&!document.hidden&&Date.now()-latest.timestamp<=interval())listener(latest);return()=>listeners.delete(listener);}};
  window.addEventListener('log-km-state-change',()=>poll());
  window.addEventListener('pageshow',()=>{start();syncVisibleBuild();setTimeout(syncVisibleBuild,100);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){poll(true);syncVisibleBuild();}});
  loadTestBuildUI();
  loadActionDetailsReset();
  loadSharing();
  loadSharedSettingsUI();
  loadSharedConfigBridge();
  loadSharedDiffRights();
  loadSharedUpdateCompact();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{start();syncVisibleBuild();setTimeout(syncVisibleBuild,100);},{once:true});else start();
})();