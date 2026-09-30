(function(){
'use strict';

const STORE='log-test-sharing-v1';
const STATUS_STORE='log-test-sharing-status-v1';
const KM='kmreg-test-v4-data';
const ENDPOINT='https://sharon.life/log/api/publish.php';
const PUBLIC_BASE='https://sharon.life/log/config/';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const MODES=['owner','collaborators','new-id'];
let augmentQueued=false;
let rowsQueued=false;

const read=(key=STORE)=>{try{const v=JSON.parse(localStorage.getItem(key)||'{}');return v&&typeof v==='object'?v:{};}catch(_){return {};}};
const write=v=>localStorage.setItem(STORE,JSON.stringify(v));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function items(state=read()){
  state.collaboration=state.collaboration&&typeof state.collaboration==='object'?state.collaboration:{};
  return state.collaboration;
}
function meta(id){return read().collaboration?.[id]||{};}
function setMeta(id,patch={}){
  if(!VALID.test(String(id||'')))return {};
  const state=read(),collection=items(state),previous=collection[id]&&typeof collection[id]==='object'?collection[id]:{};
  collection[id]={...previous,...patch,checkedAt:new Date().toISOString()};
  write(state);queueRows();
  return collection[id];
}
function applyServerState(id,state={}){
  const active=state.active!==false&&!state.offline&&!state.revoked;
  const collaboration=state.collaboration===true;
  return setMeta(id,{
    active,
    offline:state.offline===true,
    revoked:state.revoked===true,
    collaboration,
    enabled:active&&collaboration,
    reactivationMode:MODES.includes(state.reactivationMode)?state.reactivationMode:'owner',
    revision:Number(state.revision)||Number(meta(id).revision)||0
  });
}
function canEdit(id){const m=meta(id);return m.enabled===true&&m.active!==false&&!m.offline&&!m.revoked;}
function isOwner(id){const info=read().published?.[id];return Boolean(info&&info.type==='card');}
function modeLabel(mode){
  return mode==='collaborators'?'Iedereen met de identifier · dezelfde identifier':
    mode==='new-id'?'Iedereen mag opnieuw delen · nieuwe identifier':
    'Alleen ik · dezelfde identifier';
}
function canonical(value){return JSON.stringify({schema:value?.schema,kind:value?.kind,title:value?.title,root:value?.root,objects:value?.objects});}
function syncStatusBaseline(id){
  try{
    const status=read(STATUS_STORE);status.items=status.items&&typeof status.items==='object'?status.items:{};
    const current=status.items[id]||{},bundle=baseBundle(id);
    status.items[id]={...current,kind:'bundle',signature:canonical(bundle)};
    localStorage.setItem(STATUS_STORE,JSON.stringify(status));
  }catch(_){}
}
function markPublished(id,result={}){
  const m=applyServerState(id,{
    active:true,offline:false,revoked:false,
    collaboration:typeof result.collaboration==='boolean'?result.collaboration:meta(id).collaboration===true,
    reactivationMode:result.reactivationMode||meta(id).reactivationMode||'owner',
    revision:Number(result.revision)||Number(meta(id).revision)||1
  });
  const state=read(),info=state.published?.[id];
  if(info){
    info.revision=Number(result.revision)||Number(info.revision)||1;
    info.publishedAt=new Date().toISOString();
    try{info.signature=canonical(baseBundle(id));}catch(_){}
    state.published[id]=info;write(state);
  }
  syncStatusBaseline(id);queueRows();return m;
}

function localCardById(id){
  const km=read(KM),cards=Array.isArray(km.cards)?km.cards:[];
  return cards.find(card=>String(card.id)===String(id))||null;
}
function localCardForConfig(id){
  const km=read(KM),cards=Array.isArray(km.cards)?km.cards:[],state=read(),info=state.published?.[id];
  return cards.find(card=>String(card.id)===String(info?.id))
    ||cards.find(card=>card?.sharedSource?.configurationId===id&&card?.sharedSource?.isRoot)
    ||cards.find(card=>String(card.id)===String(id))
    ||null;
}
function identifierForItem(type,id){
  if(type!=='card')return '';
  const state=read(),card=localCardById(id),rooted=state.roots?.[`card:${id}`];
  if(VALID.test(String(rooted||'')))return String(rooted);
  const ignored=state.forkedFrom?.[String(id)]||'';
  const fromSource=card?.sharedSource?.configurationId;
  const legacy=Array.isArray(card?.sharedConfigurationIds)?card.sharedConfigurationIds.find(value=>VALID.test(String(value||''))):'';
  return [fromSource,legacy,String(id||'')]
    .map(value=>String(value||''))
    .find(value=>VALID.test(value)&&value!==ignored&&Boolean(state.published?.[value]||state.collaboration?.[value]||fromSource===value||legacy===value))||'';
}
function canEditItem(type,id){const identifier=identifierForItem(type,id);return !!identifier&&canEdit(identifier);}

function baseBundle(id){
  const card=localCardForConfig(id);
  if(!card)throw Error('De lokale kaart voor deze identifier is niet gevonden.');
  if(window.LogSharing?.buildBundle){
    try{
      const bundle=window.LogSharing.buildBundle('card',card.id);
      bundle.id=id;
      return bundle;
    }catch(_){}
  }
  const clean={};
  for(const key of ['id','name','format','value','color','locationId','scanAction','createdAt','updatedAt'])
    if(card[key]!==undefined)clean[key]=JSON.parse(JSON.stringify(card[key]));
  return{
    schema:'https://sharon.life/log/config/v1',
    kind:'log-config',
    id,
    title:card.name||'Kaart',
    root:{type:'card',sourceId:String(card?.sharedSource?.sourceId||card.id)},
    exportedAt:new Date().toISOString(),
    source:{app:'Log',build:String(window.LOG_TEST_BUILD||'0.35.1-test.11')},
    objects:{locations:[],themes:[],subthemes:[],cards:[clean],actions:[]}
  };
}
async function request(bundle,headers={}){
  const response=await fetch(ENDPOINT,{
    method:'POST',
    headers:{'Content-Type':'application/json','Accept':'application/json',...headers},
    body:JSON.stringify(bundle),
    cache:'no-store'
  });
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok)throw Error(result.error||`Publiceren mislukt (${response.status}).`);
  return result;
}
async function fetchServerState(id){
  if(!VALID.test(id))throw Error('Ongeldige gedeelde identifier.');
  const response=await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`,{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});
  if(response.status===404)return null;
  if(response.status===405)return null;
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok)throw Error(result.error||`De deelstatus kon niet worden gecontroleerd (${response.status}).`);
  return result;
}
async function fetchRemote(id){
  const response=await fetch(`${PUBLIC_BASE}${id}.json`,{cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});
  if(response.status===404)return null;
  if(!response.ok)throw Error(`De gedeelde kaart kon niet worden gecontroleerd (${response.status}).`);
  return response.json();
}
async function syncRemoteAccess(id,{requireActive=false}={}){
  let state=null;
  try{state=await fetchServerState(id);}catch(error){if(requireActive)throw error;}
  if(state){
    applyServerState(id,state);
    if(state.revoked){
      if(requireActive)throw Error('Deze identifier is definitief ingetrokken.');
      return{state,doc:null};
    }
    if(state.offline||state.active===false){
      if(requireActive)throw Error('Deze gedeelde kaart staat offline.');
      return{state,doc:null};
    }
  }
  const doc=await fetchRemote(id);
  if(!doc){
    if(state)return{state,doc:null};
    if(requireActive)throw Error('Deze gedeelde kaart is niet meer beschikbaar.');
    return{state:null,doc:null};
  }
  const sharing=doc?.sharing&&typeof doc.sharing==='object'?doc.sharing:{};
  state={
    ...(state||{}),
    active:true,
    offline:false,
    revoked:false,
    collaboration:sharing.collaboration===true,
    reactivationMode:MODES.includes(sharing.reactivationMode)?sharing.reactivationMode:(meta(id).reactivationMode||'owner'),
    revision:Number(doc.revision)||Number(state?.revision)||0
  };
  applyServerState(id,state);
  return{state,doc};
}

function ownerHeaders(extra={}){
  const key=String(read().key||'');
  if(!key)throw Error('De publicatiekoppeling ontbreekt op dit apparaat.');
  return{'X-Log-Publish-Key':key,...extra};
}
async function updateSettings(id,{collaboration,reactivationMode}={}){
  if(!isOwner(id))throw Error('Alleen de oorspronkelijke deler kan deze instellingen wijzigen.');
  const headers=ownerHeaders({'X-Log-Sharing-Action':'settings'});
  if(typeof collaboration==='boolean')headers['X-Log-Collaboration']=collaboration?'on':'off';
  if(MODES.includes(reactivationMode))headers['X-Log-Reactivation-Mode']=reactivationMode;
  const result=await request(baseBundle(id),headers);
  applyServerState(id,result);
  const state=read(),info=state.published?.[id];
  if(info&&result.revision){info.revision=Number(result.revision);info.publishedAt=new Date().toISOString();state.published[id]=info;write(state);}
  queueRows();return result;
}
async function enable(id){return updateSettings(id,{collaboration:true});}
async function disable(id){return updateSettings(id,{collaboration:false});}
async function setRecoveryMode(id,reactivationMode){return updateSettings(id,{reactivationMode});}
async function publishCollaborative(id){
  const remote=await syncRemoteAccess(id,{requireActive:true});
  if(remote.state?.collaboration!==true||!canEdit(id))throw Error('Samenwerken staat voor deze kaart niet aan.');
  const result=await request(baseBundle(id));
  markPublished(id,result);return result;
}
async function offlineSharing(id){
  if(!isOwner(id))throw Error('Alleen de oorspronkelijke deler kan deze bron offline zetten.');
  const m=meta(id),headers=ownerHeaders({'X-Log-Sharing-Action':'offline','X-Log-Reactivation-Mode':m.reactivationMode||'owner'});
  const result=await request(baseBundle(id),headers);
  applyServerState(id,result);
  queueRows();window.dispatchEvent(new Event('log-shell-view-refresh'));return result;
}
async function revokeSharing(id){
  if(!isOwner(id))throw Error('Alleen de oorspronkelijke deler kan deze identifier definitief intrekken.');
  const result=await request(baseBundle(id),ownerHeaders({'X-Log-Sharing-Action':'revoke'}));
  const state=read();
  if(state.published?.[id])delete state.published[id];
  if(state.roots&&typeof state.roots==='object')for(const [name,value] of Object.entries(state.roots))if(String(value)===id)delete state.roots[name];
  const collection=items(state);collection[id]={...collection[id],enabled:false,active:false,offline:false,revoked:true,collaboration:false,reactivationMode:collection[id]?.reactivationMode||'owner',checkedAt:new Date().toISOString()};
  state.revoked=state.revoked&&typeof state.revoked==='object'?state.revoked:{};
  state.revoked[id]={revokedAt:new Date().toISOString(),type:'card'};
  write(state);
  try{const status=read(STATUS_STORE);if(status.items?.[id]){delete status.items[id];localStorage.setItem(STATUS_STORE,JSON.stringify(status));}}catch(_){}
  queueRows();window.dispatchEvent(new Event('log-shell-view-refresh'));return result;
}
async function reactivate(id){
  const m=meta(id),owner=isOwner(id);
  if(m.revoked)throw Error('Deze identifier is definitief ingetrokken.');
  if(!m.offline)throw Error('Deze identifier staat niet offline.');
  if(m.reactivationMode==='owner'&&!owner)throw Error('Alleen de oorspronkelijke deler kan deze identifier opnieuw activeren.');
  if(m.reactivationMode==='new-id')throw Error('Deze bron moet met een nieuwe identifier opnieuw worden gedeeld.');
  const headers={'X-Log-Sharing-Action':'reactivate'};
  if(owner)Object.assign(headers,ownerHeaders());
  const result=await request(baseBundle(id),headers);
  markPublished(id,result);
  window.dispatchEvent(new Event('log-shell-view-refresh'));return result;
}
async function shareAsNew(localId,oldId){
  const state=read();
  state.roots=state.roots&&typeof state.roots==='object'?state.roots:{};
  if(String(state.roots[`card:${localId}`]||'')===oldId)delete state.roots[`card:${localId}`];
  state.forkedFrom=state.forkedFrom&&typeof state.forkedFrom==='object'?state.forkedFrom:{};
  state.forkedFrom[String(localId)]=oldId;
  write(state);queueRows();
  if(!window.LogSharing?.publish)throw Error('Delen is nog niet beschikbaar.');
  await window.LogSharing.publish('card',localId,null);
  window.dispatchEvent(new Event('log-shell-view-refresh'));
  return true;
}

function updateNote(note,text){if(note)note.textContent=text;}
function recoveryOptions(selected='owner'){
  return [
    ['owner','Alleen ik · dezelfde identifier'],
    ['collaborators','Iedereen met de identifier · dezelfde identifier'],
    ['new-id','Iedereen mag opnieuw delen · nieuwe identifier']
  ].map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('');
}
function collaborationControl(id){
  const m=meta(id),section=document.createElement('div');
  section.className='log-collaboration-control';section.dataset.collaborationControl='1';
  section.innerHTML=`
    <label class="log-collaboration-row">
      <span><strong>Samenwerken aan</strong><small>Iedereen met deze identifier kan wijzigingen publiceren zolang de bron online staat.</small></span>
      <input type="checkbox" role="switch" data-collaboration-toggle ${m.collaboration?'checked':''}>
    </label>
    <label class="log-collaboration-recovery">
      <span><strong>Na offline zetten</strong><small>Wie mag de bron daarna opnieuw beschikbaar maken?</small></span>
      <select data-collaboration-mode>${recoveryOptions(m.reactivationMode||'owner')}</select>
    </label>
    <div class="log-collaboration-manage">
      <button type="button" class="btn secondary" data-collaboration-offline>Offline zetten</button>
      <button type="button" class="log-collaboration-revoke" data-collaboration-revoke>Definitief intrekken</button>
    </div>`;
  return section;
}
function augment(){
  augmentQueued=false;
  const dialog=document.querySelector('dialog.log-public-dialog[open]');
  if(!dialog||dialog.dataset.collaborationAugmented)return;
  const id=dialog.querySelector('.log-public-identifier')?.textContent?.trim();
  if(!VALID.test(id)||!isOwner(id))return;
  const info=read().published?.[id],card=localCardForConfig(id);
  if(info?.type!=='card'&&!card?.sharedSource)return;
  dialog.dataset.collaborationAugmented='1';
  const actions=dialog.querySelector('.log-public-actions'),note=dialog.querySelector('.log-public-note');
  if(!actions)return;
  const control=collaborationControl(id);actions.insertAdjacentElement('beforebegin',control);
  const toggle=control.querySelector('[data-collaboration-toggle]');
  const mode=control.querySelector('[data-collaboration-mode]');
  const offline=control.querySelector('[data-collaboration-offline]');
  const revoke=control.querySelector('[data-collaboration-revoke]');

  toggle.onchange=async()=>{
    toggle.disabled=true;
    try{
      if(toggle.checked){await enable(id);updateNote(note,'Samenwerken staat aan. Iedereen met de identifier kan wijzigingen publiceren.');}
      else{await disable(id);updateNote(note,'Samenwerken staat uit. De kaart blijft gedeeld en leesbaar.');}
      toggle.checked=meta(id).collaboration===true;
    }catch(error){toggle.checked=meta(id).collaboration===true;updateNote(note,error.message);}
    finally{toggle.disabled=false;}
  };
  mode.onchange=async()=>{
    mode.disabled=true;
    try{await setRecoveryMode(id,mode.value);updateNote(note,`Herstelrecht: ${modeLabel(mode.value)}.`);}
    catch(error){mode.value=meta(id).reactivationMode||'owner';updateNote(note,error.message);}
    finally{mode.disabled=false;}
  };
  offline.onclick=async()=>{
    if(!confirm('Kaart offline zetten? De publieke gegevens verdwijnen van internet. Lokale kopieën blijven bestaan en kunnen volgens het gekozen herstelrecht opnieuw worden gedeeld.'))return;
    offline.disabled=true;
    try{
      await offlineSharing(id);
      try{dialog.close();}catch(_){}
      dialog.remove();document.body.classList.remove('cards-dialog-open');
      setTimeout(()=>showSharedStatus('card',card?.id||info?.id||'',null),0);
    }catch(error){updateNote(note,error.message);offline.disabled=false;}
  };
  revoke.onclick=async()=>{
    if(!confirm('Identifier definitief intrekken? De huidige identifier kan daarna nooit meer opnieuw worden geactiveerd. Een nieuwe deling krijgt een nieuwe identifier.'))return;
    revoke.disabled=true;
    try{
      await revokeSharing(id);
      try{dialog.close();}catch(_){}
      dialog.remove();document.body.classList.remove('cards-dialog-open');
    }catch(error){updateNote(note,error.message);revoke.disabled=false;}
  };
  syncRemoteAccess(id).then(({state})=>{
    if(!state)return;
    toggle.checked=state.collaboration===true;
    mode.value=MODES.includes(state.reactivationMode)?state.reactivationMode:'owner';
  }).catch(()=>{});
}
function queueAugment(){if(augmentQueued)return;augmentQueued=true;requestAnimationFrame(augment);}

function sheet(title,body){
  const ui=window.LogCardsUI;
  if(!ui?.sheet)return null;
  return ui.sheet(title,body);
}
async function showSharedStatus(type,localId,surface){
  const id=identifierForItem(type,localId);
  if(!id)return false;
  let result;
  try{result=await syncRemoteAccess(id);}catch(error){
    const panel=sheet('Gedeelde kaart',`<p>${esc(error.message)}</p><button class="btn full" data-collab-close>Sluiten</button>`);
    if(panel)panel.querySelector('[data-collab-close]').onclick=()=>window.LogCardsUI.close();
    return true;
  }
  const state=result.state||meta(id),card=localCardForConfig(id),owner=isOwner(id),name=card?.name||'Gedeelde kaart';
  if(state.revoked){
    const panel=sheet(name,`
      <p class="log-collab-summary"><strong>Definitief ingetrokken</strong><span>Deze identifier kan niet opnieuw worden geactiveerd. Je lokale kopie blijft van jou.</span></p>
      <div class="log-collab-identifier">${esc(id)}</div>
      <button class="btn full" data-collab-new>Als nieuwe deling publiceren</button>
      <button class="btn secondary full" data-collab-close>Sluiten</button>
      <p role="status" data-collab-status></p>`);
    if(!panel)return false;
    panel.querySelector('[data-collab-close]').onclick=()=>window.LogCardsUI.close();
    panel.querySelector('[data-collab-new]').onclick=async event=>{
      event.currentTarget.disabled=true;const status=panel.querySelector('[data-collab-status]');
      try{window.LogCardsUI.close();await shareAsNew(card?.id||localId,id);}
      catch(error){status.textContent=error.message;event.currentTarget.disabled=false;}
    };
    return true;
  }
  if(state.offline||state.active===false){
    const mode=MODES.includes(state.reactivationMode)?state.reactivationMode:'owner';
    const sameIdAllowed=(mode==='owner'&&owner)||mode==='collaborators';
    const newIdAllowed=mode==='new-id';
    const explanation=mode==='collaborators'
      ?'Iedereen met deze identifier mag dezelfde bron opnieuw online zetten.'
      :mode==='new-id'
        ?'Iedereen met een lokale kopie mag opnieuw delen; er wordt dan een nieuwe identifier gemaakt.'
        :'Alleen de oorspronkelijke deler mag dezelfde identifier opnieuw online zetten.';
    const manage=owner?`
      <label class="log-collaboration-recovery compact">
        <span><strong>Herstelrecht</strong><small>Wie mag opnieuw delen?</small></span>
        <select data-collab-offline-mode>${recoveryOptions(mode)}</select>
      </label>`:'';
    const panel=sheet(name,`
      <p class="log-collab-summary"><strong>Offline</strong><span>De gedeelde gegevens staan niet meer publiek op internet. Lokale kopieën blijven bestaan.</span></p>
      <div class="log-collab-identifier">${esc(id)}</div>
      <p class="cards-notice">${esc(explanation)}</p>
      ${manage}
      ${sameIdAllowed?'<button class="btn full" data-collab-reactivate>Opnieuw online zetten</button>':''}
      ${newIdAllowed?'<button class="btn full" data-collab-new>Opnieuw delen met nieuwe identifier</button>':''}
      ${owner?'<button class="log-collaboration-revoke standalone" data-collab-revoke>Definitief intrekken</button>':''}
      <button class="btn secondary full" data-collab-close>Sluiten</button>
      <p role="status" data-collab-status></p>`);
    if(!panel)return false;
    panel.querySelector('[data-collab-close]').onclick=()=>window.LogCardsUI.close();
    const status=panel.querySelector('[data-collab-status]');
    const offlineMode=panel.querySelector('[data-collab-offline-mode]');
    if(offlineMode)offlineMode.onchange=async()=>{
      offlineMode.disabled=true;
      try{await setRecoveryMode(id,offlineMode.value);status.textContent=`Herstelrecht gewijzigd naar: ${modeLabel(offlineMode.value)}.`;window.LogCardsUI.close();setTimeout(()=>showSharedStatus(type,localId,surface),0);}
      catch(error){status.textContent=error.message;offlineMode.value=meta(id).reactivationMode||mode;}
      finally{offlineMode.disabled=false;}
    };
    const reactivateButton=panel.querySelector('[data-collab-reactivate]');
    if(reactivateButton)reactivateButton.onclick=async()=>{
      reactivateButton.disabled=true;
      try{await reactivate(id);status.textContent='De kaart staat weer online.';window.LogCardsUI.close();window.dispatchEvent(new Event('log-shell-view-refresh'));}
      catch(error){status.textContent=error.message;reactivateButton.disabled=false;}
    };
    const newButton=panel.querySelector('[data-collab-new]');
    if(newButton)newButton.onclick=async()=>{
      newButton.disabled=true;
      try{window.LogCardsUI.close();await shareAsNew(card?.id||localId,id);}
      catch(error){status.textContent=error.message;newButton.disabled=false;}
    };
    const revokeButton=panel.querySelector('[data-collab-revoke]');
    if(revokeButton)revokeButton.onclick=async()=>{
      if(!confirm('Identifier definitief intrekken? Deze kan daarna nooit meer opnieuw worden geactiveerd.'))return;
      revokeButton.disabled=true;
      try{await revokeSharing(id);window.LogCardsUI.close();}
      catch(error){status.textContent=error.message;revokeButton.disabled=false;}
    };
    return true;
  }

  if(state.collaboration!==true){
    const panel=sheet(name,`
      <p class="log-collab-summary"><strong>Gedeeld</strong><span>Deze kaart is online, maar samenwerken staat uit.</span></p>
      <div class="log-collab-identifier">${esc(id)}</div>
      <button class="btn secondary full" data-collab-close>Sluiten</button>`);
    if(panel)panel.querySelector('[data-collab-close]').onclick=()=>window.LogCardsUI.close();
    return true;
  }

  const panel=sheet(name,`
    <p class="log-collab-summary"><strong>Samenwerken aan</strong><span>Iedereen met deze identifier kan de lokale versie als nieuwe revisie publiceren.</span></p>
    <div class="log-collab-identifier">${esc(id)}</div>
    <p class="cards-notice">Herstelrecht: ${esc(modeLabel(state.reactivationMode||'owner'))}.</p>
    <button class="btn full" data-collab-publish>Publiceren</button>
    <button class="btn secondary full" data-collab-close>Sluiten</button>
    <p role="status" data-collab-status></p>`);
  if(!panel)return false;
  panel.querySelector('[data-collab-close]').onclick=()=>window.LogCardsUI.close();
  panel.querySelector('[data-collab-publish]').onclick=async event=>{
    event.currentTarget.disabled=true;const status=panel.querySelector('[data-collab-status]');
    try{const published=await publishCollaborative(id);status.textContent=`Gepubliceerd · revisie ${Number(published.revision)||1}.`;queueRows();}
    catch(error){status.textContent=error.message;event.currentTarget.disabled=false;}
  };
  return true;
}

function collaborationIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3.5 19c.4-3.5 2.4-5.5 5.5-5.5s5.1 2 5.5 5.5M13.5 14.5c2.9-.4 5.3 1.2 6 4.5"/></svg>';}
function decorateRows(){
  rowsQueued=false;
  document.querySelectorAll('[data-card-open]').forEach(button=>{
    if(button.closest('[data-la-row]'))return;
    const row=button.closest('.code-card-swipe')||button,id=identifierForItem('card',button.dataset.cardOpen),m=id?meta(id):{};
    let mark=[...row.children].find(node=>node?.dataset?.collaborationMark==='1');
    const show=Boolean(id&&m.active!==false&&!m.offline&&!m.revoked&&m.collaboration===true);
    if(show&&!mark){
      mark=document.createElement('span');mark.className='log-collaboration-mark';mark.dataset.collaborationMark='1';mark.innerHTML=collaborationIcon();mark.title='Samenwerken aan';row.appendChild(mark);
    }
    if(mark)mark.hidden=!show;
    row.classList.toggle('log-share-offline',Boolean(id&&m.offline));
    row.classList.toggle('log-share-revoked',Boolean(id&&m.revoked));
    const dot=[...row.children].find(node=>node?.dataset?.logShareStatusDot==='1');
    if(dot&&m.offline){dot.dataset.state='offline';dot.title='Gedeelde bron staat offline';}
    if(dot&&m.revoked){dot.dataset.state='revoked';dot.title='Identifier definitief ingetrokken';}
  });
}
function queueRows(){if(rowsQueued)return;rowsQueued=true;requestAnimationFrame(decorateRows);}

function installStyles(){
  if(document.getElementById('logCollaborationSimpleStyle'))return;
  const style=document.createElement('style');style.id='logCollaborationSimpleStyle';style.textContent=`
  .log-collaboration-control{margin:14px 0 4px;padding:12px;border:1px solid var(--line);border-radius:13px;background:var(--card)}
  .log-collaboration-row,.log-collaboration-recovery{display:flex;align-items:center;justify-content:space-between;gap:14px}
  .log-collaboration-recovery{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
  .log-collaboration-recovery.compact{margin:12px 0;padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
  .log-collaboration-row>span,.log-collaboration-recovery>span{display:grid;gap:3px;min-width:0}
  .log-collaboration-row strong,.log-collaboration-recovery strong{font-size:13px}
  .log-collaboration-row small,.log-collaboration-recovery small{color:var(--muted);font-size:11px;line-height:1.35}
  .log-collaboration-recovery select{max-width:52%;min-width:0;padding:8px 28px 8px 9px;border:1px solid var(--line);border-radius:10px;background:var(--card2);color:var(--text);font:inherit;font-size:11px}
  .log-collaboration-row input[role="switch"]{appearance:none;-webkit-appearance:none;width:50px;height:30px;flex:0 0 auto;border:0;border-radius:999px;background:rgba(120,120,128,.28);position:relative;transition:.18s}
  .log-collaboration-row input[role="switch"]:after{content:"";position:absolute;width:26px;height:26px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:.18s}
  .log-collaboration-row input[role="switch"]:checked{background:#34c759}.log-collaboration-row input[role="switch"]:checked:after{transform:translateX(20px)}
  .log-collaboration-manage{display:grid;grid-template-columns:1fr;gap:4px;margin-top:12px}
  .log-collaboration-revoke{display:block;width:100%;padding:10px;border:0;background:transparent;color:var(--bad,#ff6767);font:inherit;font-size:12px;font-weight:750;text-align:center}
  .log-collaboration-revoke.standalone{margin:8px 0}
  .log-collaboration-mark{position:absolute;left:25px;top:6px;z-index:8;width:18px;height:18px;display:grid;place-items:center;pointer-events:none;color:var(--good,#49d17d)}
  .log-collaboration-mark[hidden]{display:none!important}.log-collaboration-mark svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .log-collab-summary{display:grid;gap:4px}.log-collab-summary span{color:var(--muted);font-size:12px}
  .log-collab-identifier{margin:12px 0;padding:11px;border:1px solid var(--line);border-radius:11px;background:var(--card2);font-family:"SFMono-Regular",Consolas,monospace;font-weight:800;text-align:center;letter-spacing:.04em}
  .log-share-status-dot[data-state="offline"]{background:#8d98a6!important;animation:none!important}
  .log-share-status-dot[data-state="revoked"]{background:#65707c!important;animation:none!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--bad,#ff6767) 45%,transparent)}
  `;
  document.head.appendChild(style);
}
function patchSharingUI(){
  const ui=window.LogSharingUI;
  if(!ui||ui.__identifierCollaboration)return false;
  const originalCanShare=ui.canShare.bind(ui),originalShare=ui.shareFromSurface.bind(ui);
  ui.canShare=surface=>{
    const target=ui.resolveSurface?.(surface),identifier=target?.type==='card'?identifierForItem('card',target.id):'';
    return originalCanShare(surface)||Boolean(identifier);
  };
  ui.shareFromSurface=async surface=>{
    const target=ui.resolveSurface?.(surface),identifier=target?.type==='card'?identifierForItem('card',target.id):'';
    if(identifier){
      let remote=null;try{remote=await syncRemoteAccess(identifier);}catch(_){}
      const m=remote?.state||meta(identifier);
      if(m.offline||m.revoked||!isOwner(identifier))return showSharedStatus('card',target.id,surface);
    }
    return originalShare(surface);
  };
  ui.__identifierCollaboration=true;return true;
}
function installSharedBridge(){
  const shared=window.LogSharedConfig;
  if(!shared||shared.__identifierCollaboration)return false;
  if(typeof shared.openByIdentifier==='function'){
    const original=shared.openByIdentifier.bind(shared);
    shared.openByIdentifier=async id=>{
      const remote=await syncRemoteAccess(id);
      if(remote.state?.revoked||remote.state?.offline){
        const ui=window.LogCardsUI;
        const title=remote.state.revoked?'Identifier ingetrokken':'Gedeelde kaart offline';
        const text=remote.state.revoked?'Deze identifier is definitief ingetrokken.':'Deze gedeelde kaart staat momenteel offline.';
        if(ui?.sheet){
          const panel=ui.sheet(title,`<p>${esc(text)}</p><button class="btn full" data-collab-close>Sluiten</button>`);
          panel.querySelector('[data-collab-close]').onclick=()=>ui.close();return panel;
        }
        throw Error(text);
      }
      return original(id);
    };
  }
  if(typeof shared.fetchPayload==='function'){
    const originalFetch=shared.fetchPayload.bind(shared);
    shared.fetchPayload=async id=>{
      const remote=await syncRemoteAccess(id);
      if(remote.state?.revoked)throw Error('Deze identifier is definitief ingetrokken.');
      if(remote.state?.offline)throw Error('Deze gedeelde kaart staat offline.');
      return originalFetch(id);
    };
  }
  shared.__identifierCollaboration=true;return true;
}
async function refreshKnownStates(){
  const state=read(),ids=new Set(Object.keys(state.collaboration||{}));
  for(const id of Object.keys(state.published||{}))if(VALID.test(id))ids.add(id);
  const list=[...ids].filter(id=>VALID.test(id)).slice(0,25);
  await Promise.allSettled(list.map(id=>syncRemoteAccess(id)));
  queueRows();
}
function install(){
  window.LOG_TEST_BUILD=window.LOG_TEST_BUILD||'0.35.1-test.11';
  installStyles();queueRows();queueAugment();
  new MutationObserver(()=>{queueAugment();queueRows();patchSharingUI();installSharedBridge();}).observe(document.documentElement,{childList:true,subtree:true});
  ['log-km-state-change','log-time-state-change','log-shell-view-refresh','log-shared-card-update-state','log-shared-config-update-state'].forEach(name=>window.addEventListener(name,queueRows));
  window.addEventListener('pageshow',()=>{queueRows();patchSharingUI();installSharedBridge();refreshKnownStates();});
  const timer=setInterval(()=>{const done=patchSharingUI()&&installSharedBridge();if(done)clearInterval(timer);},100);
  setTimeout(()=>clearInterval(timer),15000);
  setTimeout(refreshKnownStates,500);
  window.LogCollaboration={
    canEdit,isOwner,identifierForItem,canEditItem,enable,disable,setRecoveryMode,
    publishCollaborative,offlineSharing,revokeSharing,reactivate,shareAsNew,
    syncRemoteAccess,showSharedStatus
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();