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
      [data-log-stop-context-hidden="1"]{display:none!important}
      .log-stop-inline{padding-top:10px!important}
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
      .log-stop-inline #saveInlineStop{margin-top:8px!important;min-height:48px!important}
      .log-stop-inline .inline-register-context{margin-top:5px!important;font-size:9px!important}
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

  function enhance(){
    const save=document.getElementById('saveInlineStop');
    if(!save){restoreHidden();return;}
    const period=save.closest('.period-entry-mode')||save.closest('.period-overview');
    if(!period)return;
    period.classList.add('log-stop-inline');
    hideDuplicatePending(period);
    compactColleagues(period);
  }

  function install(){
    installStyle();
    enhance();
    const observer=new MutationObserver(enhance);
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();