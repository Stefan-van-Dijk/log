(function(){
  'use strict';

  const TIME='urenregistratie.test.pwa.v1';
  const ID_PATTERN=/^[A-Za-z0-9_-]{12}$/;
  let timer=null,attempts=0;

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const readTime=()=>{try{const value=JSON.parse(localStorage.getItem(TIME)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}};
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

  function resolveTask(id){
    if(!ID_PATTERN.test(id||''))throw Error('Ongeldige taakidentifier.');
    const time=readTime();
    const matches=list(time,'subthemes').filter(sub=>sub?.logCodeId===id);
    if(!matches.length)throw Error('Deze taakcode is op dit apparaat nog niet bekend. Pas eerst de bijbehorende configuratie toe.');
    if(matches.length>1)throw Error('Deze taakcode is meerdere keren aan een subthema gekoppeld. Controleer eerst de configuratie.');
    const subtheme=matches[0];
    const theme=list(time,'themes').find(item=>String(item?.id)===String(subtheme.themeId));
    if(!theme)throw Error('Het bovenliggende thema van deze taak ontbreekt. Pas de bijbehorende configuratie opnieuw toe.');
    return {theme,subtheme};
  }

  function previewTask(payload){
    const ui=window.LogCardsUI;
    let resolved;
    try{resolved=resolveTask(payload.id);}catch(error){
      const panel=ui.sheet('Taak niet beschikbaar',`<p role="status">${esc(error.message)}</p><button class="btn full" data-log-task-close>Terug</button>`);
      panel.querySelector('[data-log-task-close]').onclick=()=>ui.close();
      return panel;
    }
    const panel=ui.sheet('Taak herkend',`<h3>${esc(resolved.theme.name||'Thema')}</h3><p>${esc(resolved.subtheme.name||'Subthema')}</p><button class="btn full cards-scan-action" data-log-task-start>Taak starten</button><p class="cards-notice">Log gebruikt de lokale thema- en subthema-identifiers. Controleer de registratie en bevestig daarna met Start.</p><p role="status" data-log-task-status></p>`);
    panel.querySelector('[data-log-task-start]').onclick=()=>{
      const button=panel.querySelector('[data-log-task-start]');
      if(button.disabled)return;
      button.disabled=true;
      try{
        const current=resolveTask(payload.id);
        if(!window.LogTimeModule?.prepareFromCode)throw Error('Tijd / taken is nog niet beschikbaar.');
        window.LogTimeModule.prepareFromCode({themeId:current.theme.id,subthemeId:current.subtheme.id,locationName:'',note:current.subtheme.name||''});
        ui.close();
      }catch(error){
        panel.querySelector('[data-log-task-status]').textContent=error.message;
        button.disabled=false;
      }
    };
    return panel;
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
        if(payload?.kind==='log-task')return previewTask(payload);
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

    window.LogExecutablePayloadBridge={resolveTask,executableCardPayload,augmentCard};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  install();
  window.addEventListener('pageshow',install);
})();