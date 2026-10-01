(function(){
  'use strict';

  function clean(root){
    if(!root)return;
    root.classList.add('log-home-template-root');
    root.querySelectorAll(':scope>.log-template-action').forEach(node=>node.classList.remove('log-template-action'));
    root.querySelectorAll(':scope>.log-template-period').forEach(node=>node.classList.remove('log-template-period'));
    root.querySelectorAll(':scope>.log-template-list').forEach(node=>node.classList.remove('log-template-list'));
  }

  function markRide(){
    const root=document.getElementById('app');
    if(!root)return;
    clean(root);

    const action=root.querySelector(':scope>.hero');
    if(action){
      action.classList.add('log-template-action');
      action.dataset.logTemplateState=action.classList.contains('active-hero')?'active':'idle';
    }

    const period=root.querySelector(':scope>#periodNavigator.period-navigator');
    if(period)period.classList.add('log-template-period');

    const list=[...root.querySelectorAll(':scope>.section')].find(section=>
      String(section.querySelector(':scope>.section-title h2,:scope>.section-title h3')?.textContent||'').trim()==='Recente ritten'
    );
    if(list)list.classList.add('log-template-list');
  }

  function markTime(){
    const root=document.getElementById('main');
    if(!root)return;
    clean(root);

    const action=root.querySelector(':scope>.suggestion,:scope>.active-card');
    if(action){
      action.classList.add('log-template-action');
      action.dataset.logTemplateState=action.classList.contains('suggestion')?'idle':'active';
    }

    const period=root.querySelector(':scope>.period-overview,:scope>.period-nav');
    if(period)period.classList.add('log-template-period');

    const list=[...root.querySelectorAll(':scope>.section')].find(section=>
      String(section.querySelector(':scope>.section-title h2,:scope>.section-title h3')?.textContent||'').trim()==='Registraties'
    );
    if(list)list.classList.add('log-template-list');
  }

  let queued=false;
  function sync(){
    queued=false;
    markRide();
    markTime();
  }
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(sync);
  }

  function init(){
    sync();
    new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
    for(const eventName of ['pageshow','resize','orientationchange','log-shell-view-refresh','log-time-state-change','log-km-state-change'])window.addEventListener(eventName,queue);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
