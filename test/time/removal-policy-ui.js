(function(){
  'use strict';

  const BUILD='0.31.10-test.71';
  const STORAGE_KEY='urenregistratie.test.pwa.v1';
  const policy=window.LogRemovalPolicy;
  if(!policy){console.error('LogRemovalPolicy ontbreekt in Tijd en taken.');return;}

  let decorateQueued=false;
  let lastEntryId='';

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function readState(){
    try{
      const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
      if(!raw||typeof raw!=='object')return {};
      for(const key of ['entries','themes','subthemes','colleagues','employers','workspaces','departments'])if(!Array.isArray(raw[key]))raw[key]=[];
      return raw;
    }catch(_){return {entries:[],themes:[],subthemes:[],colleagues:[]};}
  }

  function writeState(raw){
    localStorage.setItem(STORAGE_KEY,JSON.stringify(raw));
  }

  function entryPlan(id,raw=readState()){
    const entry=raw.entries.find(item=>String(item.id)===String(id));
    if(!entry)return null;
    const children=raw.entries.filter(item=>String(item.parentActivityId||'')===String(id));
    const label=entry.activityType==='interruption'?'Tussenstop':(entry.themeName||'Registratie');
    return policy.createPlan({
      entityType:'time-entry',id,label,
      owned:[children.length?{key:'children',label:children.length===1?'gekoppelde tussenstop':'gekoppelde tussenstops',count:children.length,ids:children.map(item=>item.id)}:null],
      incoming:[]
    });
  }

  function colleagueUsed(entry,id){
    return (Array.isArray(entry?.people)&&entry.people.some(person=>String(person?.id||'')===String(id)))||
      (Array.isArray(entry?.allocations)&&entry.allocations.some(item=>String(item?.colleagueId||item?.id||'')===String(id)))||
      (Array.isArray(entry?.attributions)&&entry.attributions.some(item=>String(item?.colleagueId||item?.personId||item?.id||'')===String(id)));
  }

  function colleaguePlan(id,raw=readState()){
    const item=raw.colleagues.find(value=>String(value.id)===String(id));
    if(!item)return null;
    const references=raw.entries.filter(entry=>colleagueUsed(entry,id));
    return policy.createPlan({
      entityType:'colleague',id,label:item.name||'Collega',owned:[],
      incoming:[references.length?{key:'entries',label:references.length===1?'registratie':'registraties',count:references.length,ids:references.map(entry=>entry.id)}:null]
    });
  }

  function subthemePlan(id,raw=readState()){
    const item=raw.subthemes.find(value=>String(value.id)===String(id));
    if(!item)return null;
    const references=raw.entries.filter(entry=>String(entry.subthemeId||'')===String(id));
    const timerReference=String(raw.timer?.subthemeId||'')===String(id)?1:0;
    return policy.createPlan({
      entityType:'subtheme',id,label:item.name||'Subthema',owned:[],
      incoming:[
        references.length?{key:'entries',label:references.length===1?'registratie':'registraties',count:references.length,ids:references.map(entry=>entry.id)}:null,
        timerReference?{key:'timer',label:'actieve timer',count:1}:null
      ]
    });
  }

  function themePlan(id,raw=readState()){
    const item=raw.themes.find(value=>String(value.id)===String(id));
    if(!item)return null;
    const subs=raw.subthemes.filter(sub=>String(sub.themeId||'')===String(id));
    const subIds=new Set(subs.map(sub=>String(sub.id)));
    const references=raw.entries.filter(entry=>String(entry.themeId||'')===String(id)||subIds.has(String(entry.subthemeId||'')));
    const timerReference=String(raw.timer?.themeId||'')===String(id)||subIds.has(String(raw.timer?.subthemeId||''))?1:0;
    return policy.createPlan({
      entityType:'theme',id,label:item.name||'Thema',
      owned:[subs.length?{key:'subthemes',label:subs.length===1?'subthema':'subthema’s',count:subs.length,ids:subs.map(sub=>sub.id)}:null],
      incoming:[
        references.length?{key:'entries',label:references.length===1?'registratie':'registraties',count:references.length,ids:references.map(entry=>entry.id)}:null,
        timerReference?{key:'timer',label:'actieve timer',count:1}:null
      ],
      meta:{subthemeIds:[...subIds]}
    });
  }

  function hideDeleteToast(){
    const hide=()=>{
      const toast=$('#toast');
      if(toast&&/verwijderd/i.test(toast.textContent||'')){
        toast.classList.remove('show');
        toast.textContent='';
      }
    };
    [0,40,140,300].forEach(delay=>setTimeout(hide,delay));
  }

  function refreshTime(view='settings'){
    window.LogTimeModule?.reloadFromStorage?.({view});
    scheduleDecorate();
  }

  function replayNative(button,{bypassConfirm=false}={}){
    button.dataset.logRemovalApproved='1';
    const originalConfirm=window.confirm;
    if(bypassConfirm)window.confirm=()=>true;
    try{button.click();}finally{if(bypassConfirm)window.confirm=originalConfirm;}
    hideDeleteToast();
  }

  async function handleEntryDelete(event,button,id,{bypassConfirm=false}={}){
    if(button.dataset.logRemovalApproved==='1'){
      delete button.dataset.logRemovalApproved;
      return false;
    }
    const plan=entryPlan(id);
    if(!plan)return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    if(await policy.confirmDelete(plan))replayNative(button,{bypassConfirm});
    return true;
  }

  function archiveSimple(raw,collection,entityType,id,plan){
    const item=raw[collection].find(value=>String(value.id)===String(id));
    if(!item)return false;
    policy.archiveBatch({source:'time',entityType,rootId:id,items:[item],reason:policy.archiveCopy(plan).message});
    raw[collection]=raw[collection].filter(value=>String(value.id)!==String(id));
    writeState(raw);
    refreshTime('settings');
    return true;
  }

  async function removeSimple(raw,collection,id,plan){
    if(!await policy.confirmDelete(plan))return false;
    raw[collection]=raw[collection].filter(value=>String(value.id)!==String(id));
    writeState(raw);
    refreshTime('settings');
    return true;
  }

  function archiveTheme(raw,id,plan){
    const theme=raw.themes.find(value=>String(value.id)===String(id));
    if(!theme)return false;
    const subIds=new Set(plan.meta?.subthemeIds||[]);
    const subthemes=raw.subthemes.filter(sub=>subIds.has(String(sub.id)));
    policy.archiveBatch({source:'time',entityType:'theme',rootId:id,items:[{id:theme.id,name:theme.name,theme,subthemes}],reason:policy.archiveCopy(plan).message});
    raw.themes=raw.themes.filter(value=>String(value.id)!==String(id));
    raw.subthemes=raw.subthemes.filter(sub=>!subIds.has(String(sub.id)));
    writeState(raw);
    refreshTime('settings');
    return true;
  }

  async function removeTheme(raw,id,plan){
    if(!await policy.confirmDelete(plan))return false;
    const subIds=new Set(plan.meta?.subthemeIds||[]);
    raw.themes=raw.themes.filter(value=>String(value.id)!==String(id));
    raw.subthemes=raw.subthemes.filter(sub=>!subIds.has(String(sub.id)));
    writeState(raw);
    refreshTime('settings');
    return true;
  }

  async function handleLifecycleClick(event){
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;

    const entryRow=target.closest('[data-entry]');
    if(entryRow?.dataset.entry)lastEntryId=entryRow.dataset.entry;

    const swipeDelete=target.closest('[data-swipe-action="delete"]');
    if(swipeDelete){
      const id=swipeDelete.closest('.activity-swipe-row')?.dataset.id||lastEntryId;
      if(await handleEntryDelete(event,swipeDelete,id))return;
    }

    const detailDelete=target.closest('#deleteEntry');
    if(detailDelete){
      if(await handleEntryDelete(event,detailDelete,lastEntryId,{bypassConfirm:true}))return;
    }

    const colleagueButton=target.closest('[data-delete-colleague]');
    if(colleagueButton){
      event.preventDefault();event.stopImmediatePropagation();
      const id=colleagueButton.dataset.deleteColleague;
      const raw=readState(),plan=colleaguePlan(id,raw);
      if(!plan)return;
      if(plan.action==='archive')archiveSimple(raw,'colleagues','colleague',id,plan);
      else await removeSimple(raw,'colleagues',id,plan);
      return;
    }

    const subButton=target.closest('[data-del-sub]');
    if(subButton){
      event.preventDefault();event.stopImmediatePropagation();
      const id=subButton.dataset.delSub;
      const raw=readState(),plan=subthemePlan(id,raw);
      if(!plan)return;
      if(plan.action==='archive')archiveSimple(raw,'subthemes','subtheme',id,plan);
      else await removeSimple(raw,'subthemes',id,plan);
      return;
    }

    const themeButton=target.closest('[data-log-delete-theme]');
    if(themeButton){
      event.preventDefault();event.stopImmediatePropagation();
      const id=themeButton.dataset.logDeleteTheme;
      const raw=readState(),plan=themePlan(id,raw);
      if(!plan)return;
      if(plan.action==='archive')archiveTheme(raw,id,plan);
      else await removeTheme(raw,id,plan);
      return;
    }

    const restore=target.closest('[data-log-time-restore]');
    if(restore){
      event.preventDefault();event.stopImmediatePropagation();
      restoreBatch(restore.dataset.logTimeRestore);
    }
  }

  function installStyles(){
    if($('#logTimeRemovalStyle'))return;
    const style=document.createElement('style');
    style.id='logTimeRemovalStyle';
    style.textContent=`
      .log-time-archive-action{color:#8a6500!important}.log-time-delete-action{color:var(--bad,#d70015)!important}
      .log-time-archive-row{display:flex;align-items:center;gap:10px;min-height:52px;padding:9px 0}.log-time-archive-row+.log-time-archive-row{border-top:.5px solid var(--line)}.log-time-archive-copy{flex:1;min-width:0}.log-time-archive-copy strong,.log-time-archive-copy small{display:block}.log-time-archive-copy small{margin-top:2px;color:var(--muted);font-size:10px}.log-time-archive-row button{min-height:34px;padding:6px 10px;border:0;border-radius:10px;background:var(--surface2,var(--card2));color:var(--accent);font:inherit;font-size:11px;font-weight:800}
    `;
    document.head.appendChild(style);
  }

  function lifecycleLabel(plan){return plan?.action==='archive'?'Archiveer':'Verwijder';}

  function decorateSettingsActions(){
    const raw=readState();
    for(const button of $$('[data-delete-colleague]')){
      const plan=colleaguePlan(button.dataset.deleteColleague,raw);
      if(!plan)continue;
      const text=lifecycleLabel(plan);
      if(button.textContent!==text)button.textContent=text;
      button.classList.toggle('log-time-archive-action',plan.action==='archive');
      button.classList.toggle('log-time-delete-action',plan.action==='delete');
    }
    for(const button of $$('[data-del-sub]')){
      const plan=subthemePlan(button.dataset.delSub,raw);
      if(!plan)continue;
      const text=lifecycleLabel(plan);
      if(button.textContent!==text)button.textContent=text;
      button.classList.toggle('log-time-archive-action',plan.action==='archive');
      button.classList.toggle('log-time-delete-action',plan.action==='delete');
    }
    for(const manage of $$('[data-submanage]')){
      const row=manage.closest('.settings-list-row');
      const id=manage.dataset.submanage;
      if(!row||row.querySelector('[data-log-delete-theme]'))continue;
      const plan=themePlan(id,raw);
      if(!plan)continue;
      const button=document.createElement('button');
      button.type='button';
      button.className='settings-row-action';
      button.dataset.logDeleteTheme=id;
      button.textContent=lifecycleLabel(plan);
      button.classList.toggle('log-time-archive-action',plan.action==='archive');
      button.classList.toggle('log-time-delete-action',plan.action==='delete');
      row.appendChild(button);
    }
    const swipeHint=$('#swipeDeleteEnabled')?.closest('.settings-toggle-row')?.querySelector('small');
    const hint='Swipe links: kort voor Bewerken, verder voor Archiveer/Verwijder. Verwijderen vraagt altijd eerst bevestiging.';
    if(swipeHint&&swipeHint.textContent!==hint)swipeHint.textContent=hint;
  }

  function archiveRecords(){
    return policy.listArchived({source:'time'}).filter(record=>['colleague','subtheme','theme'].includes(record.entityType));
  }

  function archiveRecordName(record){
    if(record.entityType==='theme')return record.payload?.theme?.name||record.payload?.name||'Thema';
    return record.payload?.name||record.entityType;
  }

  function archiveTypeLabel(type){return ({theme:'Thema',subtheme:'Subthema',colleague:'Collega'})[type]||type;}

  function ensureArchivePanel(){
    const page=$('.settings-page');
    if(!page)return;
    const records=archiveRecords().sort((a,b)=>String(b.archivedAt||'').localeCompare(String(a.archivedAt||'')));
    let panel=$('#logTimeArchivePanel',page);
    if(!records.length){panel?.remove();return;}
    const signature=records.map(record=>`${record.archiveId}:${record.archivedAt}`).join('|');
    if(panel?.dataset.signature===signature)return;
    if(!panel){
      panel=document.createElement('details');
      panel.id='logTimeArchivePanel';
      panel.className='settings-accordion';
      page.appendChild(panel);
    }
    const wasOpen=panel.open;
    panel.dataset.signature=signature;
    panel.innerHTML=`<summary><span class="settings-accordion-title"><strong>Archief</strong><small>${records.length} ${records.length===1?'item':'items'} gearchiveerd</small></span><span class="settings-accordion-arrow">›</span></summary><div class="settings-accordion-body">${records.map(record=>`<div class="log-time-archive-row"><div class="log-time-archive-copy"><strong>${esc(archiveRecordName(record))}</strong><small>${archiveTypeLabel(record.entityType)}</small></div><button type="button" data-log-time-restore="${esc(record.batchId)}">Herstel</button></div>`).join('')}</div>`;
    panel.open=wasOpen;
  }

  function restoreBatch(batchId){
    const records=policy.recordsForBatch(batchId).filter(record=>record.source==='time');
    if(!records.length)return;
    const raw=readState();
    for(const record of records){
      if(record.entityType==='colleague'){
        if(!raw.colleagues.some(item=>String(item.id)===String(record.id)))raw.colleagues.push(record.payload);
      }else if(record.entityType==='subtheme'){
        if(!raw.subthemes.some(item=>String(item.id)===String(record.id)))raw.subthemes.push(record.payload);
      }else if(record.entityType==='theme'){
        const theme=record.payload?.theme||record.payload;
        if(theme&&!raw.themes.some(item=>String(item.id)===String(theme.id)))raw.themes.push(theme);
        for(const sub of record.payload?.subthemes||[]){
          if(!raw.subthemes.some(item=>String(item.id)===String(sub.id)))raw.subthemes.push(sub);
        }
      }
    }
    writeState(raw);
    policy.removeBatch(batchId);
    refreshTime('settings');
  }

  function scheduleDecorate(){
    if(decorateQueued)return;
    decorateQueued=true;
    requestAnimationFrame(()=>{
      decorateQueued=false;
      decorateSettingsActions();
      ensureArchivePanel();
    });
  }

  function init(){
    installStyles();
    document.addEventListener('click',handleLifecycleClick,true);
    const observer=new MutationObserver(scheduleDecorate);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pageshow',scheduleDecorate);
    window.addEventListener('storage',event=>{
      if(event.key===STORAGE_KEY||event.key===policy.ARCHIVE_KEY)scheduleDecorate();
    });
    scheduleDecorate();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
