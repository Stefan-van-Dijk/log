(function(){
  'use strict';
  let queued=false;

  function compactUpdateComparison(){
    queued=false;
    const buttons=document.querySelectorAll('[data-shared-open-current]');
    buttons.forEach(button=>{
      const panel=button.closest('dialog,.modal-panel')||button.parentElement;
      if(!panel||panel.dataset.sharedUpdateCompact==='1')return;
      panel.dataset.sharedUpdateCompact='1';

      const identifier=panel.querySelector('code');
      const identifierRow=identifier?.closest('p');
      if(identifierRow){identifierRow.hidden=true;identifierRow.setAttribute('aria-hidden','true');}

      const preview=panel.querySelector('[data-shared-preview]');
      if(preview){
        const surface=preview.closest('.code-surface')||preview;
        surface.hidden=true;
        surface.setAttribute('aria-hidden','true');
      }
    });
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(compactUpdateComparison);
  }

  function init(){
    queue();
    const observer=new MutationObserver(queue);
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('log-shared-config-update-state',queue);
    window.addEventListener('pageshow',queue);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
