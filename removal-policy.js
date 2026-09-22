(function(global){
  'use strict';

  const VERSION=1;
  const ARCHIVE_KEY='log-archive-v1';

  const clone=value=>{
    if(value==null)return value;
    if(typeof structuredClone==='function'){
      try{return structuredClone(value);}catch(_){}
    }
    return JSON.parse(JSON.stringify(value));
  };

  function uid(){
    if(global.crypto?.randomUUID)return global.crypto.randomUUID();
    return `archive-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeGroup(group){
    if(!group)return null;
    const count=group.count==null?null:Math.max(0,Number(group.count)||0);
    if(count===0)return null;
    return {
      key:String(group.key||group.label||'relation'),
      label:String(group.label||'gekoppelde gegevens'),
      count,
      ids:Array.isArray(group.ids)?group.ids.map(String):[]
    };
  }

  function createPlan({entityType,id,label,owned=[],incoming=[],meta={}}={}){
    const ownedGroups=owned.map(normalizeGroup).filter(Boolean);
    const incomingGroups=incoming.map(normalizeGroup).filter(Boolean);
    const action=incomingGroups.length?'archive':'delete';
    return {
      version:VERSION,
      entityType:String(entityType||'item'),
      id:String(id||''),
      label:String(label||'Dit item'),
      action,
      owned:ownedGroups,
      incoming:incomingGroups,
      meta:meta&&typeof meta==='object'?meta:{}
    };
  }

  function groupText(group){
    if(group.count==null)return group.label;
    return `${group.count} ${group.label}`;
  }

  function joinGroups(groups){
    const parts=groups.map(groupText);
    if(parts.length<=1)return parts[0]||'';
    if(parts.length===2)return `${parts[0]} en ${parts[1]}`;
    return `${parts.slice(0,-1).join(', ')} en ${parts.at(-1)}`;
  }

  function deleteCopy(plan){
    const owned=joinGroups(plan.owned);
    return {
      title:`${plan.label} verwijderen?`,
      message:owned
        ? `Ook ${owned} worden definitief verwijderd.`
        : 'Dit item wordt definitief verwijderd.',
      detail:'Deze actie kan niet ongedaan worden gemaakt.'
    };
  }

  function archiveCopy(plan){
    const incoming=joinGroups(plan.incoming);
    return {
      title:`${plan.label} archiveren`,
      message:incoming
        ? `Dit item blijft nodig voor ${incoming} en wordt daarom gearchiveerd.`
        : 'Dit item wordt gearchiveerd.',
      detail:'Historische relaties blijven intact en het item kan later worden hersteld.'
    };
  }

  function installConfirmStyles(doc=document){
    if(doc.getElementById('logRemovalConfirmStyle'))return;
    const style=doc.createElement('style');
    style.id='logRemovalConfirmStyle';
    style.textContent=`
      .log-removal-confirm{position:fixed;z-index:10000;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:18px;background:rgba(0,0,0,.42);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
      .log-removal-confirm-card{width:min(520px,100%);padding:18px;border:.5px solid var(--line,#2a3442);border-radius:22px;background:var(--bg,#11151a);color:var(--text,#f4f7fb);box-shadow:0 22px 60px rgba(0,0,0,.32)}
      .log-removal-confirm-card h2{margin:0;font-size:20px;letter-spacing:-.025em}.log-removal-confirm-card p{margin:9px 0 0;color:var(--muted,#929ca8);font-size:13px;line-height:1.45}
      .log-removal-confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}.log-removal-confirm-actions button{min-height:46px;border:0;border-radius:13px;font:inherit;font-weight:760}.log-removal-cancel{background:var(--card2,var(--surface-2,#171c23));color:var(--text,#f4f7fb)}.log-removal-delete{background:#d70015;color:#fff}
      @media(prefers-color-scheme:dark){.log-removal-delete{background:#ff453a}}
    `;
    doc.head.appendChild(style);
  }

  function confirmDelete(plan,{document:doc=document}={}){
    if(!plan||plan.action!=='delete')return Promise.resolve(false);
    installConfirmStyles(doc);
    const copy=deleteCopy(plan);
    return new Promise(resolve=>{
      const overlay=doc.createElement('div');
      overlay.className='log-removal-confirm';
      overlay.setAttribute('role','presentation');
      overlay.innerHTML=`<section class="log-removal-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="logRemovalConfirmTitle"><h2 id="logRemovalConfirmTitle"></h2><p data-log-removal-message></p><p data-log-removal-detail></p><div class="log-removal-confirm-actions"><button type="button" class="log-removal-cancel">Annuleren</button><button type="button" class="log-removal-delete">Verwijderen</button></div></section>`;
      overlay.querySelector('h2').textContent=copy.title;
      overlay.querySelector('[data-log-removal-message]').textContent=copy.message;
      overlay.querySelector('[data-log-removal-detail]').textContent=copy.detail;
      const finish=value=>{
        doc.removeEventListener('keydown',onKey,true);
        overlay.remove();
        resolve(value);
      };
      const onKey=event=>{
        if(event.key==='Escape'){event.preventDefault();finish(false);}
      };
      doc.addEventListener('keydown',onKey,true);
      overlay.querySelector('.log-removal-cancel').addEventListener('click',()=>finish(false),{once:true});
      overlay.querySelector('.log-removal-delete').addEventListener('click',()=>finish(true),{once:true});
      overlay.addEventListener('click',event=>{if(event.target===overlay)finish(false);});
      doc.body.appendChild(overlay);
      requestAnimationFrame(()=>overlay.querySelector('.log-removal-cancel')?.focus({preventScroll:true}));
    });
  }

  function readArchive(){
    try{
      const parsed=JSON.parse(global.localStorage.getItem(ARCHIVE_KEY)||'{}');
      return {
        version:VERSION,
        records:Array.isArray(parsed.records)?parsed.records:[]
      };
    }catch(_){return {version:VERSION,records:[]};}
  }

  function writeArchive(store){
    const normalized={version:VERSION,records:Array.isArray(store?.records)?store.records:[]};
    global.localStorage.setItem(ARCHIVE_KEY,JSON.stringify(normalized));
    return normalized;
  }

  function archiveBatch({source,entityType,rootId,items,reason=''}={}){
    const values=Array.isArray(items)?items.filter(Boolean):[];
    if(!values.length)return null;
    const store=readArchive();
    const batchId=uid();
    const archivedAt=new Date().toISOString();
    const ids=new Set(values.map(item=>String(item.id||'')));
    store.records=store.records.filter(record=>!(record.source===source&&record.entityType===entityType&&ids.has(String(record.id))));
    for(const item of values){
      store.records.push({
        archiveId:uid(),
        batchId,
        source:String(source||'log'),
        entityType:String(entityType||'item'),
        id:String(item.id||''),
        rootId:String(rootId||item.id||''),
        archivedAt,
        reason:String(reason||''),
        payload:clone(item)
      });
    }
    writeArchive(store);
    return {batchId,archivedAt,count:values.length};
  }

  function listArchived({source='',entityType=''}={}){
    return readArchive().records.filter(record=>(!source||record.source===source)&&(!entityType||record.entityType===entityType)).map(clone);
  }

  function recordsForBatch(batchId){
    return readArchive().records.filter(record=>record.batchId===batchId).map(clone);
  }

  function removeBatch(batchId){
    const store=readArchive();
    const before=store.records.length;
    store.records=store.records.filter(record=>record.batchId!==batchId);
    writeArchive(store);
    return before-store.records.length;
  }

  function removeArchived({source,entityType,id}={}){
    const store=readArchive();
    const before=store.records.length;
    store.records=store.records.filter(record=>!(record.source===source&&record.entityType===entityType&&String(record.id)===String(id)));
    writeArchive(store);
    return before-store.records.length;
  }

  global.LogRemovalPolicy=Object.freeze({
    VERSION,
    ARCHIVE_KEY,
    createPlan,
    deleteCopy,
    archiveCopy,
    confirmDelete,
    archiveBatch,
    listArchived,
    recordsForBatch,
    removeBatch,
    removeArchived
  });
})(window);
