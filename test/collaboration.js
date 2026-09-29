(function(){
'use strict';

const STORE='log-test-sharing-v1';
const STATUS_STORE='log-test-sharing-status-v1';
const KM='kmreg-test-v4-data';
const ENDPOINT='https://sharon.life/log/api/publish.php';
const PUBLIC_BASE='https://sharon.life/log/config/';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let augmentQueued=false;
let rowsQueued=false;

const read=(key=STORE)=>{try{const v=JSON.parse(localStorage.getItem(key)||'{}');return v&&typeof v==='object'?v:{};}catch(_){return {};}};
const write=v=>localStorage.setItem(STORE,JSON.stringify(v));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function collaborationStore(state=read()){
  state.collaboration=state.collaboration&&typeof state.collaboration==='object'?state.collaboration:{};
  return state.collaboration;
}
function setAccess(id,enabled,extra={}){
  if(!VALID.test(String(id||'')))return false;
  const state=read(),items=collaborationStore(state);
  if(enabled)items[id]={...items[id],...extra,enabled:true,checkedAt:new Date().toISOString()};
  else if(items[id])items[id]={...items[id],...extra,enabled:false,checkedAt:new Date().toISOString()};
  write(state);queueRows();return true;
}
function canEdit(id){return Boolean(read().collaboration?.[id]?.enabled===true);}
function isOwner(id){const info=read().published?.[id];return Boolean(info&&info.type==='card');}
function canonical(value){return JSON.stringify({schema:value?.schema,kind:value?.kind,title:value?.title,root:value?.root,objects:value?.objects});}
function syncStatusBaseline(id){
  try{
    const status=read(STATUS_STORE);status.items=status.items&&typeof status.items==='object'?status.items:{};
    const current=status.items[id]||{},bundle=baseBundle(id);
    status.items[id]={...current,kind:'bundle',signature:canonical(bundle)};
    localStorage.setItem(STATUS_STORE,JSON.stringify(status));
  }catch(_){}
}
function markPublish(id,revision){
  const state=read(),items=collaborationStore(state);
  items[id]={...items[id],enabled:true,publishedAt:new Date().toISOString(),revision:Number(revision)||Number(items[id]?.revision)||1};
  const info=state.published?.[id];
  if(info){info.revision=Number(revision)||Number(info.revision)||1;info.publishedAt=new Date().toISOString();info.signature=canonical(baseBundle(id));}
  write(state);syncStatusBaseline(id);queueRows();
}

function localCardById(id){const km=read(KM),cards=Array.isArray(km.cards)?km.cards:[];return cards.find(card=>String(card.id)===String(id))||null;}
function localCardForConfig(id){
  const km=read(KM),cards=Array.isArray(km.cards)?km.cards:[],state=read(),info=state.published?.[id];
  return cards.find(card=>String(card.id)===String(info?.id))||cards.find(card=>card?.sharedSource?.configurationId===id&&card?.sharedSource?.isRoot)||cards.find(card=>String(card.id)===String(id))||null;
}
function identifierForItem(type,id){
  if(type!=='card')return '';
  const state=read(),card=localCardById(id),rooted=state.roots?.[`card:${id}`],fromSource=card?.sharedSource?.configurationId,legacy=Array.isArray(card?.sharedConfigurationIds)?card.sharedConfigurationIds.find(value=>VALID.test(String(value||''))):'';
  return [rooted,fromSource,legacy,String(id||'')].map(value=>String(value||'')).find(value=>VALID.test(value)&&Boolean(state.published?.[value]||state.collaboration?.[value]||fromSource===value||legacy===value))||'';
}
function canEditItem(type,id){const identifier=identifierForItem(type,id);return !!identifier&&canEdit(identifier);}

function baseBundle(id){
  const card=localCardForConfig(id);
  if(!card)throw Error('De lokale kaart voor deze identifier is niet gevonden.');
  if(window.LogSharing?.buildBundle){
    try{const bundle=window.LogSharing.buildBundle('card',card.id);bundle.id=id;return bundle;}catch(_){}
  }
  const clean={};
  for(const key of ['id','name','format','value','color','locationId','scanAction','createdAt','updatedAt'])if(card[key]!==undefined)clean[key]=JSON.parse(JSON.stringify(card[key]));
  return{schema:'https://sharon.life/log/config/v1',kind:'log-config',id,title:card.name||'Kaart',root:{type:'card',sourceId:String(card?.sharedSource?.sourceId||card.id)},exportedAt:new Date().toISOString(),source:{app:'Log',build:String(window.LOG_TEST_BUILD||'0.35.1-test.10')},objects:{locations:[],themes:[],subthemes:[],cards:[clean],actions:[]}};
}
async function request(bundle,headers={}){
  const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json',...headers},body:JSON.stringify(bundle),cache:'no-store'});
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok)throw Error(result.error||`Publiceren mislukt (${response.status}).`);
  return result;
}
async function fetchRemote(id){
  if(!VALID.test(id))throw Error('Ongeldige gedeelde identifier.');
  const response=await fetch(`${PUBLIC_BASE}${id}.json`,{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});
  if(response.status===404)throw Error('Deze gedeelde kaart is niet meer beschikbaar.');
  if(!response.ok)throw Error(`De gedeelde kaart kon niet worden gecontroleerd (${response.status}).`);
  return response.json();
}
async function syncRemoteAccess(id,{requireActive=false}={}){
  try{
    const doc=await fetchRemote(id),sharing=doc?.sharing&&typeof doc.sharing==='object'?doc.sharing:null;
    if(sharing?.active===false){setAccess(id,false,{stopped:true});if(requireActive)throw Error('Delen van deze kaart is gestopt.');return{doc,sharing,stopped:true};}
    if(sharing)setAccess(id,sharing.collaboration===true,{stopped:false});
    return{doc,sharing,stopped:false};
  }catch(error){
    if(/niet meer beschikbaar/.test(error.message||'')){setAccess(id,false,{stopped:true});if(requireActive)throw Error('Delen van deze kaart is gestopt.');}
    throw error;
  }
}

async function enable(id){
  if(!isOwner(id))throw Error('Alleen de deler kan samenwerken aan- of uitzetten.');
  const key=String(read().key||'');if(!key)throw Error('De publicatiekoppeling ontbreekt op dit apparaat.');
  const result=await request(baseBundle(id),{'X-Log-Publish-Key':key,'X-Log-Collaboration':'on'});
  setAccess(id,true,{owner:true,stopped:false});markPublish(id,result.revision);return result;
}
async function disable(id){
  if(!isOwner(id))throw Error('Alleen de deler kan samenwerken aan- of uitzetten.');
  const key=String(read().key||'');if(!key)throw Error('De publicatiekoppeling ontbreekt op dit apparaat.');
  const result=await request(baseBundle(id),{'X-Log-Publish-Key':key,'X-Log-Collaboration':'off'});
  setAccess(id,false,{owner:true,stopped:false});
  const state=read(),info=state.published?.[id];if(info){info.revision=Number(result.revision)||Number(info.revision)||1;info.publishedAt=new Date().toISOString();info.signature=canonical(baseBundle(id));write(state);}syncStatusBaseline(id);queueRows();return result;
}
async function publishCollaborative(id){
  const remote=await syncRemoteAccess(id,{requireActive:true});
  if(remote.sharing?.collaboration!==true||!canEdit(id))throw Error('Samenwerken staat voor deze kaart niet meer aan.');
  const result=await request(baseBundle(id));
  markPublish(id,result.revision);return result;
}
async function stopSharing(id){
  if(!isOwner(id))throw Error('Alleen de deler kan delen stoppen.');
  const key=String(read().key||'');if(!key)throw Error('De publicatiekoppeling ontbreekt op dit apparaat.');
  await request(baseBundle(id),{'X-Log-Publish-Key':key,'X-Log-Stop-Sharing':'1'});
  const state=read();
  if(state.published?.[id])delete state.published[id];
  if(state.roots&&typeof state.roots==='object')for(const [name,value] of Object.entries(state.roots))if(String(value)===id)delete state.roots[name];
  const items=collaborationStore(state);items[id]={enabled:false,stopped:true,checkedAt:new Date().toISOString()};
  state.stopped=state.stopped&&typeof state.stopped==='object'?state.stopped:{};state.stopped[id]={stoppedAt:new Date().toISOString(),type:'card'};
  write(state);
  try{const status=read(STATUS_STORE);if(status.items?.[id]){delete status.items[id];localStorage.setItem(STATUS_STORE,JSON.stringify(status));}}catch(_){}
  queueRows();window.dispatchEvent(new Event('log-shell-view-refresh'));return true;
}

async function showCollaborativeStatus(type,localId){
  const id=identifierForItem(type,localId);if(!id)return false;
  const ui=window.LogCardsUI;if(!ui?.sheet)return false;
  let remote;
  try{remote=await syncRemoteAccess(id,{requireActive:true});}catch(error){const panel=ui.sheet('Gedeelde kaart',`<p>${esc(error.message)}</p><button class="btn full" data-collab-close>Sluiten</button>`);panel.querySelector('[data-collab-close]').onclick=()=>ui.close();return true;}
  if(remote.sharing?.collaboration!==true){const panel=ui.sheet('Gedeelde kaart',`<p>Deze kaart is gedeeld, maar samenwerken staat uit.</p><button class="btn full" data-collab-close>Sluiten</button>`);panel.querySelector('[data-collab-close]').onclick=()=>ui.close();return true;}
  const local=baseBundle(id),changed=canonical(local)!==canonical(remote.doc),card=localCardForConfig(id);
  const panel=ui.sheet(card?.name||'Gedeelde kaart',`<p class="log-collab-summary"><strong>Samenwerken aan</strong><span>Iedereen met deze identifier kan wijzigingen publiceren.</span></p><div class="log-collab-identifier">${esc(id)}</div><p class="cards-notice">${changed?'Je hebt lokale wijzigingen die nog niet zijn gepubliceerd.':'Deze kaart is actueel.'}</p>${changed?'<button class="btn full" data-collab-publish>Wijzigingen publiceren</button>':''}<button class="btn secondary full" data-collab-close>Sluiten</button><p role="status" data-collab-status></p>`);
  panel.querySelector('[data-collab-close]').onclick=()=>ui.close();
  const publish=panel.querySelector('[data-collab-publish]');if(publish)publish.onclick=async()=>{publish.disabled=true;const status=panel.querySelector('[data-collab-status]');try{const result=await publishCollaborative(id);status.textContent=`Wijzigingen gepubliceerd · revisie ${Number(result.revision)||1}.`;publish.remove();queueRows();}catch(error){status.textContent=error.message;publish.disabled=false;}};
  return true;
}

function updateNote(note,text){if(note)note.textContent=text;}
function collaborationControl(id,owner){
  const section=document.createElement('div');section.className='log-collaboration-control';section.dataset.collaborationControl='1';
  section.innerHTML=`<label class="log-collaboration-row"><span><strong>Samenwerken aan</strong><small>Iedereen met deze identifier kan wijzigingen publiceren.</small></span><input type="checkbox" role="switch" data-collaboration-toggle ${canEdit(id)?'checked':''} ${owner?'':'disabled'}></label>${owner?'<button type="button" class="log-collaboration-stop" data-collaboration-stop>Delen stoppen</button>':''}`;
  return section;
}
function augment(){
  augmentQueued=false;const dialog=document.querySelector('dialog.log-public-dialog[open]');if(!dialog||dialog.dataset.collaborationAugmented)return;
  const id=dialog.querySelector('.log-public-identifier')?.textContent?.trim();if(!VALID.test(id))return;
  const info=read().published?.[id],card=localCardForConfig(id);if(info?.type!=='card'&&!card?.sharedSource)return;
  dialog.dataset.collaborationAugmented='1';const actions=dialog.querySelector('.log-public-actions'),note=dialog.querySelector('.log-public-note');if(!actions)return;
  const owner=isOwner(id),control=collaborationControl(id,owner);actions.insertAdjacentElement('beforebegin',control);
  const toggle=control.querySelector('[data-collaboration-toggle]');
  if(owner&&toggle)toggle.onchange=async()=>{toggle.disabled=true;try{if(toggle.checked){await enable(id);updateNote(note,'Samenwerken staat aan. Iedereen met deze identifier kan wijzigingen publiceren.');}else{await disable(id);updateNote(note,'Samenwerken staat uit. De kaart blijft gedeeld en kan nog wel worden opgehaald.');}toggle.checked=canEdit(id);queueRows();}catch(error){toggle.checked=canEdit(id);updateNote(note,error.message);}finally{toggle.disabled=false;}};
  const stop=control.querySelector('[data-collaboration-stop]');if(stop)stop.onclick=async()=>{if(!confirm('Delen stoppen? Bestaande lokale kopieën blijven bestaan, maar deze identifier is daarna niet meer beschikbaar.'))return;stop.disabled=true;try{await stopSharing(id);try{dialog.close();}catch(_){}dialog.remove();document.body.classList.remove('cards-dialog-open');}catch(error){updateNote(note,error.message);stop.disabled=false;}};
  syncRemoteAccess(id).then(()=>{if(toggle)toggle.checked=canEdit(id);queueRows();}).catch(()=>{});
}
function queueAugment(){if(augmentQueued)return;augmentQueued=true;requestAnimationFrame(augment);}

function collaborationIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3.5 19c.4-3.5 2.4-5.5 5.5-5.5s5.1 2 5.5 5.5M13.5 14.5c2.9-.4 5.3 1.2 6 4.5"/></svg>';}
function decorateRows(){
  rowsQueued=false;document.querySelectorAll('[data-card-open]').forEach(button=>{if(button.closest('[data-la-row]'))return;const row=button.closest('.code-card-swipe')||button,id=identifierForItem('card',button.dataset.cardOpen);let mark=[...row.children].find(node=>node?.dataset?.collaborationMark==='1');const show=Boolean(id&&canEdit(id));if(show&&!mark){mark=document.createElement('span');mark.className='log-collaboration-mark';mark.dataset.collaborationMark='1';mark.innerHTML=collaborationIcon();mark.title='Samenwerken aan';row.appendChild(mark);}if(mark)mark.hidden=!show;});
}
function queueRows(){if(rowsQueued)return;rowsQueued=true;requestAnimationFrame(decorateRows);}

function installStyles(){
  if(document.getElementById('logCollaborationSimpleStyle'))return;const style=document.createElement('style');style.id='logCollaborationSimpleStyle';style.textContent=`
  .log-collaboration-control{margin:14px 0 4px;padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--card)}
  .log-collaboration-row{display:flex;align-items:center;justify-content:space-between;gap:14px}.log-collaboration-row>span{display:grid;gap:3px}.log-collaboration-row strong{font-size:13px}.log-collaboration-row small{color:var(--muted);font-size:11px;line-height:1.35}
  .log-collaboration-row input[role="switch"]{appearance:none;-webkit-appearance:none;width:50px;height:30px;flex:0 0 auto;border:0;border-radius:999px;background:rgba(120,120,128,.28);position:relative;transition:.18s}.log-collaboration-row input[role="switch"]:after{content:"";position:absolute;width:26px;height:26px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:.18s}.log-collaboration-row input[role="switch"]:checked{background:#34c759}.log-collaboration-row input[role="switch"]:checked:after{transform:translateX(20px)}.log-collaboration-row input[role="switch"]:disabled{opacity:.68}
  .log-collaboration-stop{display:block;width:100%;margin-top:11px;padding:10px;border:0;border-top:1px solid var(--line);background:transparent;color:var(--bad,#ff6767);font:inherit;font-size:12px;font-weight:750;text-align:center}
  .log-collaboration-mark{position:absolute;left:25px;top:6px;z-index:8;width:18px;height:18px;display:grid;place-items:center;pointer-events:none;color:var(--good,#49d17d)}.log-collaboration-mark[hidden]{display:none!important}.log-collaboration-mark svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .log-collab-summary{display:grid;gap:4px}.log-collab-summary span{color:var(--muted);font-size:12px}.log-collab-identifier{margin:12px 0;padding:11px;border:1px solid var(--line);border-radius:11px;background:var(--card2);font-family:"SFMono-Regular",Consolas,monospace;font-weight:800;text-align:center;letter-spacing:.04em}
  `;document.head.appendChild(style);
}
function patchSharingUI(){
  const ui=window.LogSharingUI;if(!ui||ui.__identifierCollaboration)return false;const originalCanShare=ui.canShare.bind(ui),originalShare=ui.shareFromSurface.bind(ui);
  ui.canShare=surface=>{const target=ui.resolveSurface?.(surface);return originalCanShare(surface)||Boolean(target?.type==='card'&&canEditItem('card',target.id));};
  ui.shareFromSurface=async surface=>{const target=ui.resolveSurface?.(surface),identifier=target?.type==='card'?identifierForItem('card',target.id):'';if(identifier&&canEdit(identifier)&&!isOwner(identifier))return showCollaborativeStatus('card',target.id);return originalShare(surface);};
  ui.__identifierCollaboration=true;return true;
}
function installSharedBridge(){
  const shared=window.LogSharedConfig;if(!shared||shared.__identifierCollaboration)return false;
  if(typeof shared.openByIdentifier==='function'){const original=shared.openByIdentifier.bind(shared);shared.openByIdentifier=async id=>{try{await syncRemoteAccess(id,{requireActive:true});}catch(error){const ui=window.LogCardsUI;if(ui?.sheet){const panel=ui.sheet('Gedeelde kaart',`<p>${esc(error.message)}</p><button class="btn full" data-collab-close>Sluiten</button>`);panel.querySelector('[data-collab-close]').onclick=()=>ui.close();return panel;}throw error;}return original(id);};}
  if(typeof shared.fetchPayload==='function'){const originalFetch=shared.fetchPayload.bind(shared);shared.fetchPayload=async id=>{await syncRemoteAccess(id,{requireActive:true});return originalFetch(id);};}
  shared.__identifierCollaboration=true;return true;
}
function install(){
  window.LOG_TEST_BUILD=window.LOG_TEST_BUILD||'0.35.1-test.10';installStyles();queueRows();queueAugment();
  new MutationObserver(()=>{queueAugment();queueRows();patchSharingUI();installSharedBridge();}).observe(document.documentElement,{childList:true,subtree:true});
  ['log-km-state-change','log-time-state-change','log-shell-view-refresh','log-shared-card-update-state','log-shared-config-update-state'].forEach(name=>window.addEventListener(name,queueRows));
  window.addEventListener('pageshow',()=>{queueRows();patchSharingUI();installSharedBridge();});
  const timer=setInterval(()=>{const done=patchSharingUI()&&installSharedBridge();if(done)clearInterval(timer);},100);setTimeout(()=>clearInterval(timer),15000);
  window.LogCollaboration={canEdit,isOwner,identifierForItem,canEditItem,enable,disable,publishCollaborative,stopSharing,syncRemoteAccess,showCollaborativeStatus};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();