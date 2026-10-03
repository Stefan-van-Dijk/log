(function(){
'use strict';

let queued=false;
function close(){window.LogCardsUI?.close?.();}
function repair(){
  queued=false;
  document.querySelectorAll('dialog.cards-dialog').forEach(dialog=>{
    if(dialog.querySelector(':scope>header'))return;
    const personCard=dialog.querySelector('[data-pc-copy],[data-pc-refresh],[data-pc-link],[data-pc-person],[data-pc-retry],.log-pc-profile')||/persoonskaart/i.test(dialog.textContent||'');
    if(!personCard)return;
    const header=document.createElement('header');
    header.innerHTML=`<h2>${dialog.querySelector('[data-pc-copy],[data-pc-refresh]')?'Mijn persoonskaart':'Persoonskaart'}</h2><button type="button" data-pc-guard-close aria-label="Sluiten">×</button>`;
    dialog.prepend(header);
    header.querySelector('[data-pc-guard-close]').onclick=close;
  });
}
function queue(){if(queued)return;queued=true;requestAnimationFrame(repair);}
function install(){queue();new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
