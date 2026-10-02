(function(){
  'use strict';

  const STYLE_ID='logActiveTaskRideStyle';
  const TIME='urenregistratie.test.pwa.v1';

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #main>.active-card.time-task-zone{min-height:0!important;display:flex!important;flex-direction:column!important;padding-bottom:8px!important}
      .time-active-primary{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:stretch}
      .time-active-details{display:flex;min-width:0;flex-direction:column}
      .time-active-details>.kicker{margin-bottom:8px}
      .time-active-details>h2{margin:0 0 4px!important;font-size:clamp(22px,6vw,28px)!important;line-height:1.08}
      .time-active-details>.suggestion-sub{margin:0 0 8px!important;font-size:14px!important;line-height:1.25}
      .time-active-details>.active-meta{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:5px!important;margin:0!important}
      .time-active-details>.timer-clock{margin:auto 0 0!important;padding-top:10px!important;text-align:left!important;font-size:clamp(34px,10vw,52px)!important;line-height:1!important;letter-spacing:-.045em}
      .time-note-panel,.time-summary-panel{display:flex;min-height:174px;border:1px solid var(--line);border-radius:15px;background:var(--surface2,var(--card2));overflow:hidden}
      .time-note-action{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 10px;border:0;background:transparent;color:var(--text);text-align:center;cursor:pointer;touch-action:manipulation}
      .time-note-symbol{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent);font-size:24px;font-weight:700}
      .time-note-copy{font-size:15px;font-weight:750;line-height:1.15}
      .time-note-meta{max-width:100%;color:var(--muted);font-size:11px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .time-summary-panel{flex-direction:column;justify-content:center;padding:12px}
      .time-summary-title{margin-bottom:8px;color:var(--muted);font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;text-align:center}
      .time-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px}
      .time-summary-item{min-width:0;text-align:center}
      .time-summary-item span,.time-summary-item strong{display:block}
      .time-summary-item span{color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.045em;white-space:nowrap}
      .time-summary-item strong{margin-top:2px;font-size:15px;line-height:1.15;white-space:nowrap}
      .time-summary-item.primary strong{color:var(--accent)}
      .time-active-ride-layout>#stopTimer,.time-pending-zone>#finishPending{width:100%;min-height:50px;margin-top:12px!important}
      .time-active-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:2px}
      .time-active-tools .btn,.time-pending-resume{min-height:38px!important;margin:0!important;padding:7px 4px!important;border:0!important;border-radius:10px!important;background:transparent!important;color:var(--muted)!important;font-size:12px!important;font-weight:650!important;box-shadow:none!important}
      .time-active-tools .btn:active,.time-pending-resume:active{background:color-mix(in srgb,var(--surface2) 70%,transparent)!important;color:var(--text)!important}
      .time-pending-resume{width:100%;margin-top:2px!important;cursor:pointer}
      .time-pending-extra{margin-top:2px;border-top:1px solid var(--line)}
      .time-pending-extra>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:42px;padding:7px 1px;list-style:none;color:var(--muted);font-size:11px;font-weight:650;cursor:pointer}
      .time-pending-extra>summary::-webkit-details-marker{display:none}
      .time-pending-extra-title{color:var(--text);font-size:12px}
      .time-pending-extra-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
      .time-pending-extra-chevron{font-size:17px;transition:transform .16s ease}
      .time-pending-extra[open] .time-pending-extra-chevron{transform:rotate(90deg)}
      .time-pending-extra-body{padding:4px 0 8px}
      .time-pending-extra-body>.settings-section>h3{display:none!important}
      .time-pending-extra-body .check-list{gap:4px!important}
      .time-pending-extra-body .check-row{min-height:40px!important;padding:7px 9px!important}
      .time-quick-note-existing{margin:8px 0 12px;padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:var(--surface2);color:var(--muted);font-size:11px;line-height:1.4;white-space:pre-wrap}
      @media(max-width:360px){
        .time-active-primary{gap:8px}
        .time-note-panel,.time-summary-panel{min-height:164px}
        .time-note-symbol{width:44px;height:44px}
        .time-summary-panel{padding:9px}
        .time-summary-grid{gap:7px 6px}
        .time-summary-item strong{font-size:14px}
      }
    `;
    document.head.appendChild(style);
  }

  function stateTimer(){
    try{if(typeof state!=='undefined'&&state?.timer)return state.timer;}catch(_){}
    try{return JSON.parse(localStorage.getItem(TIME)||'{}').timer||{};}catch(_){return {};}
  }

  function safe(value){
    try{if(typeof safeText==='function')return safeText(value);}catch(_){}
    return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }

  function noteSummary(){
    const note=String(stateTimer().note||'').trim();
    if(!note)return 'Snel toevoegen';
    const lines=note.split(/\n+/).map(line=>line.trim()).filter(Boolean);
    return lines.at(-1)||'Notitie aanwezig';
  }

  function frequentNames(){
    try{
      const timer=state.timer||{};
      if(!timer.themeId)return [];
      const matching=(state.entries||[]).filter(entry=>entry?.activityType!=='interruption'&&String(entry.themeId||'')===String(timer.themeId||'')&&String(entry.subthemeId||'')===String(timer.subthemeId||''));
      if(matching.length<2)return [];
      const counts=new Map();
      for(const entry of matching){
        for(const allocation of Array.isArray(entry.allocations)?entry.allocations:[]){
          if(allocation?.colleagueId)counts.set(String(allocation.colleagueId),(counts.get(String(allocation.colleagueId))||0)+1);
        }
      }
      return [...counts.entries()].filter(([,count])=>count>=2).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([id])=>state.colleagues.find(person=>String(person.id)===id)?.name).filter(Boolean);
    }catch(_){return [];}
  }

  function createNotePanel(){
    const panel=document.createElement('section');
    panel.className='time-note-panel';
    panel.innerHTML='<button type="button" class="time-note-action" data-time-quick-note><span class="time-note-symbol" aria-hidden="true">＋</span><span class="time-note-copy">Tussennotitie</span><span class="time-note-meta"></span></button>';
    const meta=panel.querySelector('.time-note-meta');
    if(meta)meta.textContent=noteSummary();
    panel.querySelector('[data-time-quick-note]')?.addEventListener('click',openQuickNote);
    return panel;
  }

  function openQuickNote(){
    let timer;
    try{timer=typeof state!=='undefined'?state.timer:null;}catch(_){timer=null;}
    if(!timer||timer.status!=='active'||timer.interruption)return;
    if(typeof openModal!=='function')return;
    const existing=String(timer.note||'').trim();
    openModal(`<div class="modal-head"><div><div class="kicker">Actieve taak</div><h2>Tussennotitie</h2></div><button class="close" aria-label="Sluiten">×</button></div><div class="field"><label>Notitie</label><textarea id="quickTaskNote" rows="3" placeholder="Wat wil je tussendoor vastleggen?"></textarea></div>${existing?`<div class="time-quick-note-existing">${safe(existing)}</div>`:''}<button id="saveQuickTaskNote" class="btn primary full">Toevoegen</button>`);
    const input=document.getElementById('quickTaskNote');
    requestAnimationFrame(()=>input?.focus());
    document.getElementById('saveQuickTaskNote')?.addEventListener('click',()=>{
      const value=String(input?.value||'').trim();
      if(!value)return;
      const stamp=new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit'}).format(new Date());
      const line=`${stamp} · ${value}`;
      timer.note=existing?`${existing}\n${line}`:line;
      try{saveState();}catch(_){return;}
      try{closeModal();}catch(_){}
      try{render();}catch(_){}
      try{toast('Notitie toegevoegd');}catch(_){}
    });
  }

  function pendingCalc(){
    try{return calculateParentTimer(state.timer);}catch(_){return null;}
  }

  function createSummaryPanel(calc){
    const panel=document.createElement('section');
    panel.className='time-summary-panel';
    panel.innerHTML=`<div class="time-summary-title">Tijd</div><div class="time-summary-grid"><div class="time-summary-item"><span>Werkelijk</span><strong>${clockMinutes(calc.span)}</strong></div><div class="time-summary-item"><span>Aftrek</span><strong>${clockMinutes(calc.deducted)}</strong></div><div class="time-summary-item"><span>Netto</span><strong>${clockMinutes(calc.net)}</strong></div><div class="time-summary-item primary"><span>Te boeken</span><strong>${displayMinutes(calc.booked)}</strong></div></div>`;
    return panel;
  }

  function resumePending(){
    try{
      if(state.timer?.status!=='pending')return;
      state.timer.status='active';
      state.timer.stopISO=null;
      saveState();
      render();
      toast('Taak hervat');
    }catch(error){console.warn('Taak hervatten mislukt',error);}
  }

  function completePending(card){
    try{
      const timer=state.timer;
      if(!timer||timer.status!=='pending')return;
      const calc=calculateParentTimer(timer);
      const allocations=typeof card._getPendingAllocations==='function'?card._getPendingAllocations():[];
      allocations.forEach(allocation=>{
        const colleague=state.colleagues.find(item=>String(item.id)===String(allocation.colleagueId));
        if(colleague)colleague.usageCount=(colleague.usageCount||0)+1;
      });
      const colleagueMinutes=allocations.reduce((sum,allocation)=>sum+(Number(allocation.minutes)||0),0);
      const entry=normalizeEntry({
        id:timer.sessionId,activityType:'normal',parentActivityId:null,kind:'Stopwatch',dateISO:timer.stopISO,
        themeId:timer.themeId,themeName:timer.themeName,subthemeId:timer.subthemeId,subthemeName:timer.subthemeName,
        locationName:timer.locationName,note:timer.note,startISO:timer.startISO,endISO:timer.stopISO,
        actualMinutes:calc.span,netActualMinutes:calc.net,deductedInterruptionMinutes:calc.deducted,
        roundedMinutes:calc.booked,ownMinutes:calc.booked,colleagueMinutes,totalMinutes:calc.booked+colleagueMinutes,
        allocations,roundingSnapshot:roundingSnapshot(),createdAt:new Date().toISOString()
      });
      state.entries.push(entry);
      state.lastCompletion={type:'task',entryId:entry.id,completedAt:new Date().toISOString()};
      state.timer=defaultTimer();
      saveState();
      render();
      toast('Taak opgeslagen');
    }catch(error){console.warn('Taak afronden mislukt',error);try{toast('Taak kon niet worden opgeslagen');}catch(_){}}
  }

  function startPendingExtras(card,details,calc){
    if(card._pendingExtrasReady)return;
    card._pendingExtrasReady=true;
    const host=details.querySelector('.time-pending-extra-body');
    if(!host)return;
    try{
      if(typeof colleagueSection!=='function'||typeof wireColleagueSection!=='function')return;
      host.innerHTML=colleagueSection(calc.booked,'pendingCompact');
      card._getPendingAllocations=wireColleagueSection('pendingCompact',calc.booked);
    }catch(error){console.warn('Aanvullende gegevens konden niet worden geladen',error);}
  }

  function moveIf(parent,node){if(node&&node.parentElement!==parent)parent.appendChild(node);}

  function enhanceActive(card){
    if(card.dataset.timeRideLayout==='1'){
      const meta=card.querySelector('.time-note-meta');
      const text=noteSummary();
      if(meta&&meta.textContent!==text)meta.textContent=text;
      return;
    }
    const stopOriginal=card.querySelector('#stopTimer');
    const interruption=card.querySelector('#startInterruption');
    const edit=card.querySelector('#editActive');
    const clock=card.querySelector('#timerClock');
    if(!stopOriginal||!interruption||!edit||!clock)return;

    const stop=stopOriginal.cloneNode(true);
    stopOriginal.replaceWith(stop);
    stop.addEventListener('click',()=>{
      try{
        if(state.timer?.status!=='active')return;
        if(state.timer.interruption){toast('Beëindig eerst de tussenstop');return;}
        state.timer.status='pending';
        state.timer.stopISO=new Date().toISOString();
        saveState();
        render();
      }catch(error){console.warn('Taak stoppen mislukt',error);}
    });

    card.dataset.timeRideLayout='1';
    card.classList.add('time-task-zone','time-active-ride-layout');

    const primary=document.createElement('div');
    primary.className='time-active-primary';
    const details=document.createElement('div');
    details.className='time-active-details';
    const detailNodes=[card.querySelector(':scope>.kicker'),card.querySelector(':scope>h2'),card.querySelector(':scope>.suggestion-sub'),card.querySelector(':scope>.active-meta'),clock].filter(Boolean);
    detailNodes.forEach(node=>details.appendChild(node));
    primary.append(details,createNotePanel());
    card.prepend(primary);

    const oldRow=stop.closest('.row');
    card.appendChild(stop);
    const tools=document.createElement('div');
    tools.className='time-active-tools';
    moveIf(tools,edit);
    moveIf(tools,interruption);
    card.appendChild(tools);
    if(oldRow&&oldRow!==tools&&!oldRow.children.length)oldRow.remove();
  }

  function enhancePending(card){
    if(card.dataset.timePendingLayout==='1')return;
    const finishOriginal=card.querySelector('#finishPending');
    const calc=pendingCalc();
    if(!finishOriginal||!calc)return;
    card.dataset.timePendingLayout='1';
    card.classList.add('time-task-zone','time-pending-zone');

    const timer=stateTimer();
    card.innerHTML='';
    const primary=document.createElement('div');
    primary.className='time-active-primary';
    const details=document.createElement('div');
    details.className='time-active-details';
    details.innerHTML=`<div class="kicker warning">Nog af te ronden</div><h2>${safe(timer.themeName||'Activiteit')}</h2>${timer.subthemeName?`<p class="suggestion-sub">${safe(timer.subthemeName)}</p>`:''}`;
    primary.append(details,createSummaryPanel(calc));
    card.appendChild(primary);

    const finish=document.createElement('button');
    finish.type='button';finish.id='finishPending';finish.className='btn primary full';finish.textContent='Taak afronden';
    finish.addEventListener('click',()=>completePending(card));
    card.appendChild(finish);

    const resume=document.createElement('button');
    resume.type='button';resume.className='time-pending-resume';resume.textContent='Hervatten';
    resume.addEventListener('click',resumePending);
    card.appendChild(resume);

    const frequent=frequentNames();
    const extra=document.createElement('details');
    extra.className='time-pending-extra';
    extra.innerHTML=`<summary><span class="time-pending-extra-title">Aanvullende gegevens</span><span class="time-pending-extra-meta">${frequent.length?`Vaak: ${safe(frequent.join(', '))}`:'Inzet van anderen'}</span><span class="time-pending-extra-chevron">›</span></summary><div class="time-pending-extra-body"></div>`;
    extra.addEventListener('toggle',()=>{if(extra.open)startPendingExtras(card,extra,calc);});
    card.appendChild(extra);
  }

  function enhance(){
    installStyle();
    const card=document.querySelector('#main>.active-card');
    if(!card)return;
    if(card.querySelector('#stopTimer'))enhanceActive(card);
    else if(card.querySelector('#finishPending'))enhancePending(card);
  }

  function install(){
    enhance();
    const main=document.getElementById('main')||document.body;
    let queued=false;
    const schedule=()=>{
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{queued=false;enhance();});
    };
    new MutationObserver(schedule).observe(main,{childList:true,subtree:true});
    window.addEventListener('log-time-state-change',schedule);
    window.addEventListener('pageshow',schedule);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
