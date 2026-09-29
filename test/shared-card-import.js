(function(){
  'use strict';
  const KM='kmreg-test-v4-data',TIME='urenregistratie.test.pwa.v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=key=>JSON.parse(localStorage.getItem(key)||'{}');
  const list=(data,key)=>Array.isArray(data[key])?data[key]:[];
  const text=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`${label} ontbreekt of is ongeldig.`);return value;};
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
        if(scan.subthemeId){const sub=objects.subthemes.find(x=>x.id===scan.subthemeId);if(!sub||sub.themeId!==t.id)throw Error('Het gekoppelde subthema ontbreekt of hoort bij een ander thema.');subtheme={id:sub.id,themeId:t.id,name:text(sub.name,200,'Subthemanaam')};}
        scanAction={type:'task',themeId:t.id,subthemeId:subtheme?.id||null};
      }else throw Error('Onbekende kaartactie.');
    }
    return {kind:'shared-card',id,card:{id:card.id,name:card.name,format:card.format,value:card.value,color:/^#[0-9a-f]{6}$/i.test(card.color||'')?card.color:'#489ff8',locationId:card.locationId||null,scanAction},locations,theme,subtheme};
  }
  function stored(id,km=read(KM)){
    return list(km,'cards').find(card=>Array.isArray(card.sharedConfigurationIds)&&card.sharedConfigurationIds.includes(id));
  }
  function plan(payload){
    const km=read(KM),time=read(TIME),existing=stored(payload.id,km);
    if(existing)return {km,time,card:existing,existing:true,timeChanged:false};
    let timeChanged=false;
    function add(store,key,type,source,fields){
      const id=`shared:${payload.id}:${type}:${source.id}`,items=list(store,key);
      const found=items.find(x=>x.id===id);
      if(found){if(found.sharedSource?.configurationId!==payload.id||found.sharedSource?.sourceId!==source.id)throw Error('Een lokale identifier is al in gebruik.');return id;}
      items.push({...fields,id,sharedSource:{configurationId:payload.id,sourceId:source.id}});store[key]=items;if(store===time)timeChanged=true;return id;
    }
    const mapped=new Map();
    for(const location of payload.locations)mapped.set(location.id,add(km,'locations','location',location,{...location,parentId:location.parentId?mapped.get(location.parentId):null}));
    let scanAction=payload.card.scanAction;
    if(payload.theme){const themeId=add(time,'themes','theme',payload.theme,payload.theme);const subthemeId=payload.subtheme?add(time,'subthemes','subtheme',payload.subtheme,{...payload.subtheme,themeId}):null;scanAction={type:'task',themeId,subthemeId};}
    const card={...payload.card,locationId:mapped.get(payload.card.locationId)||null,scanAction};
    const duplicate=list(km,'cards').find(c=>c.format===card.format&&c.value===card.value&&(c.locationId||null)===card.locationId);
    const cardId=duplicate?.id||add(km,'cards','card',payload.card,{...card,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
    const saved=list(km,'cards').find(c=>c.id===cardId);
    saved.sharedConfigurationIds=[...new Set([...(Array.isArray(saved.sharedConfigurationIds)?saved.sharedConfigurationIds:[]),payload.id])];
    return {km,time,card:saved,existing:false,timeChanged};
  }
  function commit(payload){
    const result=plan(payload);if(result.existing)return result.card;
    const beforeTime=localStorage.getItem(TIME);let written=false;
    try{
      if(result.timeChanged){localStorage.setItem(TIME,JSON.stringify(result.time));written=true;}
      localStorage.setItem(KM,JSON.stringify(result.km));
    }catch(error){if(written){if(beforeTime===null)localStorage.removeItem(TIME);else localStorage.setItem(TIME,beforeTime);}throw Error('Opslaan is niet gelukt. Controleer de beschikbare opslag en probeer opnieuw.');}
    window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{key:KM,source:'shared-card-import'}}));
    if(result.timeChanged){window.LogTimeModule?.reloadFromStorage?.({view:window.LogTimeModule.getView?.()||'home'});window.dispatchEvent(new Event('log-time-state-change'));}
    window.dispatchEvent(new Event('log-shell-view-refresh'));
    return result.card;
  }
  function preview(payload){
    const result=plan(payload),card=result.card;
    const panel=window.LogCardsUI.sheet('Gedeelde kaart ophalen',`<h3>${esc(card.name)}</h3><p>Van sharon.life · ${esc(payload.id)}</p><div class="code-surface" data-shared-preview></div><p>${payload.locations.length} gekoppelde locatie(s)${payload.theme?' · thema'+(payload.subtheme?' en subthema':''):''}</p><p>${result.existing?'Deze kaart staat al in Log. Je lokale aanpassingen blijven behouden.':'Controleer de kaart en voeg deze daarna toe. Een gekoppelde taak of actie start niet automatisch.'}</p><button class="btn full" data-shared-import>${result.existing?'Kaart openen':'Kaart toevoegen'}</button><button class="btn secondary full" data-shared-cancel>Annuleren</button><p role="status" data-shared-status></p>`);
    window.LogCardsUI.renderCode(panel.querySelector('[data-shared-preview]'),card);
    panel.querySelector('[data-shared-cancel]').onclick=()=>window.LogCardsUI.close();
    panel.querySelector('[data-shared-import]').onclick=()=>{try{const saved=commit(payload);window.LogCardsModule.show(saved.id);}catch(error){panel.querySelector('[data-shared-status]').textContent=error.message;}};
  }
  function prompt(){
    const panel=window.LogCardsUI.sheet('Kaart ophalen',`<form><div class="form-group"><label for="sharedCardIdentifier">Identifier of gedeelde link</label><input id="sharedCardIdentifier" name="identifier" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Plak de identifier van 12 tekens"></div><p>Haal een gepubliceerde kaart op van sharon.life. Je hebt geen publicatiesleutel nodig.</p><button type="submit" class="btn full">Kaart ophalen</button><p role="status" data-shared-error></p></form>`);
    panel.querySelector('form').onsubmit=event=>{
      event.preventDefault();let id=panel.querySelector('input').value.trim();
      try{if(id.startsWith('https://')){const url=new URL(id);if(url.origin!=='https://sharon.life'||url.search||url.hash)throw Error();const match=url.pathname.match(/^\/log\/config\/([A-Za-z0-9_-]{12})\.json$/);if(!match)throw Error();id=match[1];}if(!/^[A-Za-z0-9_-]{12}$/.test(id))throw Error();window.LogCode.preview({kind:'log-action',version:1,id});}
      catch(_){panel.querySelector('[data-shared-error]').textContent='Gebruik een identifier van 12 tekens of de gedeelde configuratielink van sharon.life.';}
    };
  }
  window.LogSharedCard={validate,plan,commit,preview,prompt,stored};
})();
