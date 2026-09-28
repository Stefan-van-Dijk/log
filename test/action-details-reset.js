(function(){
  'use strict';

  function installStyles(){
    if(document.getElementById('logActionResetDetailsStyles'))return;
    const style=document.createElement('style');
    style.id='logActionResetDetailsStyles';
    style.textContent='.la-reset-actions{display:none!important} .log-action-detail-reset{margin-top:8px}';
    document.head.appendChild(style);
  }

  function inject(){
    document.querySelectorAll('[data-la-details]').forEach(details=>{
      const id=String(details.dataset.laDetails||'');
      const dialog=details.closest('dialog');
      if(!id||!dialog||dialog.querySelector('[data-la-detail-reset]'))return;
      const edit=dialog.querySelector('[data-la-detail-edit]');
      const button=document.createElement('button');
      button.type='button';
      button.className='btn secondary full log-action-detail-reset';
      button.dataset.laDetailReset=id;
      button.textContent='Actie resetten';
      button.addEventListener('click',()=>{
        try{
          window.LogLocationActions?.reset?.(id);
          button.textContent='Actie gereset';
          setTimeout(()=>{if(button.isConnected)button.textContent='Actie resetten';},1400);
        }catch(error){
          const message=dialog.querySelector('[data-card-message]');
          if(message)message.textContent=error?.message||'Resetten is niet gelukt.';
        }
      });
      if(edit)edit.insertAdjacentElement('afterend',button);
      else details.insertAdjacentElement('afterend',button);
    });
  }

  function init(){
    installStyles();
    inject();
    const observer=new MutationObserver(inject);
    observer.observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
