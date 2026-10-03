(function(){
'use strict';

function ensureAnchors(){
  document.querySelectorAll('.people-detail').forEach(detail=>{
    if(detail.querySelector('[data-c2-person-link]'))return;
    const block=document.createElement('div');
    block.dataset.c2PersonLink='1';
    block.className='people-detail-log-link';
    detail.appendChild(block);
  });
}

function queue(){requestAnimationFrame(ensureAnchors);}

ensureAnchors();
new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true});
['log-time-state-change','log-shell-view-refresh','pageshow'].forEach(name=>window.addEventListener(name,queue));
})();