(function(){
  'use strict';

  const KM='kmreg-test-v4-data';
  const TIME='urenregistratie.test.pwa.v1';
  const STORE='log-test-sharing-v1';
  const ENDPOINT='https://sharon.life/log/api/publish.php';
  const PUBLIC_BASE='https://sharon.life/log/config/';
  const TYPES={location:'Locatie',card:'Kaart',theme:'Thema',action:'Actie'};
  const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let observer=null,augmentQueued=false,activePublish=false;

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=value=>JSON.parse(JSON.stringify(value));
  const readJson=(key,fallback={})=>{try{const x=JSON.parse(localStorage.getItem(key)||'null');return x&&typeof x==='object'?x:fallback;}catch(_){return fallback;}};
  const state=()=>{const x=readJson(STORE,{});return {key:String(x.key||''),roots:x.roots&&typeof x.roots==='object'?x.roots:{},published:x.published&&typeof x.published==='object'?x.published:{}};};
  const saveState=value=>localStorage.setItem(STORE,JSON.stringify(value));

  function randomId(){
    const bytes=new Uint8Array(12);
    if(globalThis.crypto?.getRandomValues)crypto.getRandomValues(bytes);else for(let i=0;i<12;i++)bytes[i]=Math.floor(Math.random()*256);
    return Array.from(bytes,b=>ALPHABET[b&63]).join('');
  }
  function configId(type,id){
    const s=state(),key=`${type}:${id}`;
    if(/^[A-Za-z0-9_-]{12}$/.test(s.roots[key]||''))return s.roots[key];
    const used=new Set(Object.values(s.roots));let next=randomId();while(used.has(next))next=randomId();
    s.roots[key]=next;saveState(s);return next;
  }
  function snapshots(){
    const km=readJson(KM,{}),time=readJson(TIME,{});
    return {
      km,
      time,
      locations:Array.isArray(km.locations)?km.locations:[],
      cards:Array.isArray(km.cards)?km.cards:[],
      themes:Array.isArray(time.themes)?time.themes:[],
      subthemes:Array.isArray(time.subthemes)?time.subthemes:[],
      actions:Array.isArray(time.locationActions)?time.locationActions:[]
    };
  }
  function pick(source,keys){const out={};for(const key of keys)if(source?.[key]!==undefined)out[key]=clone(source[key]);return out;}
  function publicLocation(item){return pick(item,['id','name','address','lat','lng','type','parentId','radius','recognitionRadius']);}
  function publicTheme(item){return pick(item,['id','name','color','includeInTotals','order']);}
  function publicSubtheme(item){return pick(item,['id','themeId','name','order']);}
  function publicCard(item){return pick(item,['id','name','format','value','color','locationId','scanAction','createdAt','updatedAt']);}
  function publicAction(item){return pick(item,['id','name','enabled','trigger','logCodeId','locationId','radius','type','selection','targetId','subthemeId','repeatMode','repeatMinutes','days','start','end']);}

  function title(type,id,s){
    if(type==='location')return s.locations.find(x=>String(x.id)===String(id))?.name||'Locatie';
    if(type==='card')return s.cards.find(x=>String(x.id)===String(id))?.name||'Kaart';
    if(type==='theme')return s.themes.find(x=>String(x.id)===String(id))?.name||'Thema';
    if(type==='action')return s.actions.find(x=>String(x.id)===String(id))?.name||'Actie';
    return 'Configuratie';
  }
  function buildBundle(type,id){
    const s=snapshots(),found={locations:new Map(),themes:new Map(),subthemes:new Map(),cards:new Map(),actions:new Map()};
    const addLocation=locationId=>{
      if(!locationId||found.locations.has(String(locationId)))return;
      const item=s.locations.find(x=>String(x.id)===String(locationId));if(!item)return;
      if(item.parentId)addLocation(item.parentId);
      found.locations.set(String(item.id),publicLocation(item));
    };
    const addTheme=(themeId,includeAllSubs=true,onlySubId='')=>{
      if(!themeId)return;
      const theme=s.themes.find(x=>String(x.id)===String(themeId));if(theme&&!found.themes.has(String(theme.id)))found.themes.set(String(theme.id),publicTheme(theme));
      const subs=s.subthemes.filter(x=>String(x.themeId)===String(themeId)&&(includeAllSubs||!onlySubId||String(x.id)===String(onlySubId)));
      subs.forEach(sub=>found.subthemes.set(String(sub.id),publicSubtheme(sub)));
    };
    const addCard=cardId=>{
      if(!cardId||found.cards.has(String(cardId)))return;
      const card=s.cards.find(x=>String(x.id)===String(cardId));if(!card)return;
      found.cards.set(String(card.id),publicCard(card));
      addLocation(card.locationId);
      const action=card.scanAction||{};if(action.type==='task'&&action.themeId)addTheme(action.themeId,!action.subthemeId,action.subthemeId||'');
    };
    const addAction=actionId=>{
      if(!actionId||found.actions.has(String(actionId)))return;
      const action=s.actions.find(x=>String(x.id)===String(actionId));if(!action)return;
      found.actions.set(String(action.id),publicAction(action));
      if(action.trigger!=='qr')addLocation(action.locationId);
      if(action.selection!=='smart'){
        if(action.type==='ride')addLocation(action.targetId);
        if(action.type==='card')addCard(action.targetId);
        if(action.type==='task')addTheme(action.targetId,!action.subthemeId,action.subthemeId||'');
      }
    };

    if(type==='location')addLocation(id);
    else if(type==='card')addCard(id);
    else if(type==='theme')addTheme(id,true);
    else if(type==='action')addAction(id);
    else throw new Error('Onbekend deeltype.');

    const rootExists={location:found.locations,card:found.cards,theme:found.themes,action:found.actions}[type]?.has(String(id));
    if(!rootExists)throw new Error(`${TYPES[type]||'Item'} niet gevonden.`);
    const identifier=configId(type,id),exportedAt=new Date().toISOString();
    return {
      schema:'https://sharon.life/log/config/v1',
      kind:'log-config',
      id:identifier,
      title:title(type,id,s),
      root:{type,sourceId:String(id)},
      exportedAt,
      source:{app:'Log',build:String(window.LOG_TEST_BUILD||'0.34.5')},
      objects:{
        locations:[...found.locations.values()],
        themes:[...found.themes.values()],
        subthemes:[...found.subthemes.values()],
        cards:[...found.cards.values()],
        actions:[...found.actions.values()]
      }
    };
  }

  function removeDialog(){document.querySelectorAll('.log-share-dialog').forEach(x=>x.remove());}
  function dialog(title,body){
    removeDialog();const d=document.createElement('dialog');d.className='log-share-dialog';d.innerHTML=`<header><h2>${esc(title)}</h2><button type="button" data-share-close aria-label="Sluiten">×</button></header><div class="log-share-dialog-body">${body}</div>`;
    document.body.appendChild(d);d.querySelector('[data-share-close]').onclick=()=>d.remove();d.addEventListener('cancel',e=>{e.preventDefault();d.remove();});d.addEventListener('click',e=>{if(e.target===d)d.remove();});d.showModal();return d;
  }
  function keyDialog(){
    return new Promise(resolve=>{
      const d=dialog('sharon.life koppelen',`<p>Voer eenmalig de publicatiesleutel in. Deze blijft alleen in de lokale opslag van deze Log-installatie staan.</p><label class="log-share-field">Publicatiesleutel<input type="password" autocomplete="off" data-share-key></label><p class="log-share-status" data-share-key-status></p><div class="log-share-actions"><button type="button" class="btn secondary" data-share-cancel>Annuleren</button><button type="button" class="btn" data-share-save>Bewaren</button></div>`);
      const finish=value=>{d.remove();resolve(value);};
      d.querySelector('[data-share-cancel]').onclick=()=>finish('');
      d.querySelector('[data-share-save]').onclick=()=>{const value=d.querySelector('[data-share-key]').value.trim();if(value.length<16){d.querySelector('[data-share-key-status]').textContent='Gebruik de sleutel uit het serverbestand (minimaal 16 tekens).';return;}const s=state();s.key=value;saveState(s);finish(value);};
      d.querySelector('[data-share-key]').focus();
    });
  }
  async function ensureKey(){const current=state().key;return current||await keyDialog();}
  async function copy(text){try{await navigator.clipboard.writeText(text);return true;}catch(_){return false;}}
  function showResult(bundle,result){
    const url=result.url||`${PUBLIC_BASE}${bundle.id}.json`,revision=result.revision||1;
    const d=dialog('Gepubliceerd',`<p><strong>${esc(bundle.title)}</strong> staat op sharon.life.</p><div class="log-share-id">${esc(bundle.id)}</div><p class="log-share-status">Revisie ${esc(revision)} · ${esc(TYPES[bundle.root.type]||bundle.root.type)}</p><div class="log-share-actions"><button type="button" class="btn secondary" data-copy-id>Identifier kopiëren</button><button type="button" class="btn" data-copy-url>Link kopiëren</button></div><p class="log-share-status" data-copy-status>${esc(url)}</p>`);
    d.querySelector('[data-copy-id]').onclick=async()=>{d.querySelector('[data-copy-status]').textContent=await copy(bundle.id)?'Identifier gekopieerd.':bundle.id;};
    d.querySelector('[data-copy-url]').onclick=async()=>{d.querySelector('[data-copy-status]').textContent=await copy(url)?'Link gekopieerd.':url;};
  }
  async function publish(type,id,button){
    if(activePublish)return;activePublish=true;const old=button?.textContent;
    try{
      const key=await ensureKey();if(!key)return;
      if(button){button.disabled=true;button.textContent='Publiceren…';}
      const bundle=buildBundle(type,id);
      const response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','X-Log-Publish-Key':key,'Accept':'application/json'},body:JSON.stringify(bundle)});
      let result={};try{result=await response.json();}catch(_){}
      if(response.status===401||response.status===403){const s=state();s.key='';saveState(s);throw new Error('Publicatiesleutel geweigerd. Tik opnieuw op Delen en voer de juiste sleutel in.');}
      if(!response.ok)throw new Error(result.error||`Publiceren mislukt (${response.status}).`);
      const s=state();s.published[bundle.id]={url:result.url||`${PUBLIC_BASE}${bundle.id}.json`,revision:Number(result.revision)||1,publishedAt:new Date().toISOString(),type,id:String(id)};saveState(s);
      showResult(bundle,result);
    }catch(error){dialog('Publiceren niet gelukt',`<p>${esc(error.message||'Onbekende fout.')}</p><p class="log-share-status">Bestaande gegevens in Log zijn niet gewijzigd.</p>`);}
    finally{activePublish=false;if(button){button.disabled=false;button.textContent=old||'Delen';}}
  }

  function optionLabel(type,item,s){
    if(type==='location'){
      const parent=item.parentId?s.locations.find(x=>String(x.id)===String(item.parentId)):null;return parent?`${parent.name} › ${item.name}`:item.name;
    }
    return item.name||item.title||item.id;
  }
  function items(type,s){
    if(type==='location')return s.locations;
    if(type==='card')return s.cards;
    if(type==='theme')return s.themes.filter(x=>x?.archived!==true);
    if(type==='action')return s.actions;
    return [];
  }
  function mountStrip(host,type,anchor){
    if(!host||host.querySelector(`.log-share-strip[data-share-type="${type}"]`))return;
    const s=snapshots(),list=items(type,s);if(!list.length)return;
    const strip=document.createElement('div');strip.className='log-share-strip';strip.dataset.shareType=type;
    strip.innerHTML=`<label><span>Delen via sharon.life</span><select data-share-select>${list.map(item=>`<option value="${esc(item.id)}">${esc(optionLabel(type,item,s))}</option>`).join('')}</select></label><button type="button" data-share-publish>Delen</button>`;
    if(anchor)anchor.insertAdjacentElement('afterend',strip);else host.prepend(strip);
    strip.querySelector('[data-share-publish]').onclick=()=>{const id=strip.querySelector('[data-share-select]').value;if(id)publish(type,id,strip.querySelector('[data-share-publish]'));};
  }
  function syncStrip(strip,type){
    const s=snapshots(),list=items(type,s),select=strip.querySelector('[data-share-select]'),current=select?.value||'';if(!select)return;
    const signature=JSON.stringify(list.map(item=>[item.id,item.name,item.parentId||'']));if(strip.dataset.signature===signature)return;
    select.innerHTML=list.map(item=>`<option value="${esc(item.id)}">${esc(optionLabel(type,item,s))}</option>`).join('');strip.dataset.signature=signature;if(list.some(x=>String(x.id)===current))select.value=current;
  }
  function augment(){
    augmentQueued=false;
    const locations=$('#kmShellLocationsView');if(locations){const anchor=$('.km-shell-location-actions',locations);mountStrip(locations,'location',anchor);}
    const themes=$('#kmShellThemesView');if(themes){const anchor=$('.km-shell-theme-create',themes);mountStrip(themes,'theme',anchor);}
    const cards=$('.cards-module [data-cards-list]')?.closest('.cards-module');if(cards){const anchor=$('.cards-actions',cards);mountStrip(cards,'card',anchor);}
    const actionNew=$('[data-la-new]');if(actionNew){const module=actionNew.closest('.cards-module');mountStrip(module,'action',actionNew);}
    $$('.log-share-strip').forEach(strip=>syncStrip(strip,strip.dataset.shareType));
  }
  function queueAugment(){if(augmentQueued)return;augmentQueued=true;requestAnimationFrame(augment);}
  function installStyles(){
    if($('#logShareStyle'))return;const style=document.createElement('style');style.id='logShareStyle';style.textContent=`
      .log-share-strip{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px;margin:9px 0 13px;padding:11px 12px;border:.5px solid var(--line);border-radius:13px;background:color-mix(in srgb,var(--accent) 6%,var(--card))}
      .log-share-strip label{display:block;min-width:0}.log-share-strip label span{display:block;margin:0 0 5px;color:var(--muted);font-size:10px;font-weight:760}.log-share-strip select{width:100%;min-height:38px;padding:7px 28px 7px 9px;border:.5px solid var(--line);border-radius:10px;background:var(--card2);color:var(--text);font:inherit;font-size:12px}.log-share-strip button{min-height:38px;padding:8px 13px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-size:12px;font-weight:800}.log-share-strip button:disabled{opacity:.55}
      .log-share-dialog{width:min(calc(100% - 28px),520px);padding:0;border:1px solid var(--line);border-radius:20px;background:var(--bg);color:var(--text);box-shadow:0 22px 64px rgba(0,0,0,.42)}.log-share-dialog::backdrop{background:rgba(0,0,0,.48)}.log-share-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;border-bottom:1px solid var(--line)}.log-share-dialog h2{margin:0;font-size:19px}.log-share-dialog header button{width:36px;height:36px;border:0;border-radius:50%;background:var(--card2);color:var(--text);font-size:22px}.log-share-dialog-body{padding:16px}.log-share-dialog-body p{line-height:1.45}.log-share-field{display:block;margin:12px 0}.log-share-field input{width:100%;margin-top:6px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--card2);color:var(--text);font:inherit}.log-share-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.log-share-status{color:var(--muted);font-size:11px;overflow-wrap:anywhere}.log-share-id{padding:13px;border:1px solid var(--line);border-radius:12px;background:var(--card2);font-family:"SFMono-Regular",Consolas,monospace;font-size:22px;font-weight:800;text-align:center;letter-spacing:.04em}
      @media(max-width:520px){.log-share-strip{grid-template-columns:1fr}.log-share-strip button{width:100%}}
    `;document.head.appendChild(style);
  }
  function init(){
    installStyles();queueAugment();
    observer=new MutationObserver(queueAugment);observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('log-km-state-change',queueAugment);window.addEventListener('log-time-state-change',queueAugment);window.addEventListener('log-shell-view-refresh',queueAugment);
    window.LogSharing={publish,buildBundle,state,clearKey(){const s=state();s.key='';saveState(s);},endpoint:ENDPOINT,publicBase:PUBLIC_BASE};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
