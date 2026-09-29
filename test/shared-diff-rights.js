(function(){
  'use strict';

  const KM='kmreg-test-v4-data';
  const TIME='urenregistratie.test.pwa.v1';
  const SHARE='log-test-sharing-v1';
  const PROVENANCE='log-test-shared-provenance-v1';
  const PUBLIC_BASE='https://sharon.life/log/config/';
  const PUBLISH='https://sharon.life/log/api/publish.php';
  const TYPES={location:'Locatie',card:'Kaart',theme:'Thema',subtheme:'Subthema',action:'Actie'};
  const COLLECTION={location:['km','locations'],card:['km','cards'],theme:['time','themes'],subtheme:['time','subthemes'],action:['time','locationActions']};
  const remoteCache=new Map();
  let lastRemoteId='',queued=false;

  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{12}$/.test(value);
  const read=(key,fallback={})=>{try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}};
  const list=(value,key)=>Array.isArray(value?.[key])?value[key]:[];
  const snapshots=()=>({km:read(KM,{}),time:read(TIME,{})});
  const sharing=()=>{const value=read(SHARE,{});return {key:String(value.key||''),roots:value.roots&&typeof value.roots==='object'?value.roots:{},published:value.published&&typeof value.published==='object'?value.published:{}};};
  const provenance=()=>{const value=read(PROVENANCE,{});return {configs:value.configs&&typeof value.configs==='object'?value.configs:{}};};

  function collection(type,s=snapshots()){
    const [store,key]=COLLECTION[type]||[];
    return store?list(s[store],key):[];
  }
  function rootItem(type,id,s=snapshots()){
    return collection(type,s).find(item=>String(item.id)===String(id))||null;
  }
  function bySource(type,configurationId,sourceId,s=snapshots()){
    return collection(type,s).find(item=>item?.sharedSource?.configurationId===configurationId&&String(item.sharedSource.sourceId)===String(sourceId))||null;
  }
  function sourceIdForLocal(type,localId,configurationId,s=snapshots()){
    if(localId==null||localId==='')return null;
    const item=collection(type,s).find(candidate=>String(candidate.id)===String(localId));
    if(item?.sharedSource?.configurationId===configurationId)return String(item.sharedSource.sourceId);
    return `local:${String(localId)}`;
  }
  function localName(type,localId,s=snapshots()){
    const item=collection(type,s).find(candidate=>String(candidate.id)===String(localId));
    return item?.name||String(localId||'');
  }
  function remoteName(doc,type,sourceId){
    const key={location:'locations',card:'cards',theme:'themes',subtheme:'subthemes',action:'actions'}[type];
    const item=doc?.objects?.[key]?.find(candidate=>String(candidate.id)===String(sourceId));
    return item?.name||String(sourceId||'');
  }
  function relationName(doc,type,value,configurationId,s=snapshots()){
    if(value==null||value==='')return '—';
    if(String(value).startsWith('local:'))return `${localName(type,String(value).slice(6),s)} (lokaal)`;
    return remoteName(doc,type,value)||String(value);
  }

  function saveRemote(doc){
    if(!doc||doc.kind!=='log-config'||!validId(doc.id))return;
    remoteCache.set(doc.id,doc);lastRemoteId=doc.id;
    const state=provenance(),incoming=doc.provenance&&typeof doc.provenance==='object'?doc.provenance:{};
    const originId=validId(incoming.originId)?incoming.originId:doc.id;
    const parentId=validId(incoming.parentId)?incoming.parentId:null;
    state.configs[doc.id]={
      originId,
      parentId,
      relation:incoming.relation==='derived'?'derived':'origin',
      receivedAt:new Date().toISOString(),
      type:String(doc.root?.type||''),
      title:String(doc.title||''),
      rights:doc.permissions&&typeof doc.permissions==='object'?doc.permissions:{canonicalUpdate:'owner-only',reshare:'derived-copy'}
    };
    write(PROVENANCE,state);sanitizeReceivedOwnership();queue();
  }

  function sanitizeReceivedOwnership(){
    const state=sharing(),s=snapshots();let changed=false;
    for(const type of ['location','card','theme','action']){
      for(const item of collection(type,s)){
        const source=item?.sharedSource;
        if(!source?.isRoot||!validId(source.configurationId))continue;
        const key=`${type}:${item.id}`,mapped=state.roots[key];
        if(mapped===source.configurationId&&!state.published[source.configurationId]){
          delete state.roots[key];changed=true;
        }
      }
    }
    if(changed)write(SHARE,state);
  }

  function rootForBundle(bundle,s=snapshots()){
    const type=String(bundle?.root?.type||''),sourceId=String(bundle?.root?.sourceId||'');
    return {type,item:rootItem(type,sourceId,s)};
  }
  function lineageFor(bundle){
    const {type,item}=rootForBundle(bundle),state=provenance();
    const parentId=item?.sharedSource?.configurationId;
    if(validId(parentId)&&bundle.id!==parentId){
      const parent=state.configs[parentId]||{};
      return {originId:validId(parent.originId)?parent.originId:parentId,parentId,relation:'derived'};
    }
    return {originId:bundle.id,parentId:null,relation:'origin'};
  }
  function canPublishCanonical(bundle){
    const {item}=rootForBundle(bundle);
    const sourceId=item?.sharedSource?.configurationId;
    if(!validId(sourceId)||bundle.id!==sourceId)return true;
    return !!sharing().published[sourceId];
  }

  function installFetchGuard(){
    if(window.fetch?.__logSharedRightsGuard)return;
    const nativeFetch=window.fetch.bind(window);
    const guarded=async function(input,init){
      const url=typeof input==='string'?input:input?.url||'';
      const method=String(init?.method||input?.method||'GET').toUpperCase();
      if(url===PUBLISH&&method==='POST'&&typeof init?.body==='string'){
        let bundle=null;try{bundle=JSON.parse(init.body);}catch(_){}
        if(bundle?.kind==='log-config'&&validId(bundle.id)){
          sanitizeReceivedOwnership();
          if(!canPublishCanonical(bundle)){
            return new Response(JSON.stringify({error:'Deze identifier hoort bij een ontvangen bron. Deel jouw versie als afgeleide kopie; de oorspronkelijke bron blijft bij de bronbeheerder.'}),{status:409,headers:{'Content-Type':'application/json'}});
          }
          bundle.provenance=lineageFor(bundle);
          bundle.permissions={canonicalUpdate:'owner-only',reshare:'derived-copy'};
          bundle.source={...(bundle.source||{}),lineagePolicy:'origin-owner-v1'};
          init={...init,body:JSON.stringify(bundle)};
        }
      }
      const response=await nativeFetch(input,init);
      if(method==='GET'&&response.ok&&url.startsWith(PUBLIC_BASE)&&/\.json(?:$|\?)/.test(url)){
        response.clone().json().then(saveRemote).catch(()=>{});
      }
      return response;
    };
    guarded.__logSharedRightsGuard=true;guarded.__native=nativeFetch;window.fetch=guarded;
  }

  const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
  const textValue=value=>{
    if(value==null||value==='')return '—';
    if(typeof value==='boolean')return value?'Ja':'Nee';
    if(Array.isArray(value))return value.length?value.join(', '):'—';
    if(typeof value==='object')return JSON.stringify(value);
    return String(value);
  };

  function remoteFlat(type,item,doc){
    if(type==='location')return {Naam:item.name,Adres:item.address||'',GPS:item.lat!=null&&item.lng!=null?`${item.lat}, ${item.lng}`:'',Type:item.type||'',Hoofdlocatie:item.parentId?remoteName(doc,'location',item.parentId):'',Straal:item.radius??'',Herkenningsstraal:item.recognitionRadius??''};
    if(type==='theme')return {Naam:item.name,Kleur:item.color||'',Meerekenen:item.includeInTotals!==false,Volgorde:item.order??''};
    if(type==='subtheme')return {Naam:item.name,Hoofdthema:item.themeId?remoteName(doc,'theme',item.themeId):'',Volgorde:item.order??''};
    if(type==='card'){
      let action='Geen';if(item.scanAction?.type==='location')action='Locatie';if(item.scanAction?.type==='task')action=`Taak · ${remoteName(doc,'theme',item.scanAction.themeId)}${item.scanAction.subthemeId?' › '+remoteName(doc,'subtheme',item.scanAction.subthemeId):''}`;
      return {Naam:item.name,Codetype:item.format,Inhoud:item.value,Kleur:item.color||'',Locatie:item.locationId?remoteName(doc,'location',item.locationId):'',Scanactie:action};
    }
    if(type==='action'){
      let target='';if(item.selection!=='smart'||item.type==='card'){if(item.type==='ride')target=remoteName(doc,'location',item.targetId);if(item.type==='card')target=remoteName(doc,'card',item.targetId);if(item.type==='task')target=`${remoteName(doc,'theme',item.targetId)}${item.subthemeId?' › '+remoteName(doc,'subtheme',item.subthemeId):''}`;}
      return {Naam:item.name,Actief:item.enabled!==false,Aanleiding:item.trigger==='qr'?'QR-code':'Locatie',Type:{ride:'Rit',task:'Taak',card:'Kaart'}[item.type]||item.type,Selectie:item.selection==='smart'?'Slim':'Vast',Locatie:item.locationId?remoteName(doc,'location',item.locationId):'',Doel:target,QR:item.logCodeId||'',Straal:item.radius??'',Herhaling:item.repeatMode||'',Wachttijd:item.repeatMinutes??'',Dagen:Array.isArray(item.days)?item.days:[],Tijdvak:item.start&&item.end?`${item.start} – ${item.end}`:''};
    }
    return {};
  }
  function localFlat(type,item,configurationId,doc,s=snapshots()){
    if(!item)return null;
    if(type==='location')return {Naam:item.name,Adres:item.address||'',GPS:item.lat!=null&&item.lng!=null?`${item.lat}, ${item.lng}`:'',Type:item.type||'',Hoofdlocatie:item.parentId?relationName(doc,'location',sourceIdForLocal('location',item.parentId,configurationId,s),configurationId,s):'',Straal:item.radius??'',Herkenningsstraal:item.recognitionRadius??''};
    if(type==='theme')return {Naam:item.name,Kleur:item.color||'',Meerekenen:item.includeInTotals!==false,Volgorde:item.order??''};
    if(type==='subtheme')return {Naam:item.name,Hoofdthema:item.themeId?relationName(doc,'theme',sourceIdForLocal('theme',item.themeId,configurationId,s),configurationId,s):'',Volgorde:item.order??''};
    if(type==='card'){
      let action='Geen';if(item.scanAction?.type==='location')action='Locatie';if(item.scanAction?.type==='task'){const theme=sourceIdForLocal('theme',item.scanAction.themeId,configurationId,s),sub=item.scanAction.subthemeId?sourceIdForLocal('subtheme',item.scanAction.subthemeId,configurationId,s):null;action=`Taak · ${relationName(doc,'theme',theme,configurationId,s)}${sub?' › '+relationName(doc,'subtheme',sub,configurationId,s):''}`;}
      return {Naam:item.name,Codetype:item.format,Inhoud:item.value,Kleur:item.color||'',Locatie:item.locationId?relationName(doc,'location',sourceIdForLocal('location',item.locationId,configurationId,s),configurationId,s):'',Scanactie:action};
    }
    if(type==='action'){
      let target='';if(item.selection!=='smart'||item.type==='card'){if(item.type==='ride')target=relationName(doc,'location',sourceIdForLocal('location',item.targetId,configurationId,s),configurationId,s);if(item.type==='card')target=relationName(doc,'card',sourceIdForLocal('card',item.targetId,configurationId,s),configurationId,s);if(item.type==='task'){const theme=sourceIdForLocal('theme',item.targetId,configurationId,s),sub=item.subthemeId?sourceIdForLocal('subtheme',item.subthemeId,configurationId,s):null;target=`${relationName(doc,'theme',theme,configurationId,s)}${sub?' › '+relationName(doc,'subtheme',sub,configurationId,s):''}`;}}
      return {Naam:item.name,Actief:item.enabled!==false,Aanleiding:item.trigger==='qr'?'QR-code':'Locatie',Type:{ride:'Rit',task:'Taak',card:'Kaart'}[item.type]||item.type,Selectie:item.selection==='smart'?'Slim':'Vast',Locatie:item.locationId?relationName(doc,'location',sourceIdForLocal('location',item.locationId,configurationId,s),configurationId,s):'',Doel:target,QR:item.logCodeId||'',Straal:item.radius??'',Herhaling:item.repeatMode||'',Wachttijd:item.repeatMinutes??'',Dagen:Array.isArray(item.days)?item.days:[],Tijdvak:item.start&&item.end?`${item.start} – ${item.end}`:''};
    }
    return {};
  }

  function diffRows(doc){
    const s=snapshots(),rows=[];
    const groups=[['location','locations'],['theme','themes'],['subtheme','subthemes'],['card','cards'],['action','actions']];
    for(const [type,key] of groups){
      const remoteItems=Array.isArray(doc.objects?.[key])?doc.objects[key]:[];
      for(const remote of remoteItems){
        const local=bySource(type,doc.id,remote.id,s)||(doc.root?.type===type&&String(doc.root.sourceId)===String(remote.id)?rootItem(type,doc.id,s):null);
        const r=remoteFlat(type,remote,doc),l=localFlat(type,local,doc.id,doc,s);
        const objectName=`${TYPES[type]} · ${remote.name||remote.id}`;
        if(!local){rows.push({object:objectName,field:'Object',local:'Niet aanwezig',remote:'Aanwezig'});continue;}
        for(const field of Object.keys(r))if(!same(l?.[field],r[field]))rows.push({object:objectName,field,local:textValue(l?.[field]),remote:textValue(r[field])});
      }
    }
    return rows;
  }

  function diffMarkup(doc){
    const rows=diffRows(doc);
    if(!rows.length)return '<section class="log-shared-diff"><h4>Verschillen</h4><p class="hint">Geen inhoudelijke verschillen gevonden.</p></section>';
    const shown=rows.slice(0,40),extra=rows.length-shown.length;
    return `<section class="log-shared-diff"><h4>Verschillen</h4><p class="hint">Vergelijk je lokale versie met de versie uit de gedeelde bron.</p><div class="log-shared-diff-head"><span>Onderdeel</span><span>Mijn versie</span><span>Bronversie</span></div>${shown.map(row=>`<div class="log-shared-diff-row"><div><strong>${esc(row.field)}</strong><small>${esc(row.object)}</small></div><div>${esc(row.local)}</div><div>${esc(row.remote)}</div></div>`).join('')}${extra>0?`<p class="hint">Nog ${extra} verschillen niet weergegeven.</p>`:''}</section>`;
  }

  function dialogConfigId(dialog){
    const code=dialog?.querySelector('code')?.textContent?.trim();
    if(validId(code))return code;
    return validId(lastRemoteId)?lastRemoteId:'';
  }
  function rightsText(id){
    const doc=remoteCache.get(id),p=provenance().configs[id]||{};
    const origin=validId(p.originId)?p.originId:id,parent=validId(p.parentId)?p.parentId:null;
    if(parent)return `Deze bron is afgeleid van ${origin}. De huidige publicatie komt via ${parent}. Alleen de beheerder van een bronidentifier hoort diezelfde identifier bij te werken.`;
    return `Deze identifier is de bronidentiteit. Ontvangers mogen hun lokale versie aanpassen en verder delen, maar Log maakt daarvan een nieuwe afgeleide identifier zodat deze bron intact blijft.`;
  }
  function augmentUpdateDialog(){
    const button=document.querySelector('dialog[open] [data-shared-import],.modal:not([hidden]) [data-shared-import]');
    if(!button)return;
    const dialog=button.closest('dialog,.modal-panel')||button.parentElement,id=dialogConfigId(dialog),doc=remoteCache.get(id);
    if(!doc||dialog.querySelector('[data-shared-diff-view]'))return;
    const current=dialog.querySelector('[data-shared-open-current]');
    if(!current)return;
    const wrap=document.createElement('div');wrap.dataset.sharedDiffView='1';wrap.innerHTML=`${diffMarkup(doc)}<div class="log-shared-rights-note"><strong>Herkomst en delen</strong><p>${esc(rightsText(id))}</p></div>`;
    button.before(wrap);
    button.textContent='Bronversie gebruiken';
    current.textContent='Mijn versie behouden';
  }

  function ownershipNote(type,id){
    const s=snapshots(),item=rootItem(type,id,s),state=sharing();
    if(!item)return '';
    const source=item.sharedSource?.configurationId,key=`${type}:${id}`,mapped=state.roots[key];
    if(validId(source)){
      if(mapped&&mapped!==source&&state.published[mapped])return `Afgeleide publicatie · jouw versie gebruikt ${mapped}; oorspronkelijke bron ${source} blijft ongewijzigd.`;
      return `Ontvangen bron ${source} · delen maakt een nieuwe afgeleide identifier. De oorspronkelijke bron wordt niet overschreven.`;
    }
    if(mapped&&state.published[mapped])return `Eigen bron · opnieuw delen werkt dezelfde identifier ${mapped} bij.`;
    return 'Nog niet gepubliceerd · bij de eerste publicatie krijgt dit object een eigen identifier.';
  }
  function augmentShareStrips(){
    sanitizeReceivedOwnership();
    document.querySelectorAll('.log-share-strip[data-share-type]').forEach(strip=>{
      const type=strip.dataset.shareType,select=strip.querySelector('[data-share-select]');if(!select)return;
      let note=strip.querySelector('[data-share-rights-note]');if(!note){note=document.createElement('div');note.dataset.shareRightsNote='1';note.className='log-share-rights-inline';strip.appendChild(note);}
      const value=ownershipNote(type,select.value);if(note.textContent!==value)note.textContent=value;
      if(select.dataset.sharedRightsBound!=='1'){
        select.dataset.sharedRightsBound='1';select.addEventListener('change',()=>setTimeout(augmentShareStrips,0));
      }
    });
  }

  function installStyles(){
    if(document.getElementById('logSharedDiffRightsStyle'))return;
    const style=document.createElement('style');style.id='logSharedDiffRightsStyle';style.textContent=`
      .log-shared-diff{margin:14px 0;padding:12px;border:.5px solid var(--line);border-radius:13px;background:color-mix(in srgb,var(--card) 94%,transparent)}
      .log-shared-diff h4{margin:0 0 4px;font-size:15px}.log-shared-diff-head,.log-shared-diff-row{display:grid;grid-template-columns:minmax(92px,.9fr) minmax(0,1fr) minmax(0,1fr);gap:7px;align-items:start}
      .log-shared-diff-head{margin-top:10px;padding:0 6px 5px;color:var(--muted);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
      .log-shared-diff-row{padding:9px 6px;border-top:.5px solid var(--line);font-size:11px;line-height:1.35;overflow-wrap:anywhere}.log-shared-diff-row strong,.log-shared-diff-row small{display:block}.log-shared-diff-row small{margin-top:2px;color:var(--muted);font-size:9px}
      .log-shared-diff-row>div:nth-child(3){color:var(--accent)}.log-shared-rights-note{margin:10px 0 14px;padding:11px 12px;border:.5px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--accent) 6%,transparent);font-size:11px;line-height:1.45}.log-shared-rights-note strong{display:block;margin-bottom:3px}.log-shared-rights-note p{margin:0;color:var(--muted)}
      .log-share-rights-inline{grid-column:1/-1;margin-top:-2px;color:var(--muted);font-size:10px;line-height:1.35}
      @media(max-width:520px){.log-shared-diff-head,.log-shared-diff-row{grid-template-columns:86px minmax(0,1fr) minmax(0,1fr);gap:5px}.log-shared-diff-row{padding-left:2px;padding-right:2px;font-size:10px}}
    `;document.head.appendChild(style);
  }

  function queue(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;sanitizeReceivedOwnership();augmentUpdateDialog();augmentShareStrips();});}
  function init(){
    installFetchGuard();installStyles();sanitizeReceivedOwnership();queue();
    const observer=new MutationObserver(queue);observer.observe(document.body,{childList:true,subtree:true});
    for(const event of ['log-km-state-change','log-time-state-change','log-shell-view-refresh','log-shared-config-update-state'])window.addEventListener(event,queue);
    window.addEventListener('pageshow',queue);
  }

  window.LogSharedRights={sanitize:sanitizeReceivedOwnership,diffRows,provenance:()=>provenance().configs,ownershipNote};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();