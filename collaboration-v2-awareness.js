(function(){
'use strict';

const BUILD='0.39-test.3';
const STORE='log-test-collaboration-v2';
const AWARE='log-test-collaboration-v2-awareness';
let queued=false;
let processing=false;
let decorating=false;

const read=(key,fallback={})=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}};
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
function state(){const value=read(STORE,{});return value.items&&typeof value.items==='object'?value.items:{};}
function awareness(){const value=read(AWARE,{});return{seen:value.seen&&typeof value.seen==='object'?value.seen:{},flagged:value.flagged&&typeof value.flagged==='object'?value.flagged:{}};}
function selfId(){return window.LogIdentitySync?.personId?.()||'';}
function revision(item){return Math.max(0,Number(item?.revision)||0);}
function latestBy(items,dateKeys){let latest=null,stamp=-Infinity;for(const item of Array.isArray(items)?items:[]){for(const key of dateKeys){const time=new Date(item?.[key]||0).getTime();if(Number.isFinite(time)&&time>stamp){stamp=time;latest=item;}if(Number.isFinite(time)&&time>0)break;}}return latest;}
function remoteAuthored(item){
  const me=selfId(),doc=item?.cache||{};
  if(!me)return item?.role==='member';
  if(item?.kind==='task')return String(doc.ownerPersonId||item.ownerPersonId||'')!==me;
  if(item?.kind==='conversation'){
    const last=latestBy(doc.messages,['createdAt','updatedAt']);
    return last?String(last.authorPersonId||'')!==me:item?.role==='member';
  }
  if(item?.kind==='vehicle'){
    const records=doc.content?.records||{};
    const lastTrip=latestBy(records.trips,['updatedAt','createdAt','arrivalTime','departureTime']);
    const lastEvent=latestBy(records.events,['updatedAt','createdAt','time']);
    const tripTime=new Date(lastTrip?.updatedAt||lastTrip?.createdAt||lastTrip?.arrivalTime||lastTrip?.departureTime||0).getTime()||0;
    const eventTime=new Date(lastEvent?.updatedAt||lastEvent?.createdAt||lastEvent?.time||0).getTime()||0;
    const last=eventTime>tripTime?lastEvent:lastTrip;
    const actor=last?.driverPersonId||last?.actorPersonId||last?.createdByPersonId||'';
    return actor?String(actor)!==me:item?.role==='member';
  }
  return item?.role==='member';
}
function refreshFlags(){
  if(processing)return;processing=true;
  try{
    const items=state(),a=awareness();let changed=false;
    for(const [alias,item] of Object.entries(items)){
      const rev=revision(item);
      if(a.seen[alias]==null){a.seen[alias]=rev;changed=true;continue;}
      if(item?.revoked){if(a.flagged[alias]!=null){delete a.flagged[alias];changed=true;}continue;}
      if(rev>Number(a.seen[alias]||0)&&remoteAuthored(item)&&Number(a.flagged[alias]||0)!==rev){a.flagged[alias]=rev;changed=true;}
    }
    for(const alias of Object.keys(a.seen))if(!items[alias]){delete a.seen[alias];delete a.flagged[alias];changed=true;}
    if(changed)write(AWARE,a);
  }finally{processing=false;}
}
function hasUpdate(alias){const item=state()[alias],a=awareness();return Boolean(item&&!item.revoked&&Number(a.flagged[alias]||0)>Number(a.seen[alias]||0));}
function markSeen(alias,render=true){if(!alias)return;const item=state()[alias];if(!item)return;const a=awareness(),rev=revision(item);a.seen[alias]=Math.max(Number(a.seen[alias]||0),rev);delete a.flagged[alias];write(AWARE,a);if(render)queue();}
function markOpenPanelsSeen(){for(const button of document.querySelectorAll('[data-c2-sync]')){const alias=button.dataset.c2Sync;if(alias&&hasUpdate(alias))markSeen(alias,false);}}
function decorate(){
  if(decorating)return;decorating=true;
  try{
    refreshFlags();
    markOpenPanelsSeen();
    document.querySelectorAll('[data-c2-open]').forEach(button=>{
      const alias=button.dataset.c2Open||'',updated=hasUpdate(alias);
      button.classList.toggle('log-c2-has-update',updated);
      let dot=button.querySelector('[data-c2-awareness-dot]');
      if(updated&&!dot){dot=document.createElement('span');dot.dataset.c2AwarenessDot='1';dot.className='log-c2-awareness-dot';dot.title='Nieuwe update van een andere deelnemer';button.prepend(dot);}
      if(dot)dot.hidden=!updated;
      const small=button.querySelector('small');
      if(small){if(updated){if(!small.dataset.c2Original)small.dataset.c2Original=small.textContent||'';small.textContent='Nieuwe update beschikbaar';}else if(small.dataset.c2Original){small.textContent=small.dataset.c2Original;delete small.dataset.c2Original;}}
    });
  }finally{decorating=false;}
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();});}
function installStyles(){if(document.getElementById('logCollaborationV2AwarenessStyles'))return;const style=document.createElement('style');style.id='logCollaborationV2AwarenessStyles';style.textContent=`.log-c2-item{position:relative}.log-c2-awareness-dot{width:9px;height:9px;flex:0 0 9px;margin-right:7px;border-radius:50%;background:var(--warn,#ff9f0a);box-shadow:0 0 0 3px color-mix(in srgb,var(--warn,#ff9f0a) 16%,transparent)}.log-c2-awareness-dot[hidden]{display:none!important}.log-c2-item.log-c2-has-update>span:first-of-type{flex:1}`;document.head.appendChild(style);}
function install(){window.LOG_TEST_BUILD=BUILD;installStyles();refreshFlags();queue();document.addEventListener('click',event=>{const open=event.target.closest?.('[data-c2-open]');if(open?.dataset.c2Open)markSeen(open.dataset.c2Open);},true);new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});['log-collaboration-v2-change','log-time-state-change','log-km-state-change','pageshow','online'].forEach(name=>window.addEventListener(name,queue));window.LogCollaborationV2Awareness={hasUpdate,markSeen,refresh:queue,state:awareness};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();