(function(){
  'use strict';
  const BUILD='0.40.4';
  window.LOG_TEST_BUILD=window.LOG_BUILD||'0.37';

  function load(src,key,ready){
    return new Promise((resolve,reject)=>{
      if((typeof ready==='function'&&ready())||document.querySelector(`script[data-live-sharing="${key}"]`)){resolve();return;}
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
      ['shared-card-import.js','shared-card-import',()=>typeof window.LogSharedConfig?.openByIdentifier==='function'],
      ['shared-config-bridge.js','shared-config-bridge',()=>!!window.LogExecutablePayloadBridge],
      ['sharing.js','sharing',()=>typeof window.LogSharing?.publish==='function'],
      ['sharing-private-ui.js','sharing-private-ui',()=>typeof window.LogSharingUI?.resolveSurface==='function'],
      ['collaboration.js','collaboration',()=>typeof window.LogCollaboration?.syncRemoteAccess==='function'],
      ['shared-id-separation.js','shared-id-separation',()=>typeof window.LogSharedIdentity?.migrate==='function'],
      ['offline-share-bridge.js','offline-share-bridge',()=>window.LogSharedConfig?.openByIdentifier?.__offlineRecoveryBridge===true],
      ['qr-action-direct.js','qr-action-direct',()=>window.LogLocationActions?.scanCode?.__directQrAction===true]
    ];
    for(const [src,key,ready] of modules){
      try{await load(src,key,ready);}catch(error){console.error('Log live sharing:',error);}
    }
    window.dispatchEvent(new Event('log-shell-view-refresh'));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
