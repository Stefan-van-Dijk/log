(function(){
  'use strict';
  const KM='kmreg-test-v4-data',TIME='urenregistratie.test.pwa.v1';
  const UPDATE_STORE='log-test-shared-card-updates-v1';
  const PUBLIC_BASE='https://sharon.life/log/config/';
  const AUTO_INTERVAL=15*60*1000;
  const MODES=new Set(['auto','manual','off']);
  let observer=null,augmentQueued=false,autoTimer=null,checking=false;

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=key=>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}};
  const list=(data,key)=>Array.isArray(data[key])?data[key]:[];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label} ontbreekt of is ongeldig.`);return value;};
  const nowIso=()=>new Date().toISOString();
  const localId=(configurationId,type,sourceId)=>`shared:${configurationId}:${type}:${sourceId}`;

  function readUpdateState(){
    const raw=read(UPDATE_STORE);
    return {
      mode:MODES.has(raw.mode)?raw.mode:'auto',
      configurations:raw.configurations&&typeof raw.configurations==='object'?raw.configurations:{}
    };
  }
  function saveUpdateState(value){try{localStorage.setItem(UPDATE_STORE,JSON.stringify(value));}catch(_) {}}
  function updateMode(){return readUpdateState().mode;}
  function setUpdateMode(mode){
    const state=readUpdateState();state.mode=MODES.has(mode)?mode:'auto';saveUpdateState(state);notifyUpdateState();
    if(state.mode==='auto')scheduleAutoCheck(60);
  }
  function configurationMeta(id,state=readUpdateState()){
    return state.configurations[id]&&typeof state.configurations[id]==='object'?state.configurations[id]:{};
  }
  function saveConfigurationMeta(id,patch){
    const state=readUpdateState();
    state.configurations[id]={...configurationMeta(id,state),...patch};
    saveUpdateState(state);
    return state.configurations[id];
  }

  function validate(doc,id){
    if(doc.id!==id||!/^[A-Za-z0-9_-]{12}$/.test(id))throw Error('De configuratie hoort niet bij deze identifier.');
    if(doc.schema!=='https://sharon.life/log/config/v1')throw Error('Deze configuratieversie wordt niet ondersteund.');
    if(doc.root?.type!=='card')throw Error('Kaart ophalen ondersteunt hier alleen gedeelde kaarten.');
    const objects={};
    for(const key of ['locations','themes','subthemes','cards','actions']){
      if(!Array.isArray(doc.objects?.[key])||doc.objects[key].length>100)throw Error('Ongeldige kaartconfiguratie.');
      const ids=new Set();objects[key]=doc.objects[key];
      for(const item of objects[key]){text(item?.id,200,'Object-ID');if(ids.has(item.id))throw Error('Dubbele object-ID in kaartconfiguratie.');ids.add(item.id);}
    }
    const card=objects.cards.find(c=>c.id===doc.root.sourceId);
    if(!card)throw Error('De gedeelde kaart ontbreekt.');
    text(card.name,80,'Kaarttitel');text(card.value,2000,'Kaartinhoud');
    if(!['QR_CODE','CODE128','EAN13','EAN8','UPC','UPCE','CODE39','ITF','codabar'].includes(card.format))throw Error('Onbekend codetype.');
    window.LogCardsUI.validate(card);
    const locations=[],seen=new Set(),visiting=new Set();
    function location(sourceId){
      if(!sourceId||seen.has(sourceId))return;
      if(visiting.has(sourceId))throw Error('Cirkel in locatiekoppelingen.');
      const item=objects.locations.find(x=>x.id===sourceId);if(!item)throw Error('Een gekoppelde locatie ontbreekt.');
      text(item.name,200,'Locatienaam');visiting.add(sourceId);location(item.parentId);visiting.delete(sourceId);seen.add(sourceId);
      const next={id:item.id,name:item.name,address:typeof item.address==='string'?item.address.slice(0,500):'',parentId:item.parentId||null};
      for(const key of ['lat','lng']){const v=item[key];if(v!=null&&v!==''){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>(key==='lat'?90:180))throw Error('Ongeldige locatiecoördinaten.');next[key]=v;}}
      for(const key of ['radius','recognitionRadius'])if(item[key]!=null){if(!Number.isFinite(item[key])||item[key]<=0||item[key]>100000)throw Error('Ongeldige locatiestraal.');next[key]=item[key];}
      if(typeof item.type==='string')next.type=item.type.slice(0,40);locations.push(next);
    }
    location(card.locationId);
    let theme=null,subtheme=null,scanAction=null;
    if(card.scanAction?.type){
      const scan=card.scanAction;
      if(scan.type==='location'){if(!card.locationId)throw Error('Locatieactie mist een locatie.');scanAction={type:'location'};}
      else if(scan.type==='task'){
        const t=objects.themes.find(x=>x.id===scan.themeId);if(!t)throw Error('Het gekoppelde thema ontbreekt.');
        theme={id:t.id,name:text(t.name,200,'Themanaam'),color:/^#[0-9a-f]{6}$/i.test(t.color||'')?t.color:'#489ff8',includeInTotals:t.includeInTotals!==false};
        if(Number.isFinite(Number(t.order)))theme.order=Number(t.order);
        if(scan.subthemeId){const sub=objects.subthemes.find(x=>x.id===scan.subthemeId);if(!sub||sub.themeId!==t.id)throw Error('Het gekoppelde subthema ontbreekt of hoort bij een ander thema.');subtheme={id:sub.id,themeId:t.id,name:text(sub.name,200,'Subthemanaam')};if(Number.isFinite(Number(sub.order)))subtheme.order=Number(sub.order);}
        scanAction={type:'task',themeId:t.id,subthemeId:subtheme?.id||null};
      }else throw Error('Onbekende kaartactie.');
    }
    return {
      kind:'shared-card',id,
      exportedAt:typeof doc.exportedAt==='string'?doc.exportedAt:'',
      sourceBuild:String(doc.source?.build||''),
      card:{id:card.id,name:card.name,format:card.format,value:card.value,color:/^#[0-9a-f]{6}$/i.test(card.color||'')?card.color:'#489ff8',locationId:card.locationId||null,scanAction},
      locations,theme,subtheme
    };
  }

  function stored(id,km=read(KM)){
    return list(km,'cards').find(card=>Array.isArray(card.sharedConfigurationIds)&&card.sharedConfigurationIds.includes(id));
  }
  function sharedObject(items,configurationId,type,sourceId){
    return items.find(item=>item?.sharedSource?.configurationId===configurationId&&String(item.sharedSource.sourceId)===String(sourceId))
      ||items.find(item=>item?.id===localId(configurationId,type,sourceId));
  }
  function sourceIdForLocal(items,localObjectIdValue,configurationId){
    if(!localObjectIdValue)return null;
    const item=items.find(entry=>String(entry.id)===String(localObjectIdValue));
    return item?.sharedSource?.configurationId===configurationId?String(item.sharedSource.sourceId):null;
  }
  function comparableLocation(item,parentSourceId=null){
    const clean={name:String(item?.name||''),address:String(item?.address||''),parentId:parentSourceId||null,type:String(item?.type||'')};
    for(const key of ['lat','lng','radius','recognitionRadius'])clean[key]=item?.[key]==null||item[key]===''?null:Number(item[key]);
    return clean;
  }
  function comparableTheme(item){return {name:String(item?.name||''),color:/^#[0-9a-f]{6}$/i.test(item?.color||'')?item.color:'#489ff8',includeInTotals:item?.includeInTotals!==false,order:Number.isFinite(Number(item?.order))?Number(item.order):null};}
  function comparableSubtheme(item,themeSourceId=null){return {name:String(item?.name||''),themeId:themeSourceId||null,order:Number.isFinite(Number(item?.order))?Number(item.order):null};}
  function payloadSignature(payload){
    return JSON.stringify({card:payload.card,locations:payload.locations,theme:payload.theme,subtheme:payload.subtheme});
  }
  function localMatches(payload){
    const km=read(KM),time=read(TIME),card=stored(payload.id,km);if(!card)return false;
    const localLocationSource=sourceIdForLocal(list(km,'locations'),card.locationId,payload.id);
    let localScan=null;
    if(card.scanAction?.type==='location')localScan={type:'location'};
    else if(card.scanAction?.type==='task')localScan={type:'task',themeId:sourceIdForLocal(list(time,'themes'),card.scanAction.themeId,payload.id),subthemeId:sourceIdForLocal(list(time,'subthemes'),card.scanAction.subthemeId,payload.id)};
    const localCard={name:String(card.name||''),format:card.format,value:String(card.value||''),color:/^#[0-9a-f]{6}$/i.test(card.color||'')?card.color:'#489ff8',locationId:localLocationSource,scanAction:localScan};
    const remoteCard={name:payload.card.name,format:payload.card.format,value:payload.card.value,color:payload.card.color,locationId:payload.card.locationId||null,scanAction:payload.card.scanAction||null};
    if(JSON.stringify(localCard)!==JSON.stringify(remoteCard))return false;
    for(const source of payload.locations){
      const local=sharedObject(list(km,'locations'),payload.id,'location',source.id);if(!local)return false;
      const parentSource=sourceIdForLocal(list(km,'locations'),local.parentId,payload.id);
      if(JSON.stringify(comparableLocation(local,parentSource))!==JSON.stringify(comparableLocation(source,source.parentId||null)))return false;
    }
    if(payload.theme){
      const local=sharedObject(list(time,'themes'),payload.id,'theme',payload.theme.id);if(!local||JSON.stringify(comparableTheme(local))!==JSON.stringify(comparableTheme(payload.theme)))return false;
    }
    if(payload.subtheme){
      const local=sharedObject(list(time,'subthemes'),payload.id,'subtheme',payload.subtheme.id);if(!local)return false;
      const themeSource=sourceIdForLocal(list(time,'themes'),local.themeId,payload.id);
      if(JSON.stringify(comparableSubtheme(local,themeSource))!==JSON.stringify(comparableSubtheme(payload.subtheme,payload.subtheme.themeId)))return false;
    }
    return true;
  }

  function markApplied(payload){
    saveConfigurationMeta(payload.id,{appliedSignature:payloadSignature(payload),appliedExportedAt:payload.exportedAt||'',availableSignature:'',availableExportedAt:'',checkedAt:Date.now(),lastError:''});
    notifyUpdateState();
  }
  function evaluatePayload(payload){
    const state=readUpdateState(),meta=configurationMeta(payload.id,state),signature=payloadSignature(payload);
    const changed=meta.appliedSignature?meta.appliedSignature!==signature:!localMatches(payload);
    if(changed){
      state.configurations[payload.id]={...meta,availableSignature:signature,availableExportedAt:payload.exportedAt||'',checkedAt:Date.now(),lastError:''};
    }else{
      state.configurations[payload.id]={...meta,appliedSignature:signature,appliedExportedAt:payload.exportedAt||meta.appliedExportedAt||'',availableSignature:'',availableExportedAt:'',checkedAt:Date.now(),lastError:''};
    }
    saveUpdateState(state);notifyUpdateState();return changed;
  }
  function availableConfigurationIds(card){
    if(updateMode()==='off'||!card)return[];
    const ids=Array.isArray(card.sharedConfigurationIds)?card.sharedConfigurationIds:[],state=readUpdateState();
    return ids.filter(id=>{const meta=configurationMeta(id,state);return !!meta.availableSignature&&meta.availableSignature!==meta.appliedSignature;});
  }
  function updateAvailable(cardOrId){
    const km=read(KM),card=typeof cardOrId==='string'?list(km,'cards').find(item=>item.id===cardOrId):cardOrId;
    return availableConfigurationIds(card).length>0;
  }

  function addInitial(store,key,type,source,fields,configurationId){
    const id=localId(configurationId,type,source.id),items=list(store,key),found=items.find(x=>x.id===id);
    if(found){if(found.sharedSource?.configurationId!==configurationId||String(found.sharedSource?.sourceId)!==String(source.id))throw Error('Een lokale identifier is al in gebruik.');return id;}
    items.push({...fields,id,sharedSource:{configurationId,sourceId:source.id}});store[key]=items;return id;
  }
  function upsertShared(store,key,type,source,fields,configurationId){
    const items=list(store,key),found=sharedObject(items,configurationId,type,source.id);
    const sharedSource={configurationId,sourceId:source.id};
    if(found){const id=found.id;Object.assign(found,{...fields,id,sharedSource});return id;}
    const id=localId(configurationId,type,source.id);items.push({...fields,id,sharedSource});store[key]=items;return id;
  }
  function plan(payload){
    const km=clone(read(KM)),time=clone(read(TIME)),existing=stored(payload.id,km);
    if(existing)return {km,time,card:existing,existing:true,timeChanged:false};
    let timeChanged=false;
    const mapped=new Map();
    for(const location of payload.locations)mapped.set(location.id,addInitial(km,'locations','location',location,{...location,parentId:location.parentId?mapped.get(location.parentId):null},payload.id));
    let scanAction=payload.card.scanAction;
    if(payload.theme){const themeId=addInitial(time,'themes','theme',payload.theme,payload.theme,payload.id);const subthemeId=payload.subtheme?addInitial(time,'subthemes','subtheme',payload.subtheme,{...payload.subtheme,themeId},payload.id):null;scanAction={type:'task',themeId,subthemeId};timeChanged=true;}
    const card={...payload.card,locationId:mapped.get(payload.card.locationId)||null,scanAction};
    const duplicate=list(km,'cards').find(c=>c.format===card.format&&c.value===card.value&&(c.locationId||null)===card.locationId);
    const cardId=duplicate?.id||addInitial(km,'cards','card',payload.card,{...card,createdAt:nowIso(),updatedAt:nowIso()},payload.id);
    const saved=list(km,'cards').find(c=>c.id===cardId);
    saved.sharedConfigurationIds=[...new Set([...(Array.isArray(saved.sharedConfigurationIds)?saved.sharedConfigurationIds:[]),payload.id])];
    return {km,time,card:saved,existing:false,timeChanged};
  }
  function planUpdate(payload){
    const km=clone(read(KM)),time=clone(read(TIME)),card=stored(payload.id,km);if(!card)throw Error('Deze gedeelde kaart staat niet meer in Log.');
    const mapped=new Map();
    for(const location of payload.locations)mapped.set(location.id,upsertShared(km,'locations','location',location,{...location,parentId:location.parentId?mapped.get(location.parentId):null},payload.id));
    let scanAction=payload.card.scanAction,timeChanged=false;
    if(payload.theme){const themeId=upsertShared(time,'themes','theme',payload.theme,payload.theme,payload.id);const subthemeId=payload.subtheme?upsertShared(time,'subthemes','subtheme',payload.subtheme,{...payload.subtheme,themeId},payload.id):null;scanAction={type:'task',themeId,subthemeId};timeChanged=true;}
    const preserved={id:card.id,createdAt:card.createdAt||nowIso(),sharedConfigurationIds:[...new Set([...(Array.isArray(card.sharedConfigurationIds)?card.sharedConfigurationIds:[]),payload.id])]};
    Object.assign(card,{...payload.card,locationId:mapped.get(payload.card.locationId)||null,scanAction,updatedAt:nowIso(),...preserved});
    return {km,time,card,existing:true,timeChanged};
  }
  function writeResult(result,payload){
    const beforeKm=localStorage.getItem(KM),beforeTime=localStorage.getItem(TIME);
    try{
      if(result.timeChanged)localStorage.setItem(TIME,JSON.stringify(result.time));
      localStorage.setItem(KM,JSON.stringify(result.km));
    }catch(error){
      if(beforeKm===null)localStorage.removeItem(KM);else localStorage.setItem(KM,beforeKm);
      if(beforeTime===null)localStorage.removeItem(TIME);else localStorage.setItem(TIME,beforeTime);
      throw Error('Opslaan is niet gelukt. Controleer de beschikbare opslag en probeer opnieuw.');
    }
    markApplied(payload);
    window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{key:KM,source:'shared-card-import'}}));
    if(result.timeChanged){window.LogTimeModule?.reloadFromStorage?.({view:window.LogTimeModule.getView?.()||'home'});window.dispatchEvent(new Event('log-time-state-change'));}
    window.dispatchEvent(new Event('log-shell-view-refresh'));
    return result.card;
  }
  function commit(payload,options={}){
    const current=stored(payload.id);
    if(current&&!options.update){markApplied(payload);return current;}
    return writeResult(current?planUpdate(payload):plan(payload),payload);
  }

  function sourceDate(payload){
    const date=payload.exportedAt?new Date(payload.exportedAt):null;
    return date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date):'';
  }
  function preview(payload){
    const existing=stored(payload.id),changed=existing?evaluatePayload(payload):false;
    const displayCard=changed||!existing?payload.card:existing;
    const date=sourceDate(payload);
    const intro=!existing?'Controleer de kaart en voeg deze daarna toe. Een gekoppelde taak of actie start niet automatisch.':changed?`Er is een nieuwere versie van deze kaart beschikbaar${date?` · bron ${esc(date)}`:''}.`:'Deze kaart is actueel. Lokale aanpassingen blijven behouden.';
    const primary=!existing?'Kaart toevoegen':changed?'Kaart bijwerken':'Kaart openen';
    const panel=window.LogCardsUI.sheet(!existing?'Gedeelde kaart ophalen':changed?'Kaartupdate beschikbaar':'Gedeelde kaart',`<h3>${esc(displayCard.name)}</h3><div class="code-surface" data-shared-preview></div><p>${payload.locations.length} gekoppelde locatie(s)${payload.theme?' · thema'+(payload.subtheme?' en subthema':''):''}</p><p>${intro}</p>${changed?'<p class="hint">Bijwerken vervangt alleen de gegevens die bij deze gedeelde kaart horen. Ritten, timers en overige lokale gegevens blijven staan.</p>':''}<button class="btn full" data-shared-import>${primary}</button>${changed?'<button class="btn secondary full" data-shared-open-current>Huidige kaart openen</button>':''}<button class="btn secondary full" data-shared-cancel>Annuleren</button><p role="status" data-shared-status></p>`);
    window.LogCardsUI.renderCode(panel.querySelector('[data-shared-preview]'),displayCard);
    panel.querySelector('[data-shared-cancel]').onclick=()=>window.LogCardsUI.close();
    panel.querySelector('[data-shared-open-current]')?.addEventListener('click',()=>window.LogCardsModule.show(existing.id));
    panel.querySelector('[data-shared-import]').onclick=()=>{try{const saved=!existing?commit(payload):changed?commit(payload,{update:true}):existing;window.LogCardsModule.show(saved.id);}catch(error){panel.querySelector('[data-shared-status]').textContent=error.message;}};
  }

  async function fetchPayload(id){
    if(!/^[A-Za-z0-9_-]{12}$/.test(id))throw Error('Ongeldige gedeelde kaartcode.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(`${PUBLIC_BASE}${id}.json`,{cache:'no-store',credentials:'omit',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});
      if(response.status===404)throw Error('De gedeelde kaart is niet gevonden.');
      if(!response.ok)throw Error(`De bron kon niet worden gecontroleerd (${response.status}).`);
      return validate(await response.json(),id);
    }catch(error){if(error?.name==='AbortError')throw Error('De bron reageerde niet op tijd. Probeer later opnieuw.');throw error;}
    finally{clearTimeout(timer);}
  }
  async function openUpdateForCard(cardId){
    const card=list(read(KM),'cards').find(item=>item.id===cardId);if(!card)return;
    const ids=availableConfigurationIds(card),id=ids[0]||(Array.isArray(card.sharedConfigurationIds)?card.sharedConfigurationIds[0]:'');if(!id)return;
    const panel=window.LogCardsUI.sheet('Kaart controleren','<p>De nieuwste versie wordt opgehaald…</p><p role="status" data-shared-status></p>');
    try{const payload=await fetchPayload(id);if(!document.body.contains(panel))return;preview(payload);}catch(error){const status=panel.querySelector('[data-shared-status]');if(status)status.textContent=error.message||'Controleren is niet gelukt.';}
  }
  function sharedConfigurationIds(){
    const ids=new Set();for(const card of list(read(KM),'cards'))for(const id of Array.isArray(card.sharedConfigurationIds)?card.sharedConfigurationIds:[])if(/^[A-Za-z0-9_-]{12}$/.test(id))ids.add(id);return[...ids];
  }
  function pendingCount(){
    if(updateMode()==='off')return 0;
    const state=readUpdateState();return sharedConfigurationIds().filter(id=>{const meta=configurationMeta(id,state);return meta.availableSignature&&meta.availableSignature!==meta.appliedSignature;}).length;
  }
  async function checkAll(options={}){
    const manual=options.manual===true,force=options.force===true,mode=updateMode();
    const ids=sharedConfigurationIds();
    if((mode==='off'&&!manual)||(mode==='manual'&&!manual))return {checked:0,updates:pendingCount(),errors:0,skipped:true};
    if(!ids.length)return {checked:0,updates:0,errors:0};
    if(checking)return {checked:0,updates:pendingCount(),errors:0,busy:true};
    checking=true;let checked=0,errors=0;
    try{
      for(const id of ids){
        const meta=configurationMeta(id),due=force||manual||!meta.checkedAt||Date.now()-Number(meta.checkedAt)>AUTO_INTERVAL;if(!due)continue;
        try{const payload=await fetchPayload(id);evaluatePayload(payload);checked++;}
        catch(error){errors++;saveConfigurationMeta(id,{checkedAt:Date.now(),lastError:error.message||'Controleren mislukt.'});notifyUpdateState();}
      }
      return {checked,updates:pendingCount(),errors};
    }finally{checking=false;syncSettingsPanel();decorateCards();}
  }

  function manualForm(){
    return `<form><div class="form-group"><label for="sharedCardIdentifier">Code of gedeelde link</label><input id="sharedCardIdentifier" name="identifier" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Plak de code van 12 tekens"></div><button type="submit" class="btn full">Code openen</button><p role="status" data-shared-error></p></form>`;
  }
  function bindManual(panel){
    panel.querySelector('form').onsubmit=event=>{
      event.preventDefault();let id=panel.querySelector('input').value.trim();
      try{if(id.startsWith('https://')){const url=new URL(id);if(url.origin!=='https://sharon.life'||url.search||url.hash)throw Error();const match=url.pathname.match(/^\/log\/config\/([A-Za-z0-9_-]{12})\.json$/);if(!match)throw Error();id=match[1];}if(!/^[A-Za-z0-9_-]{12}$/.test(id))throw Error();window.LogCode.preview({kind:'log-action',version:1,id});}
      catch(_){panel.querySelector('[data-shared-error]').textContent='Gebruik een code van 12 tekens of een geldige gedeelde link.';}
    };
  }

  function settingsStatus(){
    const ids=sharedConfigurationIds(),state=readUpdateState(),updates=pendingCount();
    if(!ids.length)return 'Nog geen gedeelde kaarten opgeslagen.';
    if(state.mode==='off')return 'Controleren op bronupdates staat uit.';
    const checked=ids.map(id=>Number(configurationMeta(id,state).checkedAt)||0).filter(Boolean).sort((a,b)=>b-a)[0]||0;
    const when=checked?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(checked)):'nog niet gecontroleerd';
    return `${updates?`${updates} ${updates===1?'update':'updates'} beschikbaar · `:''}Laatste controle: ${when}.`;
  }
  function ensureSettingsPanel(){
    const content=document.querySelector('#kmShellSettingsContent');if(!content||content.dataset.mode!=='general')return;
    let panel=content.querySelector('#kmShellSharedCardSettings');
    if(!panel){
      const group=content.querySelector('#kmShellRegistrationSettingsTitle')?.closest('.km-shell-settings-group');if(!group)return;
      panel=document.createElement('details');panel.className='km-shell-settings-accordion';panel.id='kmShellSharedCardSettings';panel.dataset.settingsTarget='barcodes';
      panel.innerHTML=`<summary><span class="km-shell-settings-accordion-title"><strong>Kaarten</strong><small>Updates van gedeelde kaarten</small></span><span class="km-shell-settings-accordion-arrow">›</span></summary><div class="km-shell-settings-accordion-body"><div class="form-group"><label for="kmSharedCardUpdateMode">Controleren op updates</label><select id="kmSharedCardUpdateMode" data-shared-update-mode><option value="auto">Automatisch controleren (standaard)</option><option value="manual">Alleen handmatig controleren</option><option value="off">Niet controleren</option></select><p class="hint">Automatisch controleren gebeurt alleen wanneer Log open is. Een wijziging wordt nooit zonder jouw keuze overgenomen.</p></div><button type="button" class="btn secondary full" data-shared-check-now>Nu controleren</button><p class="hint" data-shared-update-status></p></div>`;
      group.appendChild(panel);
      panel.querySelector('[data-shared-update-mode]').onchange=event=>setUpdateMode(event.target.value);
      panel.querySelector('[data-shared-check-now]').onclick=async event=>{const button=event.currentTarget,old=button.textContent;button.disabled=true;button.textContent='Controleren…';const status=panel.querySelector('[data-shared-update-status]');try{const result=await checkAll({manual:true,force:true});status.textContent=result.errors?`${result.updates} update(s) gevonden. ${result.errors} bron(nen) konden niet worden gecontroleerd.`:result.updates?`${result.updates} ${result.updates===1?'update':'updates'} beschikbaar.`:'Alles is actueel.';}finally{button.disabled=false;button.textContent=old;syncSettingsPanel();}};
    }
    panel.hidden=window.LogModuleVisibility?.enabled?window.LogModuleVisibility.enabled('barcodes')===false:false;
    panel.style.display=panel.hidden?'none':'';
    syncSettingsPanel();
  }
  function syncSettingsPanel(){
    const panel=document.querySelector('#kmShellSharedCardSettings');if(!panel)return;const mode=updateMode(),select=panel.querySelector('[data-shared-update-mode]'),button=panel.querySelector('[data-shared-check-now]'),status=panel.querySelector('[data-shared-update-status]');
    if(select&&select.value!==mode)select.value=mode;if(button)button.hidden=mode==='off';if(status)status.textContent=settingsStatus();
  }
  function decorateCards(){
    document.querySelectorAll('.code-card-swipe').forEach(row=>{
      const id=row.querySelector('[data-card-open]')?.dataset.cardOpen,copy=row.querySelector('.code-card-copy');if(!id||!copy)return;
      let badge=copy.querySelector('[data-shared-update-badge]'),show=updateAvailable(id);
      if(show&&!badge){badge=document.createElement('span');badge.dataset.sharedUpdateBadge='1';badge.className='log-shared-update-badge';badge.textContent='Update beschikbaar';copy.appendChild(badge);}
      if(badge)badge.hidden=!show;
    });
  }
  function installStyles(){
    if(document.querySelector('#logSharedCardUpdateStyle'))return;const style=document.createElement('style');style.id='logSharedCardUpdateStyle';style.textContent=`.log-shared-update-badge{display:inline-flex!important;width:max-content;margin-top:4px;padding:3px 7px;border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));border-radius:999px;background:color-mix(in srgb,var(--warn) 10%,transparent);color:var(--warn)!important;font-size:9px!important;font-weight:800!important;line-height:1.2}.log-shared-update-badge[hidden]{display:none!important}`;document.head.appendChild(style);
  }
  function queueAugment(){if(augmentQueued)return;augmentQueued=true;requestAnimationFrame(()=>{augmentQueued=false;ensureSettingsPanel();decorateCards();});}
  function notifyUpdateState(){window.dispatchEvent(new CustomEvent('log-shared-card-update-state',{detail:{mode:updateMode(),updates:pendingCount()}}));queueAugment();}
  function scheduleAutoCheck(delay=700){clearTimeout(autoTimer);if(updateMode()!=='auto')return;autoTimer=setTimeout(()=>checkAll().catch(()=>{}),delay);}

  function init(){
    window.LOG_TEST_BUILD='0.35.1-test.3';installStyles();queueAugment();observer=new MutationObserver(queueAugment);observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',event=>{const button=event.target.closest?.('[data-card-open]');if(!button||!updateAvailable(button.dataset.cardOpen))return;event.preventDefault();event.stopImmediatePropagation();openUpdateForCard(button.dataset.cardOpen);},true);
    window.addEventListener('log-km-state-change',queueAugment);window.addEventListener('log-shell-view-refresh',event=>{queueAugment();if(event.detail?.section==='barcodes')scheduleAutoCheck(150);});
    window.addEventListener('pageshow',()=>scheduleAutoCheck(350));document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleAutoCheck(350);});
    scheduleAutoCheck(900);
  }

  window.LogSharedCard={validate,plan,commit,preview,manualForm,bindManual,stored,checkAll,updateAvailable,openUpdateForCard,updateMode,setUpdateMode};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
