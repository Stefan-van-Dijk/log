(function(){
'use strict';

const KM='kmreg-test-v4-data';
let mirroring=false;

function read(){try{return JSON.parse(localStorage.getItem(KM)||'{}')||{};}catch(_){return{};}}
function mirror(){
  if(mirroring||!window.LogVehicles?.state)return;
  mirroring=true;
  try{
    const km=read(),vehicles=window.LogVehicles.state(),previous=JSON.stringify(km.vehicleIdentitiesV1||null),next=JSON.stringify(vehicles);
    if(previous!==next){km.vehicleIdentitiesV1=vehicles;localStorage.setItem(KM,JSON.stringify(km));}
  }finally{mirroring=false;}
}

document.addEventListener('change',event=>{
  const select=event.target.closest?.('[data-vehicle-form] select[name="ownerPersonId"]');
  if(!select)return;
  event.stopImmediatePropagation();
},true);

['log-vehicles-change','log-km-state-change','pageshow'].forEach(name=>window.addEventListener(name,()=>setTimeout(mirror,0)));
setTimeout(mirror,250);
window.LogVehicleIdentityFix={mirror};
})();
