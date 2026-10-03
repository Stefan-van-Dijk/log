(function(){
'use strict';

const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-collaboration-v2';
let reconciling=false;

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function compactSource(source={}){return JSON.stringify({themeName:source.themeName||'',subthemeName:source.subthemeName||'',locationName:source.locationName||'',note:source.note||'',startISO:source.startISO||'',endISO:source.endISO||'',dateISO:source.dateISO||'',assignedMinutes:Number(source.assignedMinutes)||0});}
function inboxFingerprint(inbox){const entry=inbox?.content?.entry||{};return compactSource({...entry,assignedMinutes:inbox?.content?.assignedMinutes});}
function importedFingerprint(entry){return compactSource({...entry,assignedMinutes:entry?.ownMinutes});}

function reconcile(){
  if(reconciling)return;
  reconciling=true;
  try{
    const collaboration=read(STORE,{}),inbox=collaboration.inbox&&typeof collaboration.inbox==='object'?collaboration.inbox:{},time=read(TIME,{});time.entries=Array.isArray(time.entries)?time.entries:[];
    let stateChanged=false,timeChanged=false;
    for(const [alias,item] of Object.entries(inbox)){
      if(item?.kind!=='task')continue;
      const imported=time.entries.find(entry=>entry?.sharedSource?.collaborationAlias===alias);
      if(item.status==='accepted'&&imported&&inboxFingerprint(item)!==importedFingerprint(imported)){
        item.status='pending';
        item.updatedAt=new Date().toISOString();
        collaboration.inbox[alias]=item;
        time.entries=time.entries.filter(entry=>entry?.sharedSource?.collaborationAlias!==alias);
        stateChanged=true;timeChanged=true;
      }
      if(item.status!=='accepted'&&imported){
        time.entries=time.entries.filter(entry=>entry?.sharedSource?.collaborationAlias!==alias);
        timeChanged=true;
      }
    }
    if(stateChanged)write(STORE,collaboration);
    if(timeChanged){write(TIME,time);window.dispatchEvent(new Event('log-time-state-change'));}
  }finally{reconciling=false;}
}

function protectOwnPersonId(){
  const time=read(TIME,{}),selfLocalId=String(time.settings?.selfPersonId||'');
  if(!selfLocalId)return;
  document.querySelectorAll('.people-detail').forEach(detail=>{
    const edit=detail.parentElement?.querySelector('[data-person-edit]');
    if(String(edit?.dataset.personEdit||'')!==selfLocalId)return;
    const block=detail.querySelector('[data-c2-person-link]');
    if(!block||block.dataset.selfProtected==='1')return;
    block.dataset.selfProtected='1';
    const button=block.querySelector('button');
    if(button){button.remove();}
    const label=block.querySelector('small');
    if(label)label.textContent='Mijn vaste Log PersonId';
  });
}

function run(){reconcile();protectOwnPersonId();}
function install(){run();new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});['log-collaboration-v2-change','log-time-state-change','pageshow'].forEach(name=>window.addEventListener(name,run));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
