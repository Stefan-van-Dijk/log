(function(){
'use strict';

const STORE='log-test-vehicles-v1';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const REVEAL_MS=15000;
let writing=false;
let queued=false;
const timers=new WeakMap();

function read(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch(_){return{};}}
function write(value){localStorage.setItem(STORE,JSON.stringify(value));}
function objectId(value){return String(value?.id||value?.vehicleId||value||'');}
function vehicleFor(id){return read().vehicles?.[String(id||'')]||null;}
function normalizedPolicy(value){
  const source=value&&typeof value==='object'?value:{};
  return{local:source.local!==false,external:source.external===true};
}
function ensurePolicies(){
  if(writing)return false;
  const state=read();state.vehicles=state.vehicles&&typeof state.vehicles==='object'?state.vehicles:{};
  let changed=false;
  for(const [key,vehicle] of Object.entries(state.vehicles)){
    if(!vehicle||typeof vehicle!=='object'||!VALID.test(key))continue;
    if(vehicle.id!==key){vehicle.id=key;changed=true;}
    const next=normalizedPolicy(vehicle.idVisibility),current=vehicle.idVisibility||null;
    if(!current||current.local!==next.local||current.external!==next.external){vehicle.idVisibility=next;changed=true;}
  }
  if(changed){
    writing=true;
    try{state.updatedAt=new Date().toISOString();write(state);}finally{writing=false;}
  }
  return changed;
}
function policyFor(value){
  const id=objectId(value),vehicle=vehicleFor(id)||((value&&typeof value==='object')?value:null);
  return normalizedPolicy(vehicle?.idVisibility);
}
function canReveal(value,context='local'){
  const id=objectId(value);if(!VALID.test(id))return false;
  const policy=policyFor(value);
  return context==='external'?policy.external===true:policy.local!==false;
}
function setVisibility(value,{local,external}={}){
  const id=objectId(value),state=read(),vehicle=state.vehicles?.[id];
  if(!vehicle)throw new Error('Object niet gevonden.');
  const current=normalizedPolicy(vehicle.idVisibility);
  vehicle.id=id;
  vehicle.idVisibility={local:local==null?current.local:Boolean(local),external:external==null?current.external:Boolean(external)};
  vehicle.updatedAt=new Date().toISOString();state.updatedAt=vehicle.updatedAt;write(state);
  window.dispatchEvent(new CustomEvent('log-vehicles-change',{detail:{reason:'id-visibility',id}}));
  queueDecorate();
  return vehicle.idVisibility;
}
function setExternal(value,allowed){return setVisibility(value,{external:Boolean(allowed)});}
function contextFor(card){return card.matches('[data-id-context="external"]')||card.closest('[data-id-context="external"],[data-log-shared-context="external"],[data-shared-external="1"]')?'external':'local';}
function hideRow(card,row,button){
  const timer=timers.get(card);if(timer)clearTimeout(timer);timers.delete(card);
  row.hidden=true;card.classList.remove('log-object-id-open');button?.setAttribute('aria-expanded','false');
}
function revealRow(card,row,button){
  const id=String(card.dataset.vehicleCard||''),context=contextFor(card);
  if(!canReveal(id,context))return;
  const label=row.querySelector('span'),value=row.querySelector('strong');
  if(label)label.textContent='ID';if(value)value.textContent=id;
  row.hidden=false;card.classList.add('log-object-id-open');button?.setAttribute('aria-expanded','true');
  const old=timers.get(card);if(old)clearTimeout(old);
  timers.set(card,setTimeout(()=>hideRow(card,row,button),REVEAL_MS));
}
function decorateCard(card){
  const id=String(card.dataset.vehicleCard||'');if(!VALID.test(id))return;
  const row=card.querySelector('.log-vehicle-id');if(!row)return;
  const context=contextFor(card),allowed=canReveal(id,context);
  row.querySelector('span')&&(row.querySelector('span').textContent='ID');
  row.hidden=true;
  let button=card.querySelector('[data-object-id-toggle]');
  if(!allowed){button?.remove();return;}
  if(!button){
    button=document.createElement('button');button.type='button';button.className='log-object-id-toggle';button.dataset.objectIdToggle='1';button.setAttribute('aria-label','ID tonen');button.setAttribute('aria-expanded','false');button.innerHTML='<span aria-hidden="true">ID</span>';
    const active=card.querySelector('.log-vehicle-active'),head=card.querySelector('.log-vehicle-card-head');
    if(active)active.insertAdjacentElement('beforebegin',button);else head?.appendChild(button);
    button.addEventListener('click',event=>{event.stopPropagation();if(row.hidden)revealRow(card,row,button);else hideRow(card,row,button);});
  }
}
function replaceWording(root=document){
  root.querySelectorAll?.('#kmShellVehicleIdentities .cards-notice,.log-vehicle-list~*,.log-vehicle-card .log-vehicle-id span').forEach(node=>{
    if(node.childElementCount===0&&node.textContent.includes('VehicleId'))node.textContent=node.textContent.replaceAll('VehicleId','ID');
  });
  const settingsNote=root.querySelector?.('#kmShellVehicleIdentities .cards-notice');
  if(settingsNote&&settingsNote.textContent.includes('VehicleId'))settingsNote.textContent=settingsNote.textContent.replaceAll('VehicleId','ID');
  document.querySelectorAll('.log-public-dialog .log-vehicle-id span,[data-id-context="external"] .log-vehicle-id span').forEach(node=>node.textContent='ID');
}
function decorate(){
  queued=false;ensurePolicies();replaceWording();
  document.querySelectorAll('.log-vehicle-card[data-vehicle-card]').forEach(decorateCard);
}
function queueDecorate(){if(queued)return;queued=true;requestAnimationFrame(decorate);}
function installStyles(){
  if(document.getElementById('logObjectIdPresentationStyles'))return;
  const style=document.createElement('style');style.id='logObjectIdPresentationStyles';style.textContent=`
    .log-object-id-toggle{flex:0 0 auto;display:grid;place-items:center;width:31px;height:31px;padding:0;border:1px solid var(--line);border-radius:9px;background:transparent;color:var(--muted);cursor:pointer}
    .log-object-id-toggle span{font:750 10px/1 "SFMono-Regular",Consolas,monospace;letter-spacing:-.04em}.log-object-id-toggle[aria-expanded="true"]{color:var(--text);background:var(--card)}
    .log-vehicle-id[hidden]{display:none!important}.log-object-id-open .log-vehicle-id{display:grid}
  `;document.head.appendChild(style);
}
function init(){
  installStyles();ensurePolicies();queueDecorate();
  new MutationObserver(queueDecorate).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('log-vehicles-change',()=>{ensurePolicies();queueDecorate();});
  window.addEventListener('pageshow',queueDecorate);
  window.LogObjectIds={id:objectId,policyFor,canReveal,setVisibility,setExternal};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
