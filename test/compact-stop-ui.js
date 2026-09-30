(function(){
  'use strict';

  const TIME='urenregistratie.test.pwa.v1';
  const STYLE_ID='logCompactStopUiStyle';

  function read(){
    try{const value=JSON.parse(localStorage.getItem(TIME)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}
  }

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .log-colleague-compact{padding:8px 0!important}
      .log-colleague-compact>h3{display:none}
      .log-colleague-toggle{width:100%;display:flex;align-items:center;gap:10px;min-height:52px;padding:10px 2px;border:0;background:transparent;color:inherit;text-align:left}
      .log-colleague-toggle-main{flex:1;display:flex;flex-direction:column;gap:3px}
      .log-colleague-toggle-title{font-size:16px;font-weight:760;line-height:1.2}
      .log-colleague-toggle-meta{font-size:12px;color:var(--muted,#929ca8);font-weight:520;line-height:1.25}
      .log-colleague-toggle-count{font-size:13px;color:var(--muted,#929ca8);white-space:nowrap}
      .log-colleague-toggle-chevron{font-size:22px;color:var(--muted,#929ca8);line-height:1;transition:transform .16s ease}
      .log-colleague-compact[data-open="1"] .log-colleague-toggle-chevron{transform:rotate(90deg)}
      .log-colleague-body[hidden]{display:none!important}
      .log-colleague-body{padding-top:6px}
      .log-colleague-compact .check-list{gap:5px}
      .log-colleague-compact .check-row{padding:8px 10px;border-radius:10px}
      .log-colleague-compact .inline-form{margin-top:8px}
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
    const selected=[...section.querySelectorAll('.stopcol-check:checked')];
    if(!selected.length)return 'Geen';
    if(selected.length===1){
      const label=section.querySelector(`label[for="${CSS.escape(selected[0].id)}"]`);
      return label?.textContent?.trim()||'1 persoon';
    }
    return `${selected.length} personen`;
  }

  function enhance(){
    const list=document.getElementById('stopColleagueList');
    if(!list)return;
    const section=list.closest('.settings-section');
    if(!section||section.dataset.compactColleagues==='1')return;
    section.dataset.compactColleagues='1';
    section.classList.add('log-colleague-compact');
    section.dataset.open='0';

    const heading=section.querySelector('h3');
    const children=[...section.children].filter(node=>node!==heading);
    const body=document.createElement('div');
    body.className='log-colleague-body';
    body.hidden=true;
    children.forEach(node=>body.appendChild(node));

    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='log-colleague-toggle';
    toggle.setAttribute('aria-expanded','false');
    toggle.innerHTML=`<span class="log-colleague-toggle-main"><span class="log-colleague-toggle-title">Inzet van anderen</span><span class="log-colleague-toggle-meta"></span></span><span class="log-colleague-toggle-count"></span><span class="log-colleague-toggle-chevron">›</span>`;
    if(heading)heading.after(toggle);else section.prepend(toggle);
    toggle.after(body);

    const meta=toggle.querySelector('.log-colleague-toggle-meta');
    const count=toggle.querySelector('.log-colleague-toggle-count');
    const update=()=>{
      count.textContent=selectedSummary(section);
      const frequent=frequentNames();
      meta.textContent=frequent.length?`Vaak bij deze taak: ${frequent.join(', ')}`:'Alleen toevoegen als iemand heeft meegewerkt';
    };
    update();

    toggle.addEventListener('click',()=>{
      const open=section.dataset.open!=='1';
      section.dataset.open=open?'1':'0';
      body.hidden=!open;
      toggle.setAttribute('aria-expanded',open?'true':'false');
    });
    section.addEventListener('change',event=>{if(event.target?.matches('.stopcol-check'))update();});
    section.addEventListener('click',event=>{if(event.target?.closest('#stopAddColleague'))setTimeout(update,0);});
  }

  function install(){
    installStyle();
    enhance();
    const observer=new MutationObserver(enhance);
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();