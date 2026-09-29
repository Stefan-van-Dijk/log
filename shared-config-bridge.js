(function(){
  'use strict';
  let timer=null,attempts=0;

  function install(){
    const api=window.LogCode,shared=window.LogSharedConfig;
    if(!api?.preview||!shared?.hasConfiguration){
      if(attempts++<120)timer=setTimeout(install,50);
      return;
    }
    if(api.preview.__sharedConfigBridge)return;
    const original=api.preview.bind(api);
    const wrapped=function(payload){
      if(payload&&['log-action','log-task'].includes(payload.kind)&&typeof payload.id==='string'&&shared.hasConfiguration(payload.id)){
        return shared.openByIdentifier(payload.id);
      }
      return original(payload);
    };
    wrapped.__sharedConfigBridge=true;
    wrapped.__original=original;
    api.preview=wrapped;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  install();
  window.addEventListener('pageshow',install);
})();