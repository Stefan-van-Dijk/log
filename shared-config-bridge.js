(function(){
  'use strict';

  const ID_PATTERN=/^[A-Za-z0-9_-]{12}$/;
  let timer=null,attempts=0;

  const list=(raw,key)=>Array.isArray(raw?.[key])?raw[key]:[];

  function normalizeLogCodeSource(value){
    if(typeof value!=='string')return value;
    let source;
    try{source=JSON.parse(value);}catch(_){return value;}
    if(source?.kind!=='log-code'||!Array.isArray(source.entities))return value;
    let changed=false;
    for(const entity of source.entities){
      if(!entity||!['theme','subtheme'].includes(entity.type))continue;
      const external=entity.logCodeId??entity.id;
      if(typeof external!=='string'||!ID_PATTERN.test(external))throw Error('Thema- en subthema-identifiers bestaan uit exact 12 tekens: A–Z, a–z, 0–9, - en _.');
      if(entity.id!=null&&entity.logCodeId!=null&&entity.id!==entity.logCodeId)throw Error('Een thema of subthema bevat twee verschillende persistente identifiers.');
      if(entity.id!==external){entity.id=external;changed=true;}
    }
    return changed?JSON.stringify(source):value;
  }

  function validateParsedConfiguration(payload){
    if(payload?.kind!=='log-code')return payload;
    for(const entity of payload.entities||[]){
      if(['theme','subtheme'].includes(entity?.type)&&!ID_PATTERN.test(entity.id||''))throw Error('Thema- en subthema-identifiers bestaan uit exact 12 tekens: A–Z, a–z, 0–9, - en _.');
    }
    return payload;
  }

  function recognizedKind(value){
    if(typeof value!=='string')return '';
    try{
      const raw=JSON.parse(value);
      return ['log-code','log-task'].includes(raw?.kind)?raw.kind:'';
    }catch(_){return '';}
  }

  function executableCardPayload(value,api){
    const kind=recognizedKind(value);
    if(!kind)return null;
    try{
      const payload=api.parse(value);
      if(!payload||!['log-code','log-task'].includes(payload.kind))return null;
      return {payload,error:null};
    }catch(error){return {payload:null,error};}
  }

  function augmentCard(id,api){
    const card=list(window.LogCardData?.snapshot?.()||{},'cards').find(item=>String(item?.id)===String(id));
    if(!card)return;
    const executable=executableCardPayload(card.value,api);
    if(!executable)return;
    const panel=document.querySelector('dialog.cards-dialog[open],dialog.cards-dialog');
    const body=panel?.querySelector('.cards-dialog-body');
    if(!body||body.querySelector('[data-executable-card-action],[data-executable-card-error]'))return;
    const anchor=body.querySelector('.cards-content-details')||body.querySelector('.code-surface');
    if(executable.error){
      const note=document.createElement('p');
      note.className='cards-notice';note.dataset.executableCardError='1';
      note.textContent=`Deze kaart bevat een Log-payload, maar kan niet worden uitgevoerd: ${executable.error.message}`;
      anchor?.after(note);return;
    }
    const payload=executable.payload;
    const button=document.createElement('button');
    button.type='button';button.className='btn full cards-scan-action';button.dataset.executableCardAction='1';
    button.textContent=payload.kind==='log-code'?'Configuratie toepassen':'Taak starten';
    const note=document.createElement('p');note.className='cards-notice';
    note.textContent=payload.kind==='log-code'
      ?'Deze kaart is alleen de informatiedrager. De thema’s en subthema’s worden pas toegevoegd nadat je de configuratie toepast.'
      :'De taakcode gebruikt de lokaal toegepaste configuratie; de QR hoeft geen thema- of naamgegevens mee te leveren.';
    button.onclick=()=>api.preview(payload);
    if(anchor)anchor.after(button,note);else body.prepend(button,note);
  }

  function install(){
    const api=window.LogCode,shared=window.LogSharedConfig,cards=window.LogCardsModule;
    if(!api?.preview||!api?.parse||!cards?.show||!window.LogCardsUI){
      if(attempts++<160)timer=setTimeout(install,50);
      return;
    }

    if(!api.parse.__executablePayloadBridge){
      const originalParse=api.parse.bind(api);
      const wrappedParse=function(value){return validateParsedConfiguration(originalParse(normalizeLogCodeSource(value)));};
      wrappedParse.__executablePayloadBridge=true;
      wrappedParse.__original=originalParse;
      api.parse=wrappedParse;
    }

    if(!api.preview.__executablePayloadBridge){
      const originalPreview=api.preview.bind(api);
      const wrappedPreview=function(payload){
        if(payload?.kind==='log-action'&&typeof payload.id==='string'&&shared?.hasConfiguration?.(payload.id))return shared.openByIdentifier(payload.id);
        return originalPreview(payload);
      };
      wrappedPreview.__executablePayloadBridge=true;
      wrappedPreview.__original=originalPreview;
      api.preview=wrappedPreview;
    }

    if(!cards.show.__executablePayloadBridge){
      const originalShow=cards.show.bind(cards);
      const wrappedShow=function(id,recognized){
        const result=originalShow(id,recognized);
        setTimeout(()=>augmentCard(id,api),0);
        return result;
      };
      wrappedShow.__executablePayloadBridge=true;
      wrappedShow.__original=originalShow;
      cards.show=wrappedShow;
    }

    window.LogExecutablePayloadBridge={executableCardPayload,augmentCard};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  install();
  window.addEventListener('pageshow',install);
})();