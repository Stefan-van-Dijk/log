(function(){
  'use strict';

  const STYLE_ID='logActiveTaskRideStyle';
  const TIME='urenregistratie.test.pwa.v1';
  const ZONE_HEIGHT='354px';

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      :root{--log-time-zone-min-height:${ZONE_HEIGHT}}
      #main>.active-card.time-task-zone{min-height:var(--log-time-zone-min-height)!important;display:flex!important;flex-direction:column!important}
      .time-active-primary{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:stretch}
      .time-active-details{display:flex;min-width:0;flex-direction:column}
      .time-active-details>.kicker{margin-bottom:8px}
      .time-active-details>h2{margin:0 0 4px!important;font-size:clamp(22px,6vw,28px)!important;line-height:1.08}
      .time-active-details>.suggestion-sub{margin:0 0 8px!important;font-size:14px!important;line-height:1.25}
      .time-active-details>.active-meta{display:flex!important;flex-direction:column!important;align-items:flex-start!important;gap:5px!important;margin:0!important}
      .time-active-details>.timer-clock{margin:auto 0 0!important;padding-top:10px!important;text-align:left!important;font-size:clamp(34px,10vw,52px)!important;line-height:1!important;letter-spacing:-.045em}
      .time-note-panel{display:flex;min-height:174px;border:1px solid var(--line);border-radius:15px;background:var(--surface2,var(--card2));overflow:hidden}
      .time-note-action{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px 10px;border:0;background:transparent;color:var(--text);text-align:center;cursor:pointer;touch-action:manipulation}
      .time-note-symbol{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent);font-size:24px;font-weight:700}
      .time-note-copy{font-size:15px;font-weight:750;line-height:1.15}
      .time-note-meta{max-width:100%;color:var(--muted);font-size:11px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .time-active-ride-layout>#stopTimer{width:100%;min-height:50px;margin-top:12px!important}
      .time-active-tools{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:6px}
      .time-active-tools .btn{min-height:44px!important;margin:0!important;padding:8px 4px!important;border:0!important;border-radius:10px!important;background:transparent!important;color:var(--muted)!important;font-size:12px!important;font-weight:650!important;box-shadow:none!important}
      .time-active-tools .btn:active{background:color-mix(in srgb,var(--surface2) 70%,transparent)!important;color:var(--text)!important}
      #main>.active-card.time-pending-zone #finishPending{margin-top:auto!important}
      .log-stop-inline.time-task-zone-stop{min-height:var(--log-time-zone-min-height)!important}
      .log-stop-inline.time-task-zone-stop #saveInlineStop{margin-top:auto!important}
      .time-quick-note-existing{margin:8px 0 12px;padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:var(--surface2);color:var(--muted);font-size:11px;line-height:1.4;white-space:pre-wrap}
      @media(max-width:360px){
        :root{--log-time-zone-min-height:340px}
        .time-active-primary{gap:8px}
        .time-note-panel{min-height:164px}
        .time-note-symbol{width:44px;height:44px}
      }
    `;
    document.head.appendChild(style);
  }

  function stateTimer(){
    try{if(typeof state!=='undefined'&&state?.timer)return state.timer;}catch(_){}
    try{return JSON.parse(localStorage.getItem(TIME)||'{}').timer||{};}catch(_){return {};}
  }

  function noteSummary(){
    const note=String(stateTimer().note||'').trim();
    if(!note)return 'Snel toevoegen';
    const lines=note.split(/\n+/).map(line=>line.trim()).filter(Boolean);
    return lines.at(-1)||'Notitie aanwezig';
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
    openModal(`<div class="modal-head"><div><div class="kicker">Actieve taak</div><h2>Tussennotitie</h2></div><button class="close" aria-label="Sluiten">×</button></div><div class="field"><label>Notitie</label><textarea id="quickTaskNote" rows="3" placeholder="Wat wil je tussendoor vastleggen?"></textarea></div>${existing?`<div class="time-quick-note-existing">${typeof safeText==='function'?safeText(existing):existing}</div>`:''}<button id="saveQuickTaskNote" class="btn primary full">Toevoegen</button>`);
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

  function moveIf(parent,node){if(node&&node.parentElement!==parent)parent.appendChild(node);}

  function enhanceActive(card){
    if(card.dataset.timeRideLayout==='1'){
      const meta=card.querySelector('.time-note-meta');
      const text=noteSummary();
      if(meta&&meta.textContent!==text)meta.textContent=text;
      return;
    }
    const stop=card.querySelector('#stopTimer');
    const interruption=card.querySelector('#startInterruption');
    const edit=card.querySelector('#editActive');
    const clock=card.querySelector('#timerClock');
    if(!stop||!interruption||!edit||!clock)return;

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
    if(!card.querySelector('#finishPending'))return;
    card.classList.add('time-task-zone','time-pending-zone');
  }

  function enhanceStopPanel(){
    const save=document.getElementById('saveInlineStop');
    if(!save)return;
    const period=save.closest('.period-entry-mode')||save.closest('.period-overview');
    if(period)period.classList.add('time-task-zone-stop');
  }

  function enhance(){
    installStyle();
    const card=document.querySelector('#main>.active-card');
    if(card){
      if(card.querySelector('#stopTimer'))enhanceActive(card);
      else if(card.querySelector('#finishPending'))enhancePending(card);
      else card.classList.add('time-task-zone');
    }
    enhanceStopPanel();
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
