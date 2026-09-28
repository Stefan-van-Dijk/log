(function(){
  'use strict';
  const listeners=new Set(),KM='kmreg-v4-data';
  let latest=null,pending=null,lastAttempt=0,visibleTrip='',started=false;
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
  function start(){if(!started){started=true;setInterval(()=>poll(),1000);}poll(Date.now()-lastAttempt>1000);}
  window.LogLocationPolling={request,interval,subscribe(listener){listeners.add(listener);if(latest&&!document.hidden&&Date.now()-latest.timestamp<=interval())listener(latest);return()=>listeners.delete(listener);}};
  window.addEventListener('log-km-state-change',()=>poll());
  window.addEventListener('pageshow',start);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll(true);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
