(function(){
  'use strict';

  const DATA_KEY='kmreg-test-v4-data';
  const ALLOWED=[5000,10000,15000,30000,60000,120000,300000];
  const OPTIONS=[
    ['auto','Automatisch'],
    ['5000','Elke 5 seconden'],
    ['10000','Elke 10 seconden'],
    ['15000','Elke 15 seconden'],
    ['30000','Elke 30 seconden'],
    ['60000','Elke minuut'],
    ['120000','Elke 2 minuten'],
    ['300000','Elke 5 minuten']
  ];

  function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}

  function readRaw(){
    try{return JSON.parse(localStorage.getItem(DATA_KEY)||'{}')||{};}catch(_){return {};}
  }

  function configuredValue(){
    const value=Number(readRaw()?.settings?.locationRefreshIntervalMs);
    return ALLOWED.includes(value)?String(value):'auto';
  }

  function save(value){
    const raw=readRaw();
    raw.settings=raw.settings&&typeof raw.settings==='object'?{...raw.settings}:{};
    const numeric=Number(value);
    if(value==='auto'||!ALLOWED.includes(numeric))delete raw.settings.locationRefreshIntervalMs;
    else raw.settings.locationRefreshIntervalMs=numeric;
    localStorage.setItem(DATA_KEY,JSON.stringify(raw));
    window.dispatchEvent(new CustomEvent('log-location-refresh-change',{detail:{intervalMs:value==='auto'?null:numeric}}));
  }

  function installStyles(){
    if(document.getElementById('logLocationRefreshSettingStyles'))return;
    const style=document.createElement('style');
    style.id='logLocationRefreshSettingStyles';
    style.textContent=`
      .log-location-refresh-setting{margin:12px 0 15px;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
      .log-location-refresh-setting label{display:block;color:var(--text);font-size:14px;font-weight:720}
      .log-location-refresh-setting select{width:100%;min-height:44px;margin-top:8px;padding:8px 36px 8px 11px;border:1px solid var(--line);border-radius:11px;background:var(--card2);color:var(--text);font:inherit;font-size:15px;outline:none}
      .log-location-refresh-setting small{display:block;margin-top:7px;color:var(--muted);font-size:11px;line-height:1.4;font-weight:450}
    `;
    document.head.appendChild(style);
  }

  function syncIntro(section){
    const notice=section?.querySelector('.cards-notice');
    if(!notice)return;
    const text='Log vraagt bij openen je locatie op en ververst die zolang de app zichtbaar is volgens de instelling hierboven. Hiervoor is locatietoestemming nodig. Er is geen aparte hoofdschakelaar. Per actie bepaal je of die actief is. Dit geeft geen locatieherkenning wanneer Log gesloten is.';
    if(notice.textContent!==text)notice.textContent=text;
  }

  function render(){
    installStyles();
    const section=document.querySelector('#kmShellLocationSettings section');
    if(!section)return;
    syncIntro(section);
    if(section.querySelector('[data-log-location-refresh-setting]'))return;
    const box=document.createElement('div');
    box.className='log-location-refresh-setting';
    box.dataset.logLocationRefreshSetting='1';
    const selected=configuredValue();
    box.innerHTML=`<label for="logLocationRefreshInterval">Locatie verversen</label><select id="logLocationRefreshInterval" aria-label="Locatie verversen">${OPTIONS.map(([value,label])=>`<option value="${value}"${value===selected?' selected':''}>${esc(label)}</option>`).join('')}</select><small>Alleen zolang Log zichtbaar is. Automatisch gebruikt 6 seconden zonder actieve rit en 1 minuut tijdens een actieve rit. Een vaste keuze geldt in beide situaties.</small>`;
    const heading=section.querySelector('h3');
    if(heading)heading.insertAdjacentElement('afterend',box);else section.prepend(box);
    box.querySelector('select')?.addEventListener('change',event=>save(event.target.value));
  }

  function sync(){
    render();
    const select=document.getElementById('logLocationRefreshInterval');
    if(select&&document.activeElement!==select){
      const value=configuredValue();
      if(select.value!==value)select.value=value;
    }
  }

  function init(){
    sync();
    new MutationObserver(sync).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pageshow',sync);
    window.addEventListener('log-shell-view-refresh',sync);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();