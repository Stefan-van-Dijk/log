(function(){
'use strict';

let precisePromise=null;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function api(){return window.LogLocationPolling||null;}
async function precise(reason='manual'){
  if(document.hidden)throw Error('Log staat op de achtergrond.');
  const polling=api();if(!polling?.request)throw Error('Locatiecontrole is nog niet beschikbaar.');if(precisePromise)return precisePromise;
  precisePromise=(async()=>{const startedAt=Date.now();try{const position=await polling.request({maxAge:0,highAccuracy:true,reason});window.dispatchEvent(new CustomEvent('log-location-precision-ready',{detail:{reason,position,startedAt,finishedAt:Date.now()}}));return position;}catch(error){window.dispatchEvent(new CustomEvent('log-location-precision-error',{detail:{reason,error}}));throw error;}finally{precisePromise=null;}})();return precisePromise;
}
function showPrecisionError(error){const message=error?.message||'Er kon geen nauwkeurige locatie worden bepaald.';window.LogCardsUI?.sheet?.('Locatie controleren',`<p class="cards-notice">${esc(message)}</p><p class="cards-notice">De actie is nog niet uitgevoerd. Probeer het opnieuw zodra de locatie beschikbaar is.</p>`);}
function syncHelpText(){document.querySelectorAll('.cards-notice').forEach(node=>{const text=String(node.textContent||'');if(text.includes('elke 6 seconden zonder actieve rit')||text.includes('bij openen één keer nauwkeurig')||text.includes('ongeveer elke 10 seconden zuinig gecontroleerd'))node.textContent='Log controleert de locatie bij openen of terugkeren en bij handelingen. Buiten een actieve rit is er standaard geen periodieke GPS-controle. Tijdens een rit controleert Log elke minuut; vlak vóór een locatieactie wordt zo nodig een nauwkeurige GPS-meting gevraagd.';});}
document.addEventListener('click',async event=>{
  const button=event.target.closest?.('[data-la-propose]');if(!button)return;
  if(button.dataset.locationPrecisionReady==='1'){delete button.dataset.locationPrecisionReady;return;}
  event.preventDefault();event.stopImmediatePropagation();const previousDisabled=button.disabled;button.disabled=true;
  try{await precise('location-action');button.dataset.locationPrecisionReady='1';button.disabled=previousDisabled;button.click();}catch(error){button.disabled=previousDisabled;showPrecisionError(error);}
},true);
function install(){syncHelpText();window.LogLocationPrecision={precise};}
window.addEventListener('pageshow',syncHelpText);
window.addEventListener('log-shell-view-refresh',()=>setTimeout(syncHelpText,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
