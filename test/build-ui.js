(function(){
  'use strict';
  const BUILD='0.37-test';
  window.LOG_TEST_BUILD=BUILD;

  function render(){
    window.LOG_TEST_BUILD=BUILD;
    const today=document.getElementById('today');
    if(today){
      const current=today.textContent||'';
      const versionPattern=/ · (?:\d+\.\d+(?:\.\d+)?(?:-test(?:\.\d+)?)?)$/;
      const next=versionPattern.test(current)?current.replace(versionPattern,' · '+BUILD):current+' · '+BUILD;
      if(next!==current)today.textContent=next;
    }
    document.querySelectorAll('.km-shell-version-number').forEach(node=>{if(node.textContent!==BUILD)node.textContent=BUILD;});
    document.querySelectorAll('.km-shell-version').forEach(node=>node.setAttribute('aria-label','Geladen testversie '+BUILD));
  }

  function init(){
    render();
    let queued=false;
    new MutationObserver(()=>{
      if(queued)return;
      queued=true;
      requestAnimationFrame(()=>{queued=false;render();});
    }).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pageshow',render);
    window.addEventListener('log-shell-view-refresh',render);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
