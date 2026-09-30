(function(){
  'use strict';
  const BUILD='0.37-sharing17';
  window.LOG_TEST_BUILD=window.LOG_BUILD||'0.37';

  function load(src,key){
    return new Promise((resolve,reject)=>{
      if(document.querySelector(`script[data-live-sharing="${key}"]`)){resolve();return;}
      const script=document.createElement('script');
      script.src=`./${src}?v=${encodeURIComponent(BUILD)}`;
      script.async=false;
      script.dataset.liveSharing=key;
      script.onload=resolve;
      script.onerror=()=>reject(new Error(`${src} kon niet worden geladen.`));
      document.head.appendChild(script);
    });
  }

  async function install(){
    const modules=[
      ['shared-card-import.js','shared-card-import'],
      ['shared-config-bridge.js','shared-config-bridge'],
      ['sharing.js','sharing'],
      ['sharing-private-ui.js','sharing-private-ui'],
      ['collaboration.js','collaboration'],
      ['shared-id-separation.js','shared-id-separation'],
      ['offline-share-bridge.js','offline-share-bridge']
    ];
    for(const [src,key] of modules){
      try{await load(src,key);}catch(error){console.error('Log live sharing:',error);}
    }
    window.dispatchEvent(new Event('log-shell-view-refresh'));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
