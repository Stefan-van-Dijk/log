(function(){
'use strict';

const KM='kmreg-test-v4-data';
const STORE='log-test-vehicles-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let editingVehicleId='';
let queued=false;
let syncing=false;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{return JSON.parse(localStorage.getItem(key)||'null')||fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function today(){return new Date().toISOString().slice(0,10);}
function activeVehicleId(){
  const store=read(STORE,{}),id=String(store.activeVehicleId||'');
  return VALID.test(id)?id:'';
}
function vehicle(id){return read(STORE,{}).vehicles?.[String(id||'')]||null;}
function migrateLegacyStart(){
  const store=read(STORE,{}),km=read(KM,{}),id=String(store.activeVehicleId||''),current=store.vehicles?.[id];
  if(!current)return;
  let changed=false;
  if((current.initialOdometer===undefined||current.initialOdometer===null||String(current.initialOdometer)==='')&&km.settings?.initialOdometer!==undefined&&String(km.settings.initialOdometer)!==''){
    current.initialOdometer=String(km.settings.initialOdometer);changed=true;
  }
  if(!current.registrationStart&&km.settings?.registrationStart){current.registrationStart=String(km.settings.registrationStart);changed=true;}
  if(changed){current.updatedAt=new Date().toISOString();store.updatedAt=current.updatedAt;write(STORE,store);}
}
function syncActiveContext(){
  if(syncing)return;syncing=true;
  try{
    const store=read(STORE,{}),id=String(store.activeVehicleId||''),current=store.vehicles?.[id];if(!current)return;
    const km=read(KM,{});km.settings=km.settings&&typeof km.settings==='object'?km.settings:{};
    km.settings.initialOdometer=current.initialOdometer==null?'':String(current.initialOdometer);
    km.settings.registrationStart=String(current.registrationStart||today());
    if(current.lastKnown){
      km.lastEndpoint={location:current.lastKnown.location||null,odometer:current.lastKnown.odometer,estimatedOdometer:current.lastKnown.odometer,time:current.lastKnown.time||current.lastKnown.updatedAt||null};
    }else if(current.initialOdometer!==undefined&&current.initialOdometer!==null&&String(current.initialOdometer)!==''){
      const n=Number(current.initialOdometer);
      km.lastEndpoint=Number.isFinite(n)?{location:null,odometer:n,estimatedOdometer:n,time:current.registrationStart||null}:null;
    }else km.lastEndpoint=null;
    write(KM,km);
  }finally{syncing=false;}
}
function saveVehicleStart(vehicleId,odometer,startDate){
  const id=String(vehicleId||''),store=read(STORE,{}),current=store.vehicles?.[id];if(!current)return;
  const text=String(odometer??'').trim();
  if(text!==''&&(!Number.isFinite(Number(text))||Number(text)<0))throw Error('Vul een geldige beginstand in.');
  current.initialOdometer=text;
  current.registrationStart=String(startDate||today());
  current.updatedAt=new Date().toISOString();store.updatedAt=current.updatedAt;write(STORE,store);
  if(id===String(store.activeVehicleId||''))syncActiveContext();
  window.dispatchEvent(new CustomEvent('log-vehicles-change',{detail:{reason:'vehicle-start-settings',vehicleId:id}}));
  window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{reason:'vehicle-start-settings',vehicleId:id}}));
}
function selectedEditingVehicle(){
  if(VALID.test(editingVehicleId))return vehicle(editingVehicleId);
  if(editingVehicleId==='new')return null;
  const form=document.querySelector('[data-vehicle-form]');if(!form)return null;
  const name=String(form.elements?.name?.value||''),plate=String(form.elements?.plate?.value||''),brand=String(form.elements?.brand?.value||''),model=String(form.elements?.model?.value||'');
  return window.LogVehicles?.list?.().find(item=>String(item.name||'')===name&&String(item.plate||'')===plate&&String(item.brand||'')===brand&&String(item.model||'')===model)||null;
}
function injectForm(){
  const form=document.querySelector('[data-vehicle-form]');if(!form||form.dataset.vehicleStartInput==='1')return;
  form.dataset.vehicleStartInput='1';
  const current=selectedEditingVehicle(),legacy=read(KM,{}).settings||{};
  const odometer=current?.initialOdometer??(current&&current.vehicleId===activeVehicleId()?legacy.initialOdometer:'')??'';
  const startDate=current?.registrationStart||(current&&current.vehicleId===activeVehicleId()?legacy.registrationStart:'')||today();
  const anchor=form.querySelector('label:has(input[name="model"])')||form.querySelector('label:has(input[name="plate"])');
  const wrap=document.createElement('div');wrap.dataset.vehicleStartFields='1';wrap.className='log-vehicle-start-fields';
  wrap.innerHTML=`<label>Beginstand km<input name="vehicleInitialOdometer" type="number" min="0" step="1" inputmode="numeric" value="${esc(odometer)}"></label><label>Start registratie<input name="vehicleRegistrationStart" type="date" value="${esc(startDate)}"></label><small>Deze beginstand wordt alleen gebruikt zolang deze auto nog geen afgeronde rit heeft.</small>`;
  anchor?.insertAdjacentElement('afterend',wrap);
  form.addEventListener('submit',()=>{
    const wantedOdo=String(form.elements.vehicleInitialOdometer?.value||''),wantedDate=String(form.elements.vehicleRegistrationStart?.value||today()),targetBefore=selectedEditingVehicle()?.vehicleId||editingVehicleId;
    setTimeout(()=>{
      const target=VALID.test(String(targetBefore||''))?String(targetBefore):activeVehicleId();
      if(!VALID.test(target))return;
      try{saveVehicleStart(target,wantedOdo,wantedDate);}catch(error){console.warn('Beginstand voertuig opslaan mislukt',error);}
    },60);
  },{capture:true});
}
function hideLegacyVehicleFields(){
  const form=document.getElementById('settingsForm');if(!form)return;
  ['vehicleBrand','vehicleModel','plate','initialOdometer','registrationStart'].forEach(name=>{
    const input=form.elements?.[name];const label=input?.closest('label,.form-group');if(label)label.hidden=true;
  });
  const details=[...form.querySelectorAll('details')].find(item=>item.querySelector('summary strong')?.textContent.trim()==='Bestuurder & auto');
  const title=details?.querySelector('summary strong');if(title&&title.textContent!=='Bestuurder')title.textContent='Bestuurder';
}
function decorate(){queued=false;injectForm();hideLegacyVehicleFields();}
function queue(){if(queued)return;queued=true;requestAnimationFrame(decorate);}
function installStyles(){
  if(document.getElementById('logVehicleStartInputStyles'))return;
  const style=document.createElement('style');style.id='logVehicleStartInputStyles';style.textContent=`
    .log-vehicle-start-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px 12px;margin:0}
    .log-vehicle-start-fields>small{grid-column:1/-1;color:var(--muted);font-size:12px;line-height:1.35;margin:-2px 0 4px}
    @media(max-width:520px){.log-vehicle-start-fields{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
}
function init(){
  installStyles();migrateLegacyStart();syncActiveContext();queue();
  document.addEventListener('click',event=>{
    const edit=event.target.closest?.('[data-vehicle-edit]');if(edit){editingVehicleId=String(edit.closest('[data-vehicle-card]')?.dataset.vehicleCard||'');setTimeout(queue,0);return;}
    if(event.target.closest?.('[data-vehicle-new]')){editingVehicleId='new';setTimeout(queue,0);}
  },true);
  new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('log-vehicles-change',()=>{migrateLegacyStart();syncActiveContext();queue();});
  window.addEventListener('log-vehicle-scope-change',()=>{syncActiveContext();queue();});
  window.addEventListener('pageshow',()=>{migrateLegacyStart();syncActiveContext();queue();});
  window.LogVehicleStartSettings={save:saveVehicleStart,sync:syncActiveContext};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
