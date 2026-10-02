(function(){
  'use strict';

  const TIME='urenregistratie.test.pwa.v1';
  const STYLE_ID='logCompactStopUiStyle';
  const MODES=['day','week','month','quarter','year','all'];

  function read(){
    try{const value=JSON.parse(localStorage.getItem(TIME)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}
  }

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #main>.active-card{min-height:0!important}
      [data-log-stop-context-hidden="1"]{display:none!important}
      .log-stop-inline{min-height:0!important;display:flex!important;flex-direction:column!important;padding:18px 2px!important;margin:0 0 6px!important;border-bottom:1px solid var(--line,#242a33)!important}
      .log-stop-inline .inline-register-head{margin-bottom:8px!important}
      .log-stop-inline .inline-register-head h2{font-size:21px!important;line-height:1.18!important}
      .log-stop-inline .inline-stop-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:0 16px!important;margin:4px 0 6px!important;padding:7px 0!important;border-top:1px solid var(--line,#242a33);border-bottom:1px solid var(--line,#242a33)}
      .log-stop-inline .inline-stop-grid>div{padding:5px 0!important;border:0!important;border-radius:0!important;background:transparent!important;min-height:0!important}
      .log-stop-inline .inline-stop-grid span{font-size:8px!important;letter-spacing:.045em!important}
      .log-stop-inline .inline-stop-grid strong{margin-top:1px!important;font-size:16px!important;line-height:1.15!important}
      .log-stop-inline #inlineStopColleagues{margin:0!important}
      .log-colleague-compact{padding:0!important;border:0!important}
      .log-colleague-compact>h2,.log-colleague-compact>h3,.log-colleague-compact>h4{display:none!important}
      .log-colleague-toggle{width:100%;display:flex;align-items:center;gap:8px;min-height:46px;padding:6px 0;border:0;border-bottom:1px solid var(--line,#242a33);background:transparent;color:inherit;text-align:left}
      .log-colleague-toggle-main{flex:1;display:flex;flex-direction:column;gap:2px}
      .log-colleague-toggle-title{font-size:14px;font-weight:760;line-height:1.2}
      .log-colleague-toggle-meta{font-size:10px;color:var(--muted,#929ca8);font-weight:520;line-height:1.2}
      .log-colleague-toggle-count{font-size:11px;color:var(--muted,#929ca8);white-space:nowrap}
      .log-colleague-toggle-chevron{font-size:18px;color:var(--muted,#929ca8);line-height:1;transition:transform .16s ease}
      .log-colleague-compact[data-open="1"] .log-colleague-toggle-chevron{transform:rotate(90deg)}
      .log-colleague-body[hidden]{display:none!important}
      .log-colleague-body{padding:7px 0 5px}
      .log-colleague-compact .check-list{gap:4px!important}
      .log-colleague-compact .check-row{padding:7px 9px!important;border-radius:9px!important;min-height:40px!important}
      .log-colleague-compact .check-row input{width:18px!important;height:18px!important}
      .log-colleague-compact .inline-form{margin-top:6px!important}
      .log-stop-inline #saveInlineStop{margin-top:12px!important;min-height:48px!important}
      .log-stop-inline .inline-register-context{margin-top:5px!important;font-size:9px!important}
      .log-period-mirror{position:relative;margin-top:0!important}
      .log-period-mirror .period-center{position:relative}
      .log-period-mode-select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
    `;
    document.head.appendChild(style);
  }

  function frequentNames(){
    const state=read(),timer=state.timer||{},entries=Array.isArray(state.entries)?state.entries:[],people=Array.isArray(state.colleagues)?state.colleagues:[];
    if(!timer.themeId)return [];
    const matching=entries.filter(entry=>entry?.activityType!=='interruption'&&String(entry.themeId||'')===String(timer.themeId||'')&&String(entry.subthemeId||'')===String(timer.subthemeId||''));
    if(matching.length<2)return [];
    const counts=new Map();
    for(const entry of matching){
      const ids=new Set();
      for(const allocation of Array.isArray(entry.allocations)?entry.allocations:[]){if(allocation?.colleagueId)ids.add(String(allocation.colleagueId));}
      for(const person of Array.isArray(entry.people)?entry.people:[]){if(person?.id)ids.add(String(person.id));}
      for(const id of ids)counts.set(id,(counts.get(id)||0)+1);
    }
    return [...counts.entries()]
      .filter(([,count])=>count>=2)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,2)
      .map(([id])=>people.find(person=>String(person.id)===id)?.name)
      .filter(Boolean);
  }

  function selectedSummary(section){
    const selected=[...section.querySelectorAll('input[type="checkbox"]:checked')];
    if(!selected.length)return 'Geen';
    if(selected.length===1){
      const id=selected[0].id;
      const label=id?section.querySelector(`label[for="${CSS.escape(id)}"]`):null;
      return label?.textContent?.trim()||'1 persoon';
    }
    return `${selected.length} personen`;
  }

  function restoreHidden(){
    document.querySelectorAll('[data-log-stop-context-hidden="1"]').forEach(node=>node.removeAttribute('data-log-stop-context-hidden'));
  }

  function hideDuplicatePending(period){
    const main=period.closest('#main');
    if(!main)return;
    [...main.children].forEach(node=>{
      if(node===period)return;
      const text=String(node.textContent||'').toLowerCase();
      if(node.querySelector?.('#finishPending')||text.includes('nog af te ronden'))node.setAttribute('data-log-stop-context-hidden','1');
    });
  }

  function compactColleagues(period){
    const host=period.querySelector('#inlineStopColleagues');
    if(!host)return;
    const section=host.querySelector('.settings-section')||host.firstElementChild;
    if(!section||section.dataset.compactColleagues==='1')return;

    section.dataset.compactColleagues='1';
    section.dataset.open='0';
    section.classList.add('log-colleague-compact');

    const heading=[...section.querySelectorAll(':scope>h2,:scope>h3,:scope>h4')].find(node=>String(node.textContent||'').trim().toLowerCase()==='inzet van anderen')||section.querySelector(':scope>h3');
    const children=[...section.children].filter(node=>node!==heading);
    if(!children.length)return;

    const body=document.createElement('div');
    body.className='log-colleague-body';
    body.hidden=true;
    children.forEach(node=>body.appendChild(node));

    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='log-colleague-toggle';
    toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML='<span class="log-colleague-toggle-main"><span class="log-colleague-toggle-title">Inzet van anderen</span><span class="log-colleague-toggle-meta"></span></span><span class="log-colleague-toggle-count"></span><span class="log-colleague-toggle-chevron">›</span>';
    if(heading)heading.after(toggle);else section.prepend(toggle);
    toggle.after(body);

    const meta=toggle.querySelector('.log-colleague-toggle-meta');
    const count=toggle.querySelector('.log-colleague-toggle-count');
    const update=()=>{
      count.textContent=selectedSummary(section);
      const frequent=frequentNames();
      meta.textContent=frequent.length?`Vaak: ${frequent.join(', ')}`:'Optioneel';
    };
    update();

    toggle.addEventListener('click',()=>{
      const open=section.dataset.open!=='1';
      section.dataset.open=open?'1':'0';
      body.hidden=!open;
      toggle.setAttribute('aria-expanded',open?'true':'false');
    });
    section.addEventListener('change',update);
    section.addEventListener('click',event=>{if(event.target?.closest('button'))setTimeout(update,0);});
  }

  function startOfWeek(date){
    const value=new Date(date),day=(value.getDay()+6)%7;
    value.setDate(value.getDate()-day);value.setHours(0,0,0,0);return value;
  }
  function isoWeek(date){
    const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
    const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);
    const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d-yearStart)/86400000)+1)/7);
  }
  function shortDate(date,year=false){
    return new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',...(year?{year:'numeric'}:{})}).format(date).replace(/\.$/,'');
  }
  function periodText(){
    const data=read(),ui=data.ui||{},mode=MODES.includes(ui.periodMode)?ui.periodMode:'week';
    const anchor=new Date(`${ui.anchorDate||new Date().toISOString().slice(0,10)}T12:00:00`);
    if(mode==='day')return {mode,label:new Intl.DateTimeFormat('nl-NL',{weekday:'long',day:'numeric',month:'long'}).format(anchor),sub:String(anchor.getFullYear())};
    if(mode==='week'){
      const start=startOfWeek(anchor),end=new Date(start);end.setDate(start.getDate()+6);
      return {mode,label:`Week ${isoWeek(start)}`,sub:`${shortDate(start)} – ${shortDate(end,true)}`};
    }
    if(mode==='month')return {mode,label:new Intl.DateTimeFormat('nl-NL',{month:'long',year:'numeric'}).format(anchor),sub:''};
    if(mode==='quarter')return {mode,label:`Kwartaal ${Math.floor(anchor.getMonth()/3)+1}`,sub:String(anchor.getFullYear())};
    if(mode==='year')return {mode,label:String(anchor.getFullYear()),sub:'Jaar'};
    return {mode,label:'Alles',sub:'Alle registraties'};
  }

  function shiftPeriod(delta){
    try{
      if(typeof movePeriod==='function'){movePeriod(delta);return;}
    }catch(_){}
    const data=read(),ui=data.ui||{},mode=MODES.includes(ui.periodMode)?ui.periodMode:'week';
    const date=new Date(`${ui.anchorDate||new Date().toISOString().slice(0,10)}T12:00:00`);
    if(mode==='day')date.setDate(date.getDate()+delta);
    else if(mode==='week')date.setDate(date.getDate()+7*delta);
    else if(mode==='month')date.setMonth(date.getMonth()+delta);
    else if(mode==='quarter')date.setMonth(date.getMonth()+3*delta);
    else if(mode==='year')date.setFullYear(date.getFullYear()+delta);
    else return;
    ui.anchorDate=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    data.ui=ui;localStorage.setItem(TIME,JSON.stringify(data));location.reload();
  }

  function setPeriodMode(mode){
    if(!MODES.includes(mode))return;
    try{
      if(typeof state!=='undefined'&&state?.ui&&typeof saveState==='function'&&typeof render==='function'){
        state.ui.periodMode=mode;saveState();render();return;
      }
    }catch(_){}
    const data=read();data.ui={...(data.ui||{}),periodMode:mode};localStorage.setItem(TIME,JSON.stringify(data));location.reload();
  }

  function cleanupMirror(){
    document.querySelectorAll('.log-period-mirror').forEach(mirror=>{
      const summary=mirror.querySelector(':scope>.summary');
      if(summary&&mirror.parentNode)mirror.parentNode.insertBefore(summary,mirror.nextSibling);
      mirror.remove();
    });
  }

  function periodHeadMarkup(view){
    return `<div class="period-head"><button class="period-arrow" type="button" data-log-period-prev aria-label="Vorige periode">‹</button><div class="period-center"><strong>${view.label}</strong>${view.sub?`<small>${view.sub}</small>`:''}<select class="log-period-mode-select" aria-label="Periodegrootte kiezen">${MODES.map(mode=>`<option value="${mode}" ${mode===view.mode?'selected':''}>${({day:'Dag',week:'Week',month:'Maand',quarter:'Kwartaal',year:'Jaar',all:'Alles'})[mode]}</option>`).join('')}</select></div><button class="period-arrow" type="button" data-log-period-next aria-label="Volgende periode">›</button></div>`;
  }

  function bindPeriodMirror(mirror){
    mirror.querySelector('[data-log-period-prev]')?.addEventListener('click',()=>shiftPeriod(-1));
    mirror.querySelector('[data-log-period-next]')?.addEventListener('click',()=>shiftPeriod(1));
    mirror.querySelector('.log-period-mode-select')?.addEventListener('change',event=>setPeriodMode(event.target.value));
  }

  function ensurePeriodMirror(period){
    const main=period.closest('#main');
    if(!main)return;
    let mirror=main.querySelector(':scope>.log-period-mirror');
    const view=periodText();
    const signature=`${view.mode}|${view.label}|${view.sub}`;
    if(!mirror){
      mirror=document.createElement('section');
      mirror.className='period-overview log-period-mirror';
      period.after(mirror);
    }

    const head=mirror.querySelector(':scope>.period-head');
    if(!head||mirror.dataset.periodSignature!==signature){
      head?.remove();
      mirror.insertAdjacentHTML('afterbegin',periodHeadMarkup(view));
      mirror.dataset.periodSignature=signature;
      bindPeriodMirror(mirror);
    }

    const summary=[...main.children].find(node=>node!==mirror&&node!==period&&node.classList?.contains('summary'));
    if(summary){summary.classList.add('period-summary');mirror.appendChild(summary);}
  }

  function enhance(){
    const save=document.getElementById('saveInlineStop');
    if(!save){restoreHidden();cleanupMirror();return;}
    const period=save.closest('.period-entry-mode')||save.closest('.period-overview');
    if(!period)return;
    period.classList.add('log-stop-inline');
    hideDuplicatePending(period);
    compactColleagues(period);
    ensurePeriodMirror(period);
  }

  function install(){
    installStyle();
    enhance();
    let queued=false;
    const scheduleEnhance=()=>{
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{
        queued=false;
        enhance();
      });
    };
    const observer=new MutationObserver(scheduleEnhance);
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();