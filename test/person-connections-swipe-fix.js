(function(){
'use strict';

const ARM=10;
const OPEN=34;
const VERTICAL=28;
const SUPPRESS=420;
let gesture=null;
let suppressUntil=0;
let bindQueued=false;

function actionWidth(){return window.LogSwipePolicy?.actionWidth?.()||(window.innerWidth<=520?78:84);}
function rightCount(row){return [...(row?.querySelector('.code-card-actions')?.children||[])].filter(button=>!button.matches('[data-person-connection-swipe]')&&!button.hidden).length;}
function rightWidth(row){return actionWidth()*rightCount(row);}
function leftWidth(row){return row?.querySelector('.log-person-share-actions [data-person-connection-swipe]')?actionWidth():0;}

function installStyles(){
  if(document.getElementById('logPersonBidirectionalSwipeStyles'))return;
  const style=document.createElement('style');
  style.id='logPersonBidirectionalSwipeStyles';
  style.textContent=`
    .people-module [data-person-row]{position:relative;overflow:hidden}
    .people-module [data-person-row]>.code-card-actions{width:calc(var(--person-right-count,1)*var(--log-action-width,84px))!important}
    .people-module [data-person-row]>.code-card-actions>[data-person-connection-swipe]{display:none!important}
    .people-module .log-person-share-actions{position:absolute;z-index:0;inset:0 auto 0 0;width:var(--log-action-width,84px);display:flex;pointer-events:none}
    .people-module .log-person-share-actions button{width:var(--log-action-width,84px);flex:0 0 var(--log-action-width,84px);border:0;border-radius:0;padding:0 4px;color:#fff;background:#198754;font:650 12px/1.25 inherit}
    .people-module .log-person-share-actions button.pending-in{background:#b86a00}
    .people-module .log-person-share-actions button.pending-out{background:#607d70}
    .people-module .log-person-share-actions button.revoked,.people-module .log-person-share-actions button.rejected{background:#2869b6}
    .people-module [data-person-row].actions-open[data-person-swipe-side="left"]>.log-person-share-actions{pointer-events:auto}
    .people-module [data-person-row]>.code-card-surface{position:relative;z-index:1}
  `;
  document.head.appendChild(style);
}

function ensureLeftAction(row){
  const actions=row?.querySelector('.code-card-actions'),surface=row?.querySelector('.code-card-surface');
  if(!actions||!surface)return;
  const source=actions.querySelector('[data-person-connection-swipe]');
  if(!source)return;
  source.style.setProperty('display','none','important');
  source.setAttribute('aria-hidden','true');
  source.tabIndex=-1;
  let left=row.querySelector(':scope>.log-person-share-actions');
  if(!left){
    left=document.createElement('div');
    left.className='log-person-share-actions';
    left.setAttribute('aria-hidden','true');
    left.setAttribute('inert','');
    row.insertBefore(left,surface);
  }
  let button=left.querySelector('[data-person-connection-swipe]');
  if(!button){
    button=document.createElement('button');
    button.type='button';
    button.tabIndex=-1;
    left.appendChild(button);
  }
  button.dataset.personConnectionSwipe=source.dataset.personConnectionSwipe||'';
  button.dataset.connectionSelf=source.dataset.connectionSelf||'0';
  button.className=`${source.className} log-person-share-action`;
  button.textContent=source.textContent||'Delen';
  row.style.setProperty('--person-right-count',String(Math.max(1,rightCount(row))));
}

function setSide(row,side='closed',animate=true){
  if(!row)return;
  if(side!=='closed'){
    document.querySelectorAll('.people-module [data-person-row].actions-open').forEach(other=>{if(other!==row)setSide(other,'closed');});
  }
  ensureLeftAction(row);
  const surface=row.querySelector('.code-card-surface'),actions=row.querySelector('.code-card-actions'),left=row.querySelector('.log-person-share-actions');
  if(!surface||!actions)return;
  const lw=leftWidth(row),rw=rightWidth(row);
  if(side==='left'&&!lw)side='closed';
  if(side==='right'&&!rw)side='closed';
  const x=side==='left'?lw:side==='right'?-rw:0;
  surface.style.transition=animate?'transform .18s cubic-bezier(.2,.8,.2,1)':'none';
  surface.style.transform=x?`translateX(${x}px)`:'';
  row.classList.toggle('actions-open',side!=='closed');
  row.dataset.personSwipeSide=side;
  actions.toggleAttribute('inert',side!=='right');
  actions.setAttribute('aria-hidden',String(side!=='right'));
  if(left){left.toggleAttribute('inert',side!=='left');left.setAttribute('aria-hidden',String(side!=='left'));}
  if(animate)setTimeout(()=>{if(surface.isConnected)surface.style.transition='';},200);
}

function currentSide(row){return row.classList.contains('actions-open')?(row.dataset.personSwipeSide||'right'):'closed';}
function begin(event,row,surface){
  if(event.button!=null&&event.button!==0)return;
  if(event.isPrimary===false)return;
  ensureLeftAction(row);
  const side=currentSide(row);
  gesture={row,surface,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,startSide:side,horizontal:false,cancelled:false,left:leftWidth(row),right:rightWidth(row)};
  try{surface.setPointerCapture(event.pointerId);}catch(_){ }
}
function move(event){
  const g=gesture;if(!g||g.pointerId!==event.pointerId||g.cancelled)return;
  const dx=event.clientX-g.startX,dy=event.clientY-g.startY,ax=Math.abs(dx),ay=Math.abs(dy);
  if(!g.horizontal){
    if(ay>ARM&&ay>ax){g.cancelled=true;return;}
    if(ax<ARM)return;
    if(ax<=ay){g.cancelled=true;return;}
    g.horizontal=true;
  }
  if(Math.abs(dy)>VERTICAL&&ay>ax){g.cancelled=true;return;}
  if(event.cancelable)event.preventDefault();
  const base=g.startSide==='left'?g.left:g.startSide==='right'?-g.right:0;
  const x=Math.max(-g.right,Math.min(g.left,base+dx));
  g.surface.style.transition='none';
  g.surface.style.transform=`translateX(${x}px)`;
}
function finish(event){
  const g=gesture;if(!g||g.pointerId!==event.pointerId){gesture=null;return;}
  gesture=null;
  if(event.type==='pointercancel'||!g.horizontal||g.cancelled){setSide(g.row,g.startSide);return;}
  const dx=event.clientX-g.startX;
  let side='closed';
  if(g.startSide==='closed')side=dx>OPEN&&g.left?'left':dx<-OPEN&&g.right?'right':'closed';
  else if(g.startSide==='left')side=dx<-OPEN?'closed':'left';
  else if(g.startSide==='right')side=dx>OPEN?'closed':'right';
  suppressUntil=Date.now()+SUPPRESS;
  setSide(g.row,side);
}

function bindRow(row){
  if(!row)return;
  ensureLeftAction(row);
  const surface=row.querySelector('.code-card-surface');if(!surface)return;
  if(row.dataset.personSwipeBound==='2')return;
  row.dataset.personSwipeBound='2';
  surface.style.touchAction='pan-y';
  surface.addEventListener('pointerdown',event=>begin(event,row,surface));
  surface.addEventListener('pointermove',move,{passive:false});
  surface.addEventListener('pointerup',finish);
  surface.addEventListener('pointercancel',finish);
}
function bind(){bindQueued=false;document.querySelectorAll('.people-module [data-person-row]').forEach(bindRow);}
function queueBind(){if(bindQueued)return;bindQueued=true;requestAnimationFrame(bind);}
function install(){
  installStyles();
  bind();
  new MutationObserver(queueBind).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',event=>{
    if(Date.now()>=suppressUntil)return;
    const row=event.target.closest?.('.people-module [data-person-row]');
    if(!row)return;
    if(event.target.closest?.('.code-card-actions,.log-person-share-actions'))return;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  document.addEventListener('click',event=>{
    const row=event.target.closest?.('.people-module [data-person-row]');
    if(row?.classList.contains('actions-open')&&event.target.closest?.('[data-person-open]')){
      event.preventDefault();event.stopImmediatePropagation();setSide(row,'closed');
    }
  },true);
  window.addEventListener('log-shell-view-refresh',queueBind);
  window.addEventListener('log-person-connections-change',queueBind);
  window.addEventListener('pageshow',queueBind);
  window.LogPersonConnectionSwipe={bind,setSide,setOpen:(row,open)=>setSide(row,open?'right':'closed')};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
