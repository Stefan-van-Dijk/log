(function(){
'use strict';

const CONFIG_KEY='log-test-location-refresh-v1';
const ALLOWED=new Set([60000,120000,300000]);
const OPTIONS=[
  [60000,'1 minuut'],
  [120000,'2 minuten'],
  [300000,'5 minuten']
];
const DEFAULT_INTERVAL=300000;
let syncing=false;

function readConfig(){
  try{
    const parsed=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}')||{},interval=Number(parsed.globalIntervalMs);
    return{automaticEnabled:parsed.automaticEnabled===true,globalIntervalMs:ALLOWED.has(interval)?interval:DEFAULT_INTERVAL};
  }catch(_){return{automaticEnabled:false,globalIntervalMs:DEFAULT_INTERVAL};}
}
function writeConfig(config,reason='setting'){
  const normalized={automaticEnabled:config.automaticEnabled===true,globalIntervalMs:ALLOWED.has(Number(config.globalIntervalMs))?Number(config.globalIntervalMs):DEFAULT_INTERVAL};
  localStorage.setItem(CONFIG_KEY,JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('log-location-refresh-change',{detail:{reason,config:normalized}}));
}
function installStyles(){
  if(document.getElementById('logLocationRefreshSettingStyles'))return;
  const style=document.createElement('style');style.id='logLocationRefreshSettingStyles';style.textContent=`
  .log-location-refresh-setting{margin:12px 0 15px;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card);display:grid;gap:12px}
  .log-location-auto-row{display:flex;align-items:center;justify-content:space-between;gap:14px}.log-location-auto-row span{display:grid;gap:3px}.log-location-auto-row strong{font-size:14px}.log-location-auto-row small,.log-location-auto-note{color:var(--muted);font-size:11px;line-height:1.4}
  .log-location-auto-options{display:grid;gap:6px;padding-top:10px;border-top:1px solid var(--line)}.log-location-auto-options[hidden]{display:none}.log-location-auto-options label{font-size:12px;font-weight:700}.log-location-auto-options select{width:100%;padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:var(--card2,#1d2430);color:var(--text)}
  #kmShellMenuButton{overflow:visible!important}.log-location-check-pulse{position:absolute;z-index:3;left:50%;top:50%;width:5px;height:5px;border-radius:50%;background:var(--accent);opacity:0;pointer-events:none;transform:translate(-50%,-50%) scale(.4)}.log-location-check-pulse.is-pulsing{animation:logLocationCheckPulse 920ms cubic-bezier(.22,1,.36,1) both}@keyframes logLocationCheckPulse{0%{opacity:0;transform:translate(-50%,-50%) scale(.35)}22%{opacity:.72;transform:translate(calc(-50% + 2px),-50%) scale(.78)}62%{opacity:.44;transform:translate(calc(-50% + 14px),-50%) scale(1)}100%{opacity:0;transform:translate(calc(-50% + 24px),-50%) scale(.6)}}
  @media(prefers-reduced-motion:reduce){.log-location-check-pulse.is-pulsing{animation:none}}
  `;document.head.appendChild(style);
}
function syncIntro(section){
  const notice=section?.querySelector('.cards-notice');if(!notice)return;
  const text='Log controleert je locatie bij openen of terugkeren naar de app en bij handelingen. Tijdens een actieve rit gebeurt dat daarnaast elke minuut. Buiten een rit draait standaard geen periodieke GPS-controle.';
  if(notice.textContent!==text)notice.textContent=text;
}
function renderGlobal(){
  const section=document.querySelector('#kmShellLocationSettings section');if(!section)return;
  syncIntro(section);
  let box=section.querySelector('[data-log-location-refresh-setting]');
  if(!box){box=document.createElement('div');box.className='log-location-refresh-setting';box.dataset.logLocationRefreshSetting='1';const heading=section.querySelector('h3');if(heading)heading.insertAdjacentElement('afterend',box);else section.prepend(box);}
  const config=readConfig(),options=OPTIONS.map(([value,label])=>`<option value="${value}"${config.globalIntervalMs===value?' selected':''}>${label}</option>`).join('');
  box.innerHTML=`<label class="log-location-auto-row"><span><strong>Aanvullende automatische locatiecontrole</strong><small>Extra controles zolang Log zichtbaar is. Niet nodig voor openen, handelingen of actieve ritten.</small></span><input type="checkbox" role="switch" data-log-location-auto ${config.automaticEnabled?'checked':''}></label><div class="log-location-auto-options" data-log-location-auto-options ${config.automaticEnabled?'':'hidden'}><label for="logLocationAutoInterval">Extra controle</label><select id="logLocationAutoInterval" data-log-location-auto-interval>${options}</select><span class="log-location-auto-note">Bij uitgeschakelde automatische controle blijft Log event-driven werken. Tijdens een actieve rit blijft de interval 1 minuut.</span></div>`;
  const toggle=box.querySelector('[data-log-location-auto]'),interval=box.querySelector('[data-log-location-auto-interval]'),advanced=box.querySelector('[data-log-location-auto-options]');
  toggle.onchange=()=>{const current=readConfig();current.automaticEnabled=toggle.checked;writeConfig(current,'automatic-toggle');advanced.hidden=!toggle.checked;};
  interval.onchange=()=>{const current=readConfig();current.globalIntervalMs=Number(interval.value);writeConfig(current,'automatic-interval');};
}
function ensurePulse(){
  const button=document.getElementById('kmShellMenuButton');if(!button)return null;
  let pulse=button.querySelector('.log-location-check-pulse');if(!pulse){pulse=document.createElement('span');pulse.className='log-location-check-pulse';pulse.setAttribute('aria-hidden','true');button.appendChild(pulse);}return pulse;
}
function pulseLocationCheck(){const pulse=ensurePulse();if(!pulse)return;pulse.classList.remove('is-pulsing');void pulse.offsetWidth;pulse.classList.add('is-pulsing');setTimeout(()=>pulse.classList.remove('is-pulsing'),1000);}
function sync(){if(syncing)return;syncing=true;requestAnimationFrame(()=>{syncing=false;installStyles();renderGlobal();ensurePulse();});}
function init(){
  const existing=readConfig();writeConfig(existing,'migrate-event-driven');
  sync();
  const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pageshow',sync);window.addEventListener('log-shell-view-refresh',sync);window.addEventListener('log-location-check-start',pulseLocationCheck);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
