(function(){
  'use strict';

  const STORE='log-test-sharing-v1';
  const PUBLIC_BASE='https://sharon.life/log/config/';
  const TYPES={location:'Locatie',card:'Kaart',theme:'Thema',action:'Actie'};
  let settingsObserver=null;
  let busy=false;

  const $=(selector,root=document)=>root.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function rawState(){
    try{
      const value=JSON.parse(localStorage.getItem(STORE)||'{}');
      return value&&typeof value==='object'?value:{};
    }catch(_){return {};}
  }
  function saveRaw(value){localStorage.setItem(STORE,JSON.stringify(value));}
  function enabled(){
    const value=rawState();
    if(value.enabled===false)return false;
    return Boolean(String(value.key||'').trim());
  }
  function setEnabled(value,key=''){
    const current=rawState();
    current.enabled=Boolean(value);
    current.key=value?String(key||current.key||'').trim():'';
    saveRaw(current);
    syncSettings();
  }
  function currentIdentifier(type,id){
    const value=rawState().roots?.[`${type}:${id}`];
    return /^[A-Za-z0-9_-]{12}$/.test(value||'')?value:'';
  }
  function published(type,id){
    const identifier=currentIdentifier(type,id);
    return identifier?rawState().published?.[identifier]||null:null;
  }
  function resolveSurface(surface){
    if(!surface)return null;
    if(surface.matches('.code-card-surface')){
      const row=surface.closest('.code-card-swipe');
      if(!row)return null;
      const action=row.querySelector('[data-la-open]');
      if(action)return{type:'action',id:String(action.dataset.laOpen||''),surface,row};
      if(row.hasAttribute('data-person-row'))return null;
      const card=row.querySelector('[data-card-open]');
      if(card)return{type:'card',id:String(card.dataset.cardOpen||''),surface,row};
      return null;
    }
    if(surface.matches('.km-shell-location-swipe-surface')){
      const row=surface.closest('.km-shell-location-swipe-row,[data-shell-location-swipe]');
      const id=row?.dataset.shellLocationSwipe||row?.querySelector?.('[data-shell-location-swipe-action]')?.closest?.('[data-shell-location-swipe]')?.dataset.shellLocationSwipe||'';
      return id?{type:'location',id:String(id),surface,row}:null;
    }
    if(surface.matches('.km-shell-theme-swipe-surface')){
      const row=surface.closest('[data-shell-theme-swipe]');
      if(!row||row.dataset.shellThemeType==='subtheme')return null;
      const id=row.dataset.shellThemeSwipe||'';
      return id?{type:'theme',id:String(id),surface,row}:null;
    }
    return null;
  }
  function canShare(surface){return enabled()&&Boolean(resolveSurface(surface));}

  function closeDialog(){
    document.querySelectorAll('.log-public-dialog').forEach(item=>{try{item.close();}catch(_){}item.remove();});
    document.body.classList.remove('cards-dialog-open');
  }
  function dialog(title,body){
    closeDialog();
    const d=document.createElement('dialog');
    d.className='log-public-dialog';
    d.innerHTML=`<header><h2>${esc(title)}</h2><button type="button" data-public-close aria-label="Sluiten">×</button></header><div class="log-public-dialog-body">${body}</div>`;
    document.body.appendChild(d);
    const close=()=>closeDialog();
    d.querySelector('[data-public-close]').onclick=close;
    d.addEventListener('cancel',event=>{event.preventDefault();close();});
    d.addEventListener('click',event=>{if(event.target===d)close();});
    document.body.classList.add('cards-dialog-open');
    d.showModal();
    return d;
  }
  function askKey(){
    return new Promise(resolve=>{
      const d=dialog('Publiek koppelen',`<p>Voer de publicatiesleutel in om Log aan de publieke opslag te koppelen.</p><label class="log-public-field"><span>Publicatiesleutel</span><input type="password" autocomplete="off" data-public-key></label><p class="log-public-note" data-public-key-status>De sleutel blijft alleen op dit apparaat in Log bewaard.</p><div class="log-public-actions"><button type="button" class="btn secondary" data-public-cancel>Annuleren</button><button type="button" class="btn" data-public-save>Koppelen</button></div>`);
      let finished=false;
      const finish=value=>{if(finished)return;finished=true;closeDialog();resolve(value);};
      d.querySelector('[data-public-close]').onclick=()=>finish('');
      d.querySelector('[data-public-cancel]').onclick=()=>finish('');
      d.addEventListener('cancel',event=>{event.preventDefault();finish('');});
      d.querySelector('[data-public-save]').onclick=()=>{
        const value=d.querySelector('[data-public-key]').value.trim();
        if(value.length<16){d.querySelector('[data-public-key-status]').textContent='De sleutel is niet volledig. Gebruik de publicatiesleutel van sharon.life.';return;}
        finish(value);
      };
      d.querySelector('[data-public-key]').focus();
    });
  }

  function canonical(bundle){return JSON.stringify({schema:bundle.schema,kind:bundle.kind,title:bundle.title,root:bundle.root,objects:bundle.objects});}
  function remoteCanonical(remote){return JSON.stringify({schema:remote?.schema,kind:remote?.kind,title:remote?.title,root:remote?.root,objects:remote?.objects});}
  function storeSignature(identifier,signature){
    const current=rawState();
    if(!current.published?.[identifier])return;
    current.published[identifier].signature=signature;
    saveRaw(current);
  }
  async function compareStatus(type,id,bundle,info){
    const local=canonical(bundle);
    if(info?.signature)return{state:info.signature===local?'current':'changed',local};
    const url=info?.url||`${PUBLIC_BASE}${bundle.id}.json`;
    try{
      const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(String(response.status));
      const remote=await response.json();
      const signature=remoteCanonical(remote);
      storeSignature(bundle.id,signature);
      return{state:signature===local?'current':'changed',local};
    }catch(_){return{state:'unknown',local};}
  }
  function qrSvg(value){
    if(typeof window.qrcode!=='function')return'<div class="log-public-qr-fallback">QR-code niet beschikbaar</div>';
    try{
      const qr=window.qrcode(0,'M');
      window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));
      qr.addData(value,'Byte');qr.make();
      return qr.createSvgTag({cellSize:5,margin:12,scalable:true});
    }catch(_){return'<div class="log-public-qr-fallback">QR-code kon niet worden gemaakt</div>';}
  }
  async function copy(text){try{await navigator.clipboard.writeText(text);return true;}catch(_){return false;}}

  async function publish(type,id){
    if(busy||!enabled()||!window.LogSharing)return false;
    busy=true;
    try{
      const bundle=window.LogSharing.buildBundle(type,id);
      const before=Number(published(type,id)?.revision)||0;
      const progress=dialog('Publiceren','<div class="log-public-progress"><span></span><p>Gegevens worden gepubliceerd…</p></div>');
      await window.LogSharing.publish(type,id,null);
      document.querySelectorAll('.log-share-dialog').forEach(item=>item.remove());
      if(progress.isConnected)closeDialog();
      const current=rawState();
      if(!String(current.key||'').trim()){current.enabled=false;saveRaw(current);syncSettings();return false;}
      const info=current.published?.[bundle.id];
      const after=Number(info?.revision)||0;
      if(!info||after<=before){dialog('Publiceren niet gelukt','<p>De server heeft geen nieuwe revisie bevestigd. Probeer het opnieuw.</p>');return false;}
      info.signature=canonical(bundle);
      current.published[bundle.id]=info;
      saveRaw(current);
      return true;
    }catch(error){
      document.querySelectorAll('.log-share-dialog').forEach(item=>item.remove());
      dialog('Publiceren niet gelukt',`<p>${esc(error?.message||'Onbekende fout.')}</p>`);
      return false;
    }finally{busy=false;}
  }

  async function showStatus(type,id){
    if(!enabled())return;
    let bundle;
    try{bundle=window.LogSharing?.buildBundle(type,id);}catch(error){dialog('Delen niet mogelijk',`<p>${esc(error?.message||'Dit item kan niet worden gedeeld.')}</p>`);return;}
    let info=published(type,id);
    if(!info){
      const d=dialog(`${TYPES[type]||'Item'} delen`,`<p><strong>${esc(bundle.title)}</strong> is nog niet publiek gedeeld.</p><p class="log-public-note">Publiceer dit item om een vaste identifier en QR-code te maken.</p><div class="log-public-actions one"><button type="button" class="btn" data-public-first>Publiceren</button></div>`);
      d.querySelector('[data-public-first]').onclick=async()=>{if(await publish(type,id))showStatus(type,id);};
      return;
    }
    const status=await compareStatus(type,id,bundle,info);
    info=published(type,id)||info;
    const url=info.url||`${PUBLIC_BASE}${bundle.id}.json`;
    const statusText=status.state==='current'?'Actueel':status.state==='changed'?'Wijzigingen klaar om te publiceren':'Vergelijking nog niet beschikbaar';
    const statusClass=status.state==='current'?'current':status.state==='changed'?'changed':'unknown';
    const updateButton=status.state==='current'?'':`<button type="button" class="btn" data-public-update>${status.state==='changed'?'Update publiceren':'Opnieuw publiceren'}</button>`;
    const d=dialog(bundle.title,`<div class="log-public-qr">${qrSvg(url)}</div><div class="log-public-identifier">${esc(bundle.id)}</div><div class="log-public-meta"><span>Revisie ${Number(info.revision)||1}</span><span class="log-public-badge ${statusClass}">${esc(statusText)}</span></div><p class="log-public-note">Scan deze QR-code met een ander apparaat om deze publieke configuratie te openen.</p><div class="log-public-actions"><button type="button" class="btn secondary" data-public-copy>Link kopiëren</button>${updateButton}</div>`);
    d.querySelector('[data-public-copy]').onclick=async event=>{event.currentTarget.textContent=await copy(url)?'Gekopieerd':'Kopiëren mislukt';};
    const update=d.querySelector('[data-public-update]');
    if(update)update.onclick=async()=>{if(await publish(type,id))showStatus(type,id);};
  }

  async function shareFromSurface(surface){
    const target=resolveSurface(surface);
    if(!target||!enabled())return false;
    if(published(target.type,target.id))await showStatus(target.type,target.id);
    else if(await publish(target.type,target.id))await showStatus(target.type,target.id);
    return true;
  }

  function settingsMarkup(){
    return `<details class="km-shell-settings-accordion" id="kmShellPublicSettings"><summary><span class="km-shell-settings-accordion-title"><strong>Publiek</strong><small>Extern delen alleen na koppelen</small></span><span class="km-shell-settings-accordion-arrow">›</span></summary><div class="km-shell-settings-accordion-body"><label class="log-public-setting-row"><span><strong>Koppelen aan sharon.life</strong><small>Delen via swipe links naar rechts voor locaties, kaarten, thema’s en acties.</small></span><input type="checkbox" role="switch" data-log-public-toggle></label><p class="log-public-setting-status" data-log-public-status></p></div></details>`;
  }
  function mountSettings(){
    const title=$('#kmShellAppSettingsTitle');
    const group=title?.closest('.km-shell-settings-group');
    if(!group)return;
    if(!group.querySelector('#kmShellPublicSettings'))group.insertAdjacentHTML('beforeend',settingsMarkup());
    const toggle=group.querySelector('[data-log-public-toggle]');
    if(toggle&&!toggle.dataset.bound){
      toggle.dataset.bound='1';
      toggle.addEventListener('change',async()=>{
        if(toggle.checked){
          toggle.checked=false;
          const key=await askKey();
          if(key)setEnabled(true,key);
          else syncSettings();
        }else setEnabled(false,'');
      });
    }
    syncSettings();
  }
  function syncSettings(){
    const toggle=$('[data-log-public-toggle]');
    const status=$('[data-log-public-status]');
    const active=enabled();
    if(toggle)toggle.checked=active;
    if(status){status.textContent=active?'Gekoppeld · rechts swipen om te delen':'Niet gekoppeld';status.dataset.active=String(active);}
  }

  function installStyles(){
    if($('#logPublicPrivateStyles'))return;
    const style=document.createElement('style');
    style.id='logPublicPrivateStyles';
    style.textContent=`
      .log-share-strip{display:none!important}
      .log-public-setting-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:4px 0}.log-public-setting-row>span{display:grid;gap:3px;min-width:0}.log-public-setting-row strong{font-size:13px}.log-public-setting-row small,.log-public-setting-status{color:var(--muted);font-size:11px;line-height:1.35}.log-public-setting-row input[role="switch"]{appearance:none;-webkit-appearance:none;width:50px;height:30px;flex:0 0 auto;border:0;border-radius:999px;background:rgba(120,120,128,.28);position:relative;transition:.18s}.log-public-setting-row input[role="switch"]:after{content:"";position:absolute;width:26px;height:26px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:.18s}.log-public-setting-row input[role="switch"]:checked{background:#34c759}.log-public-setting-row input[role="switch"]:checked:after{transform:translateX(20px)}.log-public-setting-status[data-active="true"]{color:#34c759}.log-public-setting-status{margin:9px 0 0}
      .log-public-dialog{width:min(calc(100% - 28px),500px);padding:0;border:1px solid var(--line);border-radius:20px;background:var(--bg);color:var(--text);box-shadow:0 22px 64px rgba(0,0,0,.42)}.log-public-dialog::backdrop{background:rgba(0,0,0,.48)}.log-public-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;border-bottom:1px solid var(--line)}.log-public-dialog h2{margin:0;font-size:19px}.log-public-dialog header button{width:36px;height:36px;border:0;border-radius:50%;background:var(--card2);color:var(--text);font-size:22px}.log-public-dialog-body{padding:16px}.log-public-dialog-body p{line-height:1.45}.log-public-field{display:grid;gap:6px;margin:12px 0}.log-public-field input{width:100%;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--card2);color:var(--text);font:inherit}.log-public-note{color:var(--muted);font-size:11px}.log-public-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.log-public-actions.one{grid-template-columns:1fr}.log-public-qr{display:flex;justify-content:center;margin:2px auto 12px}.log-public-qr svg{width:min(70vw,270px);height:auto;background:#fff;border-radius:14px}.log-public-identifier{font-family:"SFMono-Regular",Consolas,monospace;font-size:17px;font-weight:800;text-align:center;letter-spacing:.04em;overflow-wrap:anywhere}.log-public-meta{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin:10px 0}.log-public-meta>span:first-child{color:var(--muted);font-size:11px}.log-public-badge{padding:5px 8px;border-radius:999px;font-size:10px;font-weight:800}.log-public-badge.current{background:rgba(52,199,89,.14);color:#34c759}.log-public-badge.changed{background:rgba(255,159,10,.16);color:#ff9f0a}.log-public-badge.unknown{background:var(--card2);color:var(--muted)}.log-public-progress{display:grid;place-items:center;text-align:center;padding:22px}.log-public-progress span{width:30px;height:30px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:logPublicSpin .8s linear infinite}.log-public-qr-fallback{padding:40px 20px;border-radius:14px;background:var(--card2);color:var(--muted)}
      .log-share-armed{box-shadow:inset 5px 0 0 #34c759}
      @keyframes logPublicSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  function init(){
    installStyles();mountSettings();
    settingsObserver=new MutationObserver(()=>mountSettings());
    settingsObserver.observe(document.body,{childList:true,subtree:true});
    for(const name of ['pageshow','log-km-state-change','log-time-state-change','log-shell-view-refresh'])window.addEventListener(name,()=>{mountSettings();syncSettings();});
    window.LogSharingUI={enabled,canShare,shareFromSurface,showStatus,mountSettings,resolveSurface};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
