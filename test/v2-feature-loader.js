(function(){
  'use strict';

  const BUILD='0.39-test.5';
  window.LOG_TEST_BUILD=BUILD;

  const scripts=[
    ['identity-sync.js','logIdentitySyncBridge',''],
    ['collaboration-v2.js','logCollaborationV2Bridge',''],
    ['collaboration-v2-consistency.js','logCollaborationV2Consistency',''],
    ['collaboration-v2-multiparty.js','logCollaborationV2Multiparty',''],
    ['collaboration-v2-awareness.js','logCollaborationV2Awareness',''],
    ['person-card-v2.js','logPersonCardV2','-person12'],
    ['person-card-v2-anchor.js','logPersonCardV2Anchor',''],
    ['person-card-v2-dialog-guard.js','logPersonCardV2DialogGuard','']
  ];

  function existing(key){
    return [...document.scripts].find(script=>script.dataset[key]==='1')||null;
  }

  function load(src,key,suffix=''){
    return new Promise(resolve=>{
      if(existing(key)){resolve();return;}
      const script=document.createElement('script');
      script.src=`./${src}?v=${BUILD}${suffix}`;
      script.async=false;
      script.dataset[key]='1';
      script.onload=()=>resolve();
      script.onerror=()=>{console.error(`Log v2 kon ${src} niet laden.`);resolve();};
      document.head.appendChild(script);
    });
  }

  function syncVersion(){
    window.LOG_TEST_BUILD=BUILD;
    document.querySelectorAll('.km-shell-version').forEach(node=>{
      const label=node.querySelector('.km-shell-version-label');
      const number=node.querySelector('.km-shell-version-number');
      if(label)label.textContent='TEST';
      if(number)number.textContent=BUILD;
      node.setAttribute('aria-label',`Geladen testversie ${BUILD}`);
    });
  }

  async function start(){
    for(const [src,key,suffix] of scripts)await load(src,key,suffix);
    syncVersion();
    window.dispatchEvent(new CustomEvent('log-v2-feature-layer-ready',{detail:{build:BUILD}}));
  }

  start();
  new MutationObserver(syncVersion).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',syncVersion);
  window.addEventListener('log-shell-view-refresh',syncVersion);
})();