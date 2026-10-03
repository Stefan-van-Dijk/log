(function(){
'use strict';

const ARM=10;
const OPEN=34;
const VERTICAL=28;
const SUPPRESS=420;
let gesture=null;
let suppressUntil=0;

function actionWidth(){return window.LogSwipePolicy?.actionWidth?.()||(window.innerWidth<=520?78:84);}
function rowWidth(row){const actions=row?.querySelector('.code-card-actions');return actionWidth()*Math.max(1,actions?.children?.length||1);}
function setOpen(row,open,animate=true){
  if(!row)return;
  if(open){
    document.querySelectorAll('.people-module [data-person-row].actions-open').forEach(other=>{if(other!==row)setOpen(other,false);});
  }
  const surface=row.querySelector('.code-card-surface'),actions=row.querySelector('.code-card-actions');
  if(!surface||!actions)return;
  const width=rowWidth(row);
  surface.style.transition=animate?'transform .18s cubic-bezier(.2,.8,.2,1)':'none';
  surface.style.transform=open?`translateX(-${width}px)`:'';
  row.classList.toggle('actions-open',open);
  actions.toggleAttribute('inert',!open);
  actions.setAttribute('aria-hidden',String(!open));
  if(animate)setTimeout(()=>{if(surface.isConnected)surface.style.transition='';},200);
}
function begin(event,row,surface){
  if(event.button!=null&&event.button!==0)return;
  if(event.isPrimary===false)return;
  const open=row.classList.contains('actions-open');
  gesture={row,surface,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,startOpen:open,horizontal:false,cancelled:false,width:rowWidth(row)};
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
  const base=g.startOpen?-g.width:0;
  const x=Math.max(-g.width,Math.min(0,base+dx));
  g.surface.style.transition='none';
  g.surface.style.transform=`translateX(${x}px)`;
}
function finish(event){
  const g=gesture;if(!g||g.pointerId!==event.pointerId){gesture=null;return;}
  gesture=null;
  if(!g.horizontal||g.cancelled){setOpen(g.row,g.startOpen);return;}
  const dx=event.clientX-g.startX;
  const open=g.startOpen?!(dx>OPEN):(dx<-OPEN);
  suppressUntil=Date.now()+SUPPRESS;
  setOpen(g.row,open);
}
function bindRow(row){
  if(!row||row.dataset.personSwipeBound==='1')return;
  const surface=row.querySelector('.code-card-surface');if(!surface)return;
  row.dataset.personSwipeBound='1';
  surface.style.touchAction='pan-y';
  surface.addEventListener('pointerdown',event=>begin(event,row,surface));
  surface.addEventListener('pointermove',move,{passive:false});
  surface.addEventListener('pointerup',finish);
  surface.addEventListener('pointercancel',finish);
}
function bind(){document.querySelectorAll('.people-module [data-person-row]').forEach(bindRow);}
function install(){
  bind();
  new MutationObserver(bind).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('click',event=>{
    if(Date.now()>=suppressUntil)return;
    const row=event.target.closest?.('.people-module [data-person-row]');
    if(!row)return;
    if(event.target.closest?.('.code-card-actions'))return;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  document.addEventListener('click',event=>{
    const row=event.target.closest?.('.people-module [data-person-row]');
    if(row?.classList.contains('actions-open')&&event.target.closest?.('[data-person-open]')){
      event.preventDefault();event.stopImmediatePropagation();setOpen(row,false);
    }
  },true);
  window.addEventListener('log-shell-view-refresh',bind);
  window.addEventListener('pageshow',bind);
  window.LogPersonConnectionSwipe={bind,setOpen};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
