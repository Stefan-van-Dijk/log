(function(){
  'use strict';

  const KM='kmreg-test-v4-data';
  const TIME='urenregistratie.test.pwa.v1';
  const UPDATE_STORE='log-test-shared-config-updates-v2';
  const LEGACY_UPDATE_STORE='log-test-shared-card-updates-v1';
  const SHARING_STORE='log-test-sharing-v1';
  const PUBLIC_BASE='https://sharon.life/log/config/';
  const AUTO_INTERVAL=15*60*1000;
  const MODES=new Set(['auto','manual','off']);
  const ROOT_TYPES=new Set(['location','card','theme','action']);
  const TYPE_LABEL={location:'Locatie',card:'Kaart',theme:'Thema',action:'Actie'};
  const SECTION_FOR={location:'locations',card:'barcodes',theme:'themes',action:'locationactions'};
  let observer=null,augmentQueued=false,autoTimer=null,checking=false;

  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const read=key=>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}};
  const list=(data,key)=>Array.isArray(data?.[key])?data[key]:[];
  const nowIso=()=>new Date().toISOString();
  const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label} ontbreekt of is ongeldig.`);return value.trim();};
  const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{12}$/.test(value);
  const depId=(configurationId,type,sourceId)=>`shared:${configurationId}:${type}:${sourceId}`;
  const isRootSource=(payload,type,sourceId)=>payload.rootType===type&&String(payload.rootSourceId)===String(sourceId);
  const localIdFor=(payload,type,sourceId)=>isRootSource(payload,type,sourceId)?payload.id:depId(payload.id,type,sourceId);

  function readUpdateState(){
    let raw=read(UPDATE_STORE);
    if(!Object.keys(raw).length){
      const legacy=read(LEGACY_UPDATE_STORE);
      if(Object.keys(legacy).length){
        raw={mode:legacy.mode,configurations:legacy.configurations||{}};
        try{localStorage.setItem(UPDATE_STORE,JSON.stringify(raw));}catch(_){}
      }
    }
    return {
      mode:MODES.has(raw.mode)?raw.mode:'auto',
      configurations:raw.configurations&&typeof raw.configurations==='object'?raw.configurations:{}
    };
  }
  function saveUpdateState(value){try{localStorage.setItem(UPDATE_STORE,JSON.stringify(value));}catch(_){}}
  function updateMode(){return readUpdateState().mode;}
  function setUpdateMode(mode){
    const state=readUpdateState();
    state.mode=MODES.has(mode)?mode:'auto';
    saveUpdateState(state);
    notifyUpdateState();
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

  function cleanLocation(source){
    const item={
      id:text(source?.id,200,'Object-ID'),
      name:text(source?.name,200,'Locatienaam'),
      address:typeof source.address==='string'?source.address.slice(0,500):'',
      parentId:source.parentId?String(source.parentId):null
    };
    for(const key of ['lat','lng']){
      const value=source[key];
      if(value!=null&&value!==''){
        if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>(key==='lat'?90:180))throw Error('Ongeldige locatiecoördinaten.');
        item[key]=value;
      }
    }
    for(const key of ['radius','recognitionRadius']){
      const value=source[key];
      if(value!=null){
        if(!Number.isFinite(Number(value))||Number(value)<=0||Number(value)>100000)throw Error('Ongeldige locatiestraal.');
        item[key]=Number(value);
      }
    }
    if(typeof source.type==='string')item.type=source.type.slice(0,40);
    return item;
  }
  function cleanTheme(source){
    const item={
      id:text(source?.id,200,'Object-ID'),
      name:text(source?.name,200,'Themanaam'),
      color:/^#[0-9a-f]{6}$/i.test(source?.color||'')?source.color:'#489ff8',
      includeInTotals:source?.includeInTotals!==false
    };
    if(Number.isFinite(Number(source?.order)))item.order=Number(source.order);
    return item;
  }
  function cleanSubtheme(source){
    const item={
      id:text(source?.id,200,'Object-ID'),
      themeId:text(source?.themeId,200,'Thema-ID'),
      name:text(source?.name,200,'Subthemanaam')
    };
    if(Number.isFinite(Number(source?.order)))item.order=Number(source.order);
    return item;
  }
  function cleanCard(source){
    const item={
      id:text(source?.id,200,'Object-ID'),
      name:text(source?.name,80,'Kaarttitel'),
      format:String(source?.format||''),
      value:text(source?.value,2000,'Kaartinhoud'),
      color:/^#[0-9a-f]{6}$/i.test(source?.color||'')?source.color:'#489ff8',
      locationId:source?.locationId?String(source.locationId):null,
      scanAction:null
    };
    if(source?.scanAction?.type){
      const action=source.scanAction;
      if(action.type==='location')item.scanAction={type:'location'};
      else if(action.type==='task')item.scanAction={type:'task',themeId:String(action.themeId||''),subthemeId:action.subthemeId?String(action.subthemeId):null};
      else throw Error('Onbekende kaartactie.');
    }
    if(typeof source?.createdAt==='string')item.createdAt=source.createdAt;
    if(typeof source?.updatedAt==='string')item.updatedAt=source.updatedAt;
    window.LogCardsUI?.validate?.(item);
    return item;
  }
  function cleanAction(source){
    const item={
      id:text(source?.id,200,'Object-ID'),
      name:text(source?.name,120,'Actienaam'),
      enabled:source?.enabled!==false,
      trigger:source?.trigger==='qr'?'qr':'location',
      type:String(source?.type||''),
      selection:source?.selection==='smart'?'smart':'fixed',
      days:Array.isArray(source?.days)?source.days.slice():[],
      start:typeof source?.start==='string'?source.start:'',
      end:typeof source?.end==='string'?source.end:''
    };
    if(!['ride','task','card'].includes(item.type))throw Error('Onbekend actietype.');
    if(item.trigger==='qr'){
      item.logCodeId=String(source?.logCodeId||'');
      if(!validId(item.logCodeId))throw Error('Ongeldige QR-identifier in actie.');
      item.repeatMode='scan';
    }else{
      item.locationId=source?.locationId?String(source.locationId):null;
      const radius=Number(source?.radius);
      item.radius=Number.isFinite(radius)&&radius>=25&&radius<=5000?radius:500;
      item.repeatMode=['visit','halfHour','duration','location','day'].includes(source?.repeatMode)?source.repeatMode:'visit';
      if(item.repeatMode==='duration'){
        const minutes=Number(source?.repeatMinutes);
        if(!Number.isInteger(minutes)||minutes<1||minutes>525600)throw Error('Ongeldige wachttijd in actie.');
        item.repeatMinutes=minutes;
      }
    }
    if(item.selection!=='smart'||item.type==='card')item.targetId=source?.targetId?String(source.targetId):null;
    if(item.type==='task'&&source?.subthemeId)item.subthemeId=String(source.subthemeId);
    if(item.days.some(day=>!Number.isInteger(day)||day<0||day>6))throw Error('Ongeldige dagen in actie.');
    if(Boolean(item.start)!==Boolean(item.end))throw Error('Actie mist een begin- of eindtijd.');
    if(item.start&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.end)||item.start===item.end))throw Error('Ongeldig tijdvak in actie.');
    return item;
  }

  function validate(doc,id){
    if(!validId(id)||doc?.id!==id)throw Error('De configuratie hoort niet bij deze identifier.');
    if(doc.schema!=='https://sharon.life/log/config/v1'||doc.kind!=='log-config')throw Error('Deze configuratieversie wordt niet ondersteund.');
    const rootType=String(doc.root?.type||'');
    const rootSourceId=String(doc.root?.sourceId||'');
    if(!ROOT_TYPES.has(rootType)||!rootSourceId)throw Error('Onbekend type gedeelde gegevens.');
    const raw={};
    for(const key of ['locations','themes','subthemes','cards','actions']){
      if(!Array.isArray(doc.objects?.[key])||doc.objects[key].length>100)throw Error('Ongeldige gedeelde configuratie.');
      const ids=new Set();
      raw[key]=doc.objects[key];
      for(const source of raw[key]){
        const sourceId=text(source?.id,200,'Object-ID');
        if(ids.has(sourceId))throw Error('Dubbele object-ID in gedeelde configuratie.');
        ids.add(sourceId);
      }
    }

    const objects={
      locations:raw.locations.map(cleanLocation),
      themes:raw.themes.map(cleanTheme),
      subthemes:raw.subthemes.map(cleanSubtheme),
      cards:raw.cards.map(cleanCard),
      actions:raw.actions.map(cleanAction)
    };
    const by=(key,sourceId)=>objects[key].find(item=>String(item.id)===String(sourceId))||null;

    for(const location of objects.locations){
      if(location.parentId&&!by('locations',location.parentId))throw Error('Een gekoppelde hoofdlocatie ontbreekt.');
      const seen=new Set([location.id]);let parent=location.parentId;
      while(parent){
        if(seen.has(parent))throw Error('Cirkel in locatiekoppelingen.');
        seen.add(parent);parent=by('locations',parent)?.parentId||null;
      }
    }
    for(const sub of objects.subthemes)if(!by('themes',sub.themeId))throw Error('Het hoofdthema van een subthema ontbreekt.');
    for(const card of objects.cards){
      if(card.locationId&&!by('locations',card.locationId))throw Error('De gekoppelde locatie van een kaart ontbreekt.');
      if(card.scanAction?.type==='location'&&!card.locationId)throw Error('Locatieactie mist een locatie.');
      if(card.scanAction?.type==='task'){
        const theme=by('themes',card.scanAction.themeId);
        if(!theme)throw Error('Het gekoppelde thema van een kaart ontbreekt.');
        if(card.scanAction.subthemeId&&by('subthemes',card.scanAction.subthemeId)?.themeId!==theme.id)throw Error('Het gekoppelde subthema hoort bij een ander thema.');
      }
    }
    for(const action of objects.actions){
      if(action.trigger!=='qr'&&!by('locations',action.locationId))throw Error('De gekoppelde locatie van een actie ontbreekt.');
      if(action.selection==='smart'&&action.type!=='card')continue;
      if(action.type==='ride'&&!by('locations',action.targetId))throw Error('De bestemming van een actie ontbreekt.');
      if(action.type==='card'&&!by('cards',action.targetId))throw Error('De gekoppelde kaart van een actie ontbreekt.');
      if(action.type==='task'){
        const theme=by('themes',action.targetId);
        if(!theme)throw Error('Het gekoppelde thema van een actie ontbreekt.');
        if(action.subthemeId&&by('subthemes',action.subthemeId)?.themeId!==theme.id)throw Error('Het gekoppelde subthema van een actie hoort bij een ander thema.');
      }
    }

    const collection={location:'locations',card:'cards',theme:'themes',action:'actions'}[rootType];
    if(!by(collection,rootSourceId))throw Error(`De gedeelde ${TYPE_LABEL[rootType].toLowerCase()} ontbreekt.`);

    return {
      kind:'shared-card',
      sharedKind:'shared-config',
      id,
      title:typeof doc.title==='string'&&doc.title.trim()?doc.title.trim().slice(0,160):TYPE_LABEL[rootType],
      rootType,
      rootSourceId,
      exportedAt:typeof doc.exportedAt==='string'?doc.exportedAt:'',
      sourceBuild:String(doc.source?.build||''),
      objects
    };
  }

  function storeFor(type,km,time){
    if(type==='location'||type==='card')return {store:km,key:type==='location'?'locations':'cards'};
    return {store:time,key:type==='theme'?'themes':type==='subtheme'?'subthemes':'locationActions'};
  }
  function objectByLocal(type,id,km=read(KM),time=read(TIME)){
    const {store,key}=storeFor(type,km,time);
    return list(store,key).find(item=>String(item.id)===String(id))||null;
  }
  function sharedObject(type,configurationId,sourceId,km=read(KM),time=read(TIME)){
    const {store,key}=storeFor(type,km,time);
    return list(store,key).find(item=>item?.sharedSource?.configurationId===configurationId&&String(item.sharedSource.sourceId)===String(sourceId))||null;
  }
  function legacyCardRoot(id,km=read(KM)){
    return list(km,'cards').find(card=>Array.isArray(card.sharedConfigurationIds)&&card.sharedConfigurationIds.includes(id))||null;
  }
  function storedRoot(id,rootType=''){
    const state=readUpdateState(),meta=configurationMeta(id,state),type=rootType||meta.rootType||'';
    if(type&&ROOT_TYPES.has(type)){
      const direct=objectByLocal(type,id);
      if(direct&&direct.sharedSource?.configurationId===id)return {type,object:direct};
      const bySource=meta.rootSourceId?sharedObject(type,id,meta.rootSourceId):null;
      if(bySource)return {type,object:bySource};
    }
    const legacy=legacyCardRoot(id);
    if(legacy)return {type:'card',object:legacy};
    return null;
  }
  function stored(id){
    const root=storedRoot(id,'card');
    return root?.type==='card'?root.object:null;
  }
  function hasConfiguration(id){return !!storedRoot(id);}

  function registerSharingIdentity(payload){
    const sharing=read(SHARING_STORE);
    sharing.roots=sharing.roots&&typeof sharing.roots==='object'?sharing.roots:{};
    sharing.published=sharing.published&&typeof sharing.published==='object'?sharing.published:{};
    sharing.roots[`${payload.rootType}:${payload.id}`]=payload.id;
    try{localStorage.setItem(SHARING_STORE,JSON.stringify(sharing));}catch(_){}
  }
  function payloadSignature(payload){
    return JSON.stringify({rootType:payload.rootType,rootSourceId:payload.rootSourceId,objects:payload.objects});
  }
  function markApplied(payload){
    saveConfigurationMeta(payload.id,{
      rootType:payload.rootType,
      rootSourceId:payload.rootSourceId,
      localRootId:payload.id,
      title:payload.title,
      appliedSignature:payloadSignature(payload),
      appliedExportedAt:payload.exportedAt||'',
      availableSignature:'',
      availableExportedAt:'',
      checkedAt:Date.now(),
      lastError:''
    });
    registerSharingIdentity(payload);
    notifyUpdateState();
  }
  function evaluatePayload(payload){
    const state=readUpdateState(),meta=configurationMeta(payload.id,state),signature=payloadSignature(payload);
    const existing=storedRoot(payload.id,payload.rootType);
    const changed=meta.appliedSignature?meta.appliedSignature!==signature:!!existing;
    state.configurations[payload.id]={
      ...meta,
      rootType:payload.rootType,
      rootSourceId:payload.rootSourceId,
      localRootId:existing?.object?.id||payload.id,
      title:payload.title,
      ...(changed?{availableSignature:signature,availableExportedAt:payload.exportedAt||''}:{appliedSignature:signature,appliedExportedAt:payload.exportedAt||meta.appliedExportedAt||'',availableSignature:'',availableExportedAt:''}),
      checkedAt:Date.now(),
      lastError:''
    };
    saveUpdateState(state);
    notifyUpdateState();
    return changed;
  }
  function configurationUpdateAvailable(id){
    if(updateMode()==='off')return false;
    const meta=configurationMeta(id);
    return !!meta.availableSignature&&meta.availableSignature!==meta.appliedSignature;
  }
  function updateAvailable(cardOrId){
    if(typeof cardOrId==='string'){
      const card=objectByLocal('card',cardOrId);
      if(card?.sharedSource?.configurationId)return configurationUpdateAvailable(card.sharedSource.configurationId);
      if(validId(cardOrId)&&configurationUpdateAvailable(cardOrId))return true;
      const legacy=card&&Array.isArray(card.sharedConfigurationIds)?card.sharedConfigurationIds:[];
      return legacy.some(configurationUpdateAvailable);
    }
    const card=cardOrId;
    const ids=[card?.sharedSource?.configurationId,...(Array.isArray(card?.sharedConfigurationIds)?card.sharedConfigurationIds:[])].filter(validId);
    return ids.some(configurationUpdateAvailable);
  }

  function rootCollision(payload,km,time){
    const target=objectByLocal(payload.rootType,payload.id,km,time);
    if(!target)return null;
    if(target.sharedSource?.configurationId===payload.id)return target;
    const legacy=payload.rootType==='card'&&Array.isArray(target.sharedConfigurationIds)&&target.sharedConfigurationIds.includes(payload.id);
    if(legacy)return target;
    throw Error(`Identifier ${payload.id} is lokaal al in gebruik door een andere ${TYPE_LABEL[payload.rootType].toLowerCase()}.`);
  }
  function upsert(payload,type,source,fields,km,time){
    const {store,key}=storeFor(type,km,time),items=list(store,key),wantedId=localIdFor(payload,type,source.id);
    let found=sharedObject(type,payload.id,source.id,km,time);
    if(!found&&isRootSource(payload,type,source.id)){
      found=rootCollision(payload,km,time);
      if(!found&&type==='card')found=legacyCardRoot(payload.id,km);
    }
    if(found&&found.id!==wantedId&&isRootSource(payload,type,source.id)){
      const oldId=found.id;
      if(items.some(item=>item!==found&&String(item.id)===wantedId))throw Error(`Identifier ${wantedId} is lokaal al in gebruik.`);
      found.id=wantedId;
      if(type==='card'){
        for(const rule of list(time,'locationActions'))if(rule.type==='card'&&String(rule.targetId)===String(oldId))rule.targetId=wantedId;
      }else if(type==='location'){
        for(const location of list(km,'locations'))if(String(location.parentId)===String(oldId))location.parentId=wantedId;
        for(const card of list(km,'cards'))if(String(card.locationId)===String(oldId))card.locationId=wantedId;
        for(const rule of list(time,'locationActions')){
          if(String(rule.locationId)===String(oldId))rule.locationId=wantedId;
          if(rule.type==='ride'&&String(rule.targetId)===String(oldId))rule.targetId=wantedId;
        }
      }else if(type==='theme'){
        for(const sub of list(time,'subthemes'))if(String(sub.themeId)===String(oldId))sub.themeId=wantedId;
        for(const card of list(km,'cards'))if(card.scanAction?.type==='task'&&String(card.scanAction.themeId)===String(oldId))card.scanAction.themeId=wantedId;
        for(const rule of list(time,'locationActions'))if(rule.type==='task'&&String(rule.targetId)===String(oldId))rule.targetId=wantedId;
      }
    }
    if(!found){
      if(items.some(item=>String(item.id)===wantedId))throw Error(`Lokale identifier is al in gebruik (${wantedId}).`);
      found={id:wantedId};
      items.push(found);store[key]=items;
    }
    const preservedId=found.id;
    Object.assign(found,fields,{id:preservedId,sharedSource:{configurationId:payload.id,sourceId:String(source.id),rootType:payload.rootType,isRoot:isRootSource(payload,type,source.id)}});
    if(type==='card'){
      found.sharedConfigurationIds=[...new Set([...(Array.isArray(found.sharedConfigurationIds)?found.sharedConfigurationIds:[]),payload.id])];
      found.createdAt=found.createdAt||source.createdAt||nowIso();
      found.updatedAt=nowIso();
    }
    return found.id;
  }

  function applyPlan(payload){
    const km=clone(read(KM)),time=clone(read(TIME));
    rootCollision(payload,km,time);
    const map={location:new Map(),theme:new Map(),subtheme:new Map(),card:new Map(),action:new Map()};

    for(const source of payload.objects.locations){
      map.location.set(source.id,upsert(payload,'location',source,{...source,parentId:source.parentId?localIdFor(payload,'location',source.parentId):null},km,time));
    }
    for(const source of payload.objects.themes){
      map.theme.set(source.id,upsert(payload,'theme',source,{...source},km,time));
    }
    for(const source of payload.objects.subthemes){
      map.subtheme.set(source.id,upsert(payload,'subtheme',source,{...source,themeId:localIdFor(payload,'theme',source.themeId)},km,time));
    }
    for(const source of payload.objects.cards){
      let scanAction=null;
      if(source.scanAction?.type==='location')scanAction={type:'location'};
      if(source.scanAction?.type==='task')scanAction={type:'task',themeId:localIdFor(payload,'theme',source.scanAction.themeId),subthemeId:source.scanAction.subthemeId?localIdFor(payload,'subtheme',source.scanAction.subthemeId):null};
      const fields={...source,locationId:source.locationId?localIdFor(payload,'location',source.locationId):null,scanAction};
      map.card.set(source.id,upsert(payload,'card',source,fields,km,time));
    }
    for(const source of payload.objects.actions){
      const fields={...source};
      if(source.trigger!=='qr')fields.locationId=source.locationId?localIdFor(payload,'location',source.locationId):null;
      if(source.selection!=='smart'||source.type==='card'){
        if(source.type==='ride')fields.targetId=source.targetId?localIdFor(payload,'location',source.targetId):null;
        if(source.type==='card')fields.targetId=source.targetId?localIdFor(payload,'card',source.targetId):null;
        if(source.type==='task'){
          fields.targetId=source.targetId?localIdFor(payload,'theme',source.targetId):null;
          fields.subthemeId=source.subthemeId?localIdFor(payload,'subtheme',source.subthemeId):null;
        }
      }else{
        delete fields.targetId;delete fields.subthemeId;
      }
      const id=upsert(payload,'action',source,fields,km,time);
      map.action.set(source.id,id);
    }

    const actionIds=new Set();
    for(const rule of list(time,'locationActions')){
      if(rule.trigger!=='qr'||!rule.logCodeId)continue;
      if(actionIds.has(rule.logCodeId))throw Error(`QR-identifier ${rule.logCodeId} wordt door meerdere acties gebruikt.`);
      actionIds.add(rule.logCodeId);
    }

    const rootId=localIdFor(payload,payload.rootType,payload.rootSourceId);
    const root=objectByLocal(payload.rootType,rootId,km,time);
    if(!root)throw Error('Het hoofobject kon niet worden opgebouwd.');
    return {km,time,root,rootId};
  }

  function writeResult(result,payload){
    const beforeKm=localStorage.getItem(KM),beforeTime=localStorage.getItem(TIME);
    try{
      localStorage.setItem(KM,JSON.stringify(result.km));
      localStorage.setItem(TIME,JSON.stringify(result.time));
    }catch(error){
      if(beforeKm===null)localStorage.removeItem(KM);else localStorage.setItem(KM,beforeKm);
      if(beforeTime===null)localStorage.removeItem(TIME);else localStorage.setItem(TIME,beforeTime);
      throw Error('Opslaan is niet gelukt. Controleer de beschikbare opslag en probeer opnieuw.');
    }
    markApplied(payload);
    window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{key:KM,source:'shared-config-import'}}));
    window.LogTimeModule?.reloadFromStorage?.({view:window.LogTimeModule.getView?.()||'home'});
    window.dispatchEvent(new Event('log-time-state-change'));
    window.dispatchEvent(new Event('log-shell-view-refresh'));
    window.LogLocationActions?.refresh?.();
    window.LogCardsModule?.refresh?.();
    return result.root;
  }
  function plan(payload){return applyPlan(payload);}
  function commit(payload,options={}){
    const existing=storedRoot(payload.id,payload.rootType);
    if(existing&&!options.update){
      markApplied(payload);
      return existing.object;
    }
    return writeResult(applyPlan(payload),payload);
  }

  function dependencySummary(payload){
    const o=payload.objects,parts=[];
    if(o.locations.length)parts.push(`${o.locations.length} ${o.locations.length===1?'locatie':'locaties'}`);
    if(o.cards.length&&payload.rootType!=='card')parts.push(`${o.cards.length} ${o.cards.length===1?'kaart':'kaarten'}`);
    if(o.themes.length&&payload.rootType!=='theme')parts.push(`${o.themes.length} ${o.themes.length===1?'thema':'thema’s'}`);
    if(o.subthemes.length)parts.push(`${o.subthemes.length} ${o.subthemes.length===1?'subthema':'subthema’s'}`);
    if(o.actions.length&&payload.rootType!=='action')parts.push(`${o.actions.length} ${o.actions.length===1?'actie':'acties'}`);
    return parts.join(' · ')||'Geen extra gekoppelde gegevens';
  }
  function rootSource(payload){
    const key={location:'locations',card:'cards',theme:'themes',action:'actions'}[payload.rootType];
    return payload.objects[key].find(item=>String(item.id)===String(payload.rootSourceId));
  }
  function sourceDate(payload){
    const date=payload.exportedAt?new Date(payload.exportedAt):null;
    return date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(date):'';
  }
  function previewBody(payload,changed,existing){
    const source=rootSource(payload),date=sourceDate(payload),label=TYPE_LABEL[payload.rootType];
    const lines=[`<h3>${esc(source?.name||payload.title||label)}</h3>`,`<p><strong>Identifier:</strong> <code>${esc(payload.id)}</code></p>`];
    if(payload.rootType==='card')lines.push('<div class="code-surface" data-shared-preview></div>');
    if(payload.rootType==='location'&&source?.address)lines.push(`<p>${esc(source.address)}</p>`);
    if(payload.rootType==='theme')lines.push(`<p>${payload.objects.subthemes.length} ${payload.objects.subthemes.length===1?'subthema':'subthema’s'} gekoppeld.</p>`);
    if(payload.rootType==='action')lines.push(`<p>${esc({ride:'Rit voorbereiden',task:'Taak voorbereiden',card:'Kaart tonen'}[source?.type]||'Actie')}</p>`);
    lines.push(`<p class="hint">${esc(dependencySummary(payload))}</p>`);
    if(!existing)lines.push(`<p>Deze ${label.toLowerCase()} wordt toegevoegd met exact dezelfde identifier als de gedeelde bron.</p>`);
    else if(changed)lines.push(`<p>Er is een nieuwere versie beschikbaar${date?` · bron ${esc(date)}`:''}. Bijwerken vervangt alleen de gegevens die uit deze gedeelde configuratie komen.</p>`);
    else lines.push(`<p>Deze ${label.toLowerCase()} is actueel.</p>`);
    return lines.join('');
  }
  function openStored(id){
    const root=storedRoot(id);
    if(!root)return false;
    if(root.type==='card')return window.LogCardsModule?.show?.(root.object.id)!==false;
    window.LogCardsUI?.close?.();
    window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section:SECTION_FOR[root.type]}}));
    if(root.type==='action')setTimeout(()=>window.LogLocationActions?.details?.(root.object.id),80);
    return true;
  }
  function preview(payload){
    const existingInfo=storedRoot(payload.id,payload.rootType);
    const changed=existingInfo?evaluatePayload(payload):false;
    const label=TYPE_LABEL[payload.rootType],title=!existingInfo?`Gedeelde ${label.toLowerCase()} ophalen`:changed?`${label}update beschikbaar`:`Gedeelde ${label.toLowerCase()}`;
    const panel=window.LogCardsUI.sheet(title,`${previewBody(payload,changed,existingInfo)}<button class="btn full" data-shared-import>${!existingInfo?`${label} toevoegen`:changed?`${label} bijwerken`:`${label} openen`}</button>${changed?`<button class="btn secondary full" data-shared-open-current>Huidige ${label.toLowerCase()} openen</button>`:''}<button class="btn secondary full" data-shared-cancel>Annuleren</button><p role="status" data-shared-status></p>`);
    if(payload.rootType==='card'){
      try{window.LogCardsUI.renderCode(panel.querySelector('[data-shared-preview]'),rootSource(payload));}catch(error){panel.querySelector('[data-shared-status]').textContent=error.message;}
    }
    panel.querySelector('[data-shared-cancel]').onclick=()=>window.LogCardsUI.close();
    panel.querySelector('[data-shared-open-current]')?.addEventListener('click',()=>openStored(payload.id));
    panel.querySelector('[data-shared-import]').onclick=()=>{
      const status=panel.querySelector('[data-shared-status]');
      try{
        if(!existingInfo)commit(payload);
        else if(changed)commit(payload,{update:true});
        openStored(payload.id);
      }catch(error){status.textContent=error.message||'Opslaan is niet gelukt.';}
    };
    return panel;
  }

  async function fetchPayload(id){
    if(!validId(id))throw Error('Ongeldige gedeelde identifier.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(`${PUBLIC_BASE}${id}.json`,{cache:'no-store',credentials:'omit',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});
      if(response.status===404)throw Error('De gedeelde gegevens zijn niet gevonden.');
      if(!response.ok)throw Error(`De bron kon niet worden gecontroleerd (${response.status}).`);
      return validate(await response.json(),id);
    }catch(error){
      if(error?.name==='AbortError')throw Error('De bron reageerde niet op tijd. Probeer later opnieuw.');
      throw error;
    }finally{clearTimeout(timer);}
  }
  async function openByIdentifier(id){
    const panel=window.LogCardsUI.sheet('Gedeelde gegevens controleren','<p>De nieuwste versie wordt opgehaald…</p><p role="status" data-shared-status></p>');
    try{
      const payload=await fetchPayload(id);
      if(!document.body.contains(panel))return;
      preview(payload);
    }catch(error){
      const status=panel.querySelector('[data-shared-status]');
      if(status)status.textContent=error.message||'Controleren is niet gelukt.';
    }
  }
  async function openUpdateForCard(cardId){
    const card=objectByLocal('card',cardId);
    const id=card?.sharedSource?.configurationId||card?.sharedConfigurationIds?.find(validId);
    if(id)return openByIdentifier(id);
  }

  function discoverConfigurations(){
    const state=readUpdateState(),km=read(KM),time=read(TIME);
    let changed=false;
    for(const card of list(km,'cards')){
      for(const id of Array.isArray(card.sharedConfigurationIds)?card.sharedConfigurationIds:[]){
        if(!validId(id))continue;
        const meta=configurationMeta(id,state);
        if(!meta.rootType){state.configurations[id]={...meta,rootType:'card',localRootId:card.id,title:card.name||'Kaart'};changed=true;}
      }
    }
    for(const [type,items] of [['location',list(km,'locations')],['card',list(km,'cards')],['theme',list(time,'themes')],['action',list(time,'locationActions')]]){
      for(const item of items){
        const source=item?.sharedSource;
        if(!source?.isRoot||!validId(source.configurationId))continue;
        const meta=configurationMeta(source.configurationId,state);
        if(meta.rootType!==type||meta.localRootId!==item.id){
          state.configurations[source.configurationId]={...meta,rootType:type,rootSourceId:String(source.sourceId),localRootId:item.id,title:item.name||TYPE_LABEL[type]};
          changed=true;
        }
      }
    }
    if(changed)saveUpdateState(state);
    return state;
  }
  function sharedConfigurationIds(){
    const state=discoverConfigurations(),ids=[];
    for(const [id,meta] of Object.entries(state.configurations)){
      if(!validId(id)||!ROOT_TYPES.has(meta.rootType))continue;
      if(storedRoot(id,meta.rootType))ids.push(id);
    }
    return [...new Set(ids)];
  }
  function pendingCount(){
    if(updateMode()==='off')return 0;
    return sharedConfigurationIds().filter(configurationUpdateAvailable).length;
  }
  async function checkAll(options={}){
    const manual=options.manual===true,force=options.force===true,mode=updateMode(),ids=sharedConfigurationIds();
    if((mode==='off'&&!manual)||(mode==='manual'&&!manual))return {checked:0,updates:pendingCount(),errors:0,skipped:true};
    if(!ids.length)return {checked:0,updates:0,errors:0};
    if(checking)return {checked:0,updates:pendingCount(),errors:0,busy:true};
    checking=true;let checked=0,errors=0;
    try{
      for(const id of ids){
        const meta=configurationMeta(id),due=force||manual||!meta.checkedAt||Date.now()-Number(meta.checkedAt)>AUTO_INTERVAL;
        if(!due)continue;
        try{evaluatePayload(await fetchPayload(id));checked++;}
        catch(error){errors++;saveConfigurationMeta(id,{checkedAt:Date.now(),lastError:error.message||'Controleren mislukt.'});notifyUpdateState();}
      }
      return {checked,updates:pendingCount(),errors};
    }finally{checking=false;syncSettingsPanel();decorateObjects();}
  }

  function manualForm(){
    return `<form><div class="form-group"><label for="sharedCardIdentifier">Code of gedeelde link</label><input id="sharedCardIdentifier" name="identifier" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Plak de identifier van 12 tekens"></div><button type="submit" class="btn full">Code openen</button><p role="status" data-shared-error></p></form>`;
  }
  function bindManual(panel){
    panel.querySelector('form').onsubmit=event=>{
      event.preventDefault();let id=panel.querySelector('input').value.trim();
      try{
        if(id.startsWith('https://')){
          const url=new URL(id);
          if(url.origin!=='https://sharon.life'||url.search||url.hash)throw Error();
          const match=url.pathname.match(/^\/log\/config\/([A-Za-z0-9_-]{12})\.json$/);
          if(!match)throw Error();id=match[1];
        }
        if(!validId(id))throw Error();
        window.LogCode.preview({kind:'log-action',version:1,id});
      }catch(_){panel.querySelector('[data-shared-error]').textContent='Gebruik een identifier van 12 tekens of een geldige gedeelde link.';}
    };
  }

  function settingsStatus(){
    const ids=sharedConfigurationIds(),state=readUpdateState(),updates=pendingCount();
    if(!ids.length)return 'Nog geen gedeelde gegevens opgeslagen.';
    if(state.mode==='off')return 'Controleren op bronupdates staat uit.';
    const checked=ids.map(id=>Number(configurationMeta(id,state).checkedAt)||0).filter(Boolean).sort((a,b)=>b-a)[0]||0;
    const when=checked?new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(checked)):'nog niet gecontroleerd';
    return `${updates?`${updates} ${updates===1?'update':'updates'} beschikbaar · `:''}${ids.length} gedeelde ${ids.length===1?'configuratie':'configuraties'} · laatste controle: ${when}.`;
  }
  function ensureSettingsPanel(){
    const content=document.querySelector('#kmShellSettingsContent');
    if(!content||content.dataset.mode!=='general')return;
    let panel=content.querySelector('#kmShellSharedCardSettings');
    if(!panel){
      const group=content.querySelector('#kmShellRegistrationSettingsTitle')?.closest('.km-shell-settings-group');
      if(!group)return;
      panel=document.createElement('details');
      panel.className='km-shell-settings-accordion';
      panel.id='kmShellSharedCardSettings';
      panel.innerHTML=`<summary><span class="km-shell-settings-accordion-title"><strong>Updates</strong><small>Kaarten, locaties, thema’s en acties</small></span><span class="km-shell-settings-accordion-arrow">›</span></summary><div class="km-shell-settings-accordion-body"><div class="form-group"><label for="kmSharedCardUpdateMode">Controleren op wijzigingen</label><select id="kmSharedCardUpdateMode" data-shared-update-mode><option value="auto">Automatisch controleren (standaard)</option><option value="manual">Alleen handmatig controleren</option><option value="off">Niet controleren</option></select><p class="hint">Log controleert of gedeelde gegevens zijn gewijzigd. Wijzigingen worden nooit zonder jouw keuze overgenomen.</p></div><button type="button" class="btn secondary full" data-shared-check-now>Nu controleren</button><p class="hint" data-shared-update-status></p></div>`;
      group.appendChild(panel);
      panel.querySelector('[data-shared-update-mode]').onchange=event=>setUpdateMode(event.target.value);
      panel.querySelector('[data-shared-check-now]').onclick=async event=>{
        const button=event.currentTarget,old=button.textContent,status=panel.querySelector('[data-shared-update-status]');
        button.disabled=true;button.textContent='Controleren…';
        try{
          const result=await checkAll({manual:true,force:true});
          status.textContent=result.errors?`${result.updates} update(s) gevonden. ${result.errors} bron(nen) konden niet worden gecontroleerd.`:result.updates?`${result.updates} ${result.updates===1?'update':'updates'} beschikbaar.`:'Alles is actueel.';
        }finally{button.disabled=false;button.textContent=old;syncSettingsPanel();}
      };
    }
    if(panel.hasAttribute('data-settings-target'))panel.removeAttribute('data-settings-target');
    if(panel.hidden)panel.hidden=false;
    if(panel.style.display)panel.style.display='';
    syncSettingsPanel();
  }
  function syncSettingsPanel(){
    const panel=document.querySelector('#kmShellSharedCardSettings');if(!panel)return;
    const mode=updateMode(),select=panel.querySelector('[data-shared-update-mode]'),button=panel.querySelector('[data-shared-check-now]'),status=panel.querySelector('[data-shared-update-status]');
    if(select&&select.value!==mode)select.value=mode;
    if(button&&button.hidden!==(mode==='off'))button.hidden=mode==='off';
    const statusText=settingsStatus();
    if(status&&status.textContent!==statusText)status.textContent=statusText;
  }

  function badge(copy,id){
    if(!copy)return;
    let node=copy.querySelector('[data-shared-update-badge]');
    const show=configurationUpdateAvailable(id);
    if(show&&!node){
      node=document.createElement('span');
      node.dataset.sharedUpdateBadge='1';
      node.className='log-shared-update-badge';
      node.textContent='Update beschikbaar';
      copy.appendChild(node);
    }
    if(node&&node.hidden!==!show)node.hidden=!show;
  }
  function decorateObjects(){
    const state=discoverConfigurations();
    for(const [id,meta] of Object.entries(state.configurations)){
      if(!validId(id)||!ROOT_TYPES.has(meta.rootType))continue;
      const root=storedRoot(id,meta.rootType);if(!root)continue;
      const localId=root.object.id;
      if(meta.rootType==='card'){
        const row=[...document.querySelectorAll('[data-card-open]')].find(node=>String(node.dataset.cardOpen)===String(localId));
        badge(row?.querySelector('.code-card-copy'),id);
      }else if(meta.rootType==='location'){
        const row=[...document.querySelectorAll('[data-shell-location-node]')].find(node=>String(node.dataset.shellLocationNode)===String(localId));
        badge(row?.querySelector('.km-shell-location-copy'),id);
      }else if(meta.rootType==='theme'){
        const row=[...document.querySelectorAll('[data-theme-node]')].find(node=>String(node.dataset.themeNode)===String(localId));
        badge(row?.querySelector('.km-shell-theme-row-copy'),id);
      }else if(meta.rootType==='action'){
        const button=[...document.querySelectorAll('[data-la-open]')].find(node=>String(node.dataset.laOpen)===String(localId));
        badge(button?.querySelector('.code-card-copy'),id);
      }
    }
  }
  function configurationForClicked(target){
    discoverConfigurations();
    const card=target.closest?.('[data-card-open]');
    if(card){
      const item=objectByLocal('card',card.dataset.cardOpen);
      const id=item?.sharedSource?.configurationId||item?.sharedConfigurationIds?.find(validId);
      if(id&&configurationUpdateAvailable(id))return id;
    }
    const location=target.closest?.('[data-shell-location-toggle]');
    if(location){
      const item=objectByLocal('location',location.dataset.shellLocationToggle);
      const id=item?.sharedSource?.configurationId;
      if(id&&configurationUpdateAvailable(id))return id;
    }
    const theme=target.closest?.('[data-theme-toggle]');
    if(theme){
      const item=objectByLocal('theme',theme.dataset.themeToggle);
      const id=item?.sharedSource?.configurationId;
      if(id&&configurationUpdateAvailable(id))return id;
    }
    const action=target.closest?.('[data-la-open]');
    if(action){
      const item=objectByLocal('action',action.dataset.laOpen);
      const id=item?.sharedSource?.configurationId;
      if(id&&configurationUpdateAvailable(id))return id;
    }
    return null;
  }
  function installStyles(){
    if(document.querySelector('#logSharedCardUpdateStyle'))return;
    const style=document.createElement('style');
    style.id='logSharedCardUpdateStyle';
    style.textContent='.log-shared-update-badge{display:inline-flex!important;width:max-content;margin-top:4px;padding:3px 7px;border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));border-radius:999px;background:color-mix(in srgb,var(--warn) 10%,transparent);color:var(--warn)!important;font-size:9px!important;font-weight:800!important;line-height:1.2}.log-shared-update-badge[hidden]{display:none!important}';
    document.head.appendChild(style);
  }
  function queueAugment(){
    if(augmentQueued)return;
    augmentQueued=true;
    requestAnimationFrame(()=>{augmentQueued=false;ensureSettingsPanel();decorateObjects();});
  }
  function notifyUpdateState(){
    window.dispatchEvent(new CustomEvent('log-shared-card-update-state',{detail:{mode:updateMode(),updates:pendingCount()}}));
    window.dispatchEvent(new CustomEvent('log-shared-config-update-state',{detail:{mode:updateMode(),updates:pendingCount()}}));
    queueAugment();
  }
  function scheduleAutoCheck(delay=700){
    clearTimeout(autoTimer);
    if(updateMode()!=='auto')return;
    autoTimer=setTimeout(()=>checkAll().catch(()=>{}),delay);
  }

  function init(){
    window.LOG_TEST_BUILD='0.35.1-test.5';
    installStyles();discoverConfigurations();queueAugment();
    observer=new MutationObserver(queueAugment);observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('click',event=>{
      const id=configurationForClicked(event.target);
      if(!id)return;
      event.preventDefault();event.stopImmediatePropagation();openByIdentifier(id);
    },true);
    window.addEventListener('log-km-state-change',queueAugment);
    window.addEventListener('log-time-state-change',queueAugment);
    window.addEventListener('log-shell-view-refresh',event=>{queueAugment();if(['barcodes','locations','themes','locationactions'].includes(event.detail?.section))scheduleAutoCheck(150);});
    window.addEventListener('pageshow',()=>scheduleAutoCheck(350));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleAutoCheck(350);});
    scheduleAutoCheck(900);
  }

  window.LogSharedConfig={
    validate,plan,commit,preview,manualForm,bindManual,storedRoot,hasConfiguration,openStored,openByIdentifier,fetchPayload,checkAll,updateMode,setUpdateMode,configurationUpdateAvailable
  };
  window.LogSharedCard={
    validate,plan,commit,preview,manualForm,bindManual,stored,checkAll,updateAvailable,openUpdateForCard,updateMode,setUpdateMode,
    openByIdentifier,openStored,storedRoot,configurationUpdateAvailable
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
