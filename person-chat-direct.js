(function(){
'use strict';

const BUILD='0.40.9';
const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-person-connections-v1';
let activeLocalId='';
let loadingChat=null;
let decorateQueued=false;

function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function people(){const value=read(TIME,{});return Array.isArray(value.colleagues)?value.colleagues:[];}
function person(localId){return people().find(row=>String(row.id)===String(localId)||String(row.logPersonId||'')===String(localId))||null;}
function state(){const value=read(STORE,{});return value.items&&typeof value.items==='object'?value.items:{};}
function idsFor(localId){const p=person(localId);return new Set([String(localId||''),String(p?.id||''),String(p?.logPersonId||'')].filter(Boolean));}
function otherPersonId(item){const doc=item?.cache||{},me=String(window.LogIdentitySync?.personId?.()||'');if(String(doc.fromPersonId||'')===me)return String(doc.toPersonId||'');if(String(doc.toPersonId||'')===me)return String(doc.fromPersonId||'');return String(item?.otherPersonId||'');}
function connectionFor(localId){const ids=idsFor(localId);return Object.values(state()).filter(item=>item&&item.status==='connected'&&!item.revoked&&item.connectionId).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))).find(item=>ids.has(String(item.otherPersonId||''))||ids.has(String(item.pendingLocalId||''))||ids.has(String(item.linkedLocalId||''))||ids.has(otherPersonId(item)))||null;}
function sheet(title,body){return window.LogCardsUI?.sheet?.(title,body)||null;}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function waitForChat(timeout=5000){return new Promise((resolve,reject)=>{const start=Date.now(),tick=()=>{if(window.LogConnectionChat?.open){resolve(window.LogConnectionChat);return;}if(Date.now()-start>timeout){reject(Error('De chatmodule is nog niet beschikbaar. Open Log opnieuw en probeer nogmaals.'));return;}setTimeout(tick,50);};tick();});}
function ensureChat(){
  if(window.LogConnectionChat?.open)return Promise.resolve(window.LogConnectionChat);
  if(loadingChat)return loadingChat;
  loadingChat=(async()=>{
    let script=[...document.scripts].find(item=>item.dataset.logConnectionChat==='1'||item.src.includes('/connection-chat.js'));
    if(!script){script=document.createElement('script');script.src=`./connection-chat.js?v=${BUILD}`;script.async=false;script.dataset.logConnectionChat='1';document.head.appendChild(script);}
    try{return await waitForChat();}finally{loadingChat=null;}
  })();
  return loadingChat;
}
async function openChat(localId){
  const p=person(localId);if(!p){sheet('Chat','<p class="cards-notice">Persoon niet gevonden.</p>');return false;}
  if(!connectionFor(localId)){sheet('Chat',`<p class="cards-notice">Verbind eerst met <strong>${esc(p.name||'deze persoon')}</strong>. Daarna kan het gesprek direct vanuit Personen worden geopend.</p>`);return false;}
  const api=await ensureChat();
  window.LogCardsUI?.close?.();
  return api.open(String(p.id||localId));
}
function addPersonDetailChat(){
  if(!activeLocalId)return;
  const details=[...document.querySelectorAll('.people-detail')];
  for(const detail of details){
    const panel=detail.closest('.cards-dialog,dialog')||detail.parentElement;if(!panel||panel.querySelector('[data-person-chat-direct]'))continue;
    const edit=panel.querySelector('[data-person-edit]');if(!edit)continue;
    const button=document.createElement('button');button.type='button';button.className=`btn ${connectionFor(activeLocalId)?'primary':'secondary'} full`;button.dataset.personChatDirect=activeLocalId;button.textContent='Chat';edit.before(button);
  }
}
function patchConnectionSheet(){
  if(!activeLocalId)return;
  document.querySelectorAll('[data-connection-chat]').forEach(button=>{button.textContent='Chat';button.dataset.personChatDirect=activeLocalId;});
}
function decorate(){decorateQueued=false;addPersonDetailChat();patchConnectionSheet();}
function queueDecorate(){if(decorateQueued)return;decorateQueued=true;requestAnimationFrame(decorate);}
function rememberFromButton(button){const id=button?.dataset?.personOpen||button?.dataset?.personConnectionSwipe||button?.dataset?.personChatDirect||'';if(id)activeLocalId=String(id);}
function onClick(event){
  const source=event.target.closest?.('[data-person-open],[data-person-connection-swipe]');if(source){rememberFromButton(source);queueDecorate();setTimeout(queueDecorate,80);setTimeout(queueDecorate,250);return;}
  const direct=event.target.closest?.('[data-person-chat-direct],[data-connection-chat]');if(!direct)return;
  const id=String(direct.dataset.personChatDirect||activeLocalId||'');if(!id)return;
  event.preventDefault();event.stopImmediatePropagation();rememberFromButton(direct);openChat(id).catch(error=>sheet('Chat',`<p class="cards-notice">${esc(error.message)}</p>`));
}
function install(){
  window.LOG_BUILD=window.LOG_BUILD||BUILD;
  window.LOG_TEST_BUILD=window.LOG_TEST_BUILD||BUILD;
  document.addEventListener('click',onClick,true);
  ['log-person-connections-change','log-time-state-change','log-shell-view-refresh','pageshow'].forEach(name=>window.addEventListener(name,queueDecorate));
  const observer=new MutationObserver(queueDecorate);observer.observe(document.body,{childList:true,subtree:true});
  window.LogPersonChat={open:openChat,connectionFor};
  setTimeout(queueDecorate,300);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
