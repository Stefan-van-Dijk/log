(function(){
  'use strict';

  const localPolicy=window.LogRemovalPolicy;
  if(!localPolicy)return;

  function topLevelConfirmationAvailable(){
    if(window.parent===window)return false;
    try{
      return Boolean(window.parent?.document?.body&&window.parent?.LogRemovalPolicy?.confirmDelete);
    }catch(_){
      return false;
    }
  }

  async function confirmDelete(plan,options={}){
    if(topLevelConfirmationAvailable()){
      return window.parent.LogRemovalPolicy.confirmDelete(plan,{...options,document:window.parent.document});
    }
    return localPolicy.confirmDelete(plan,options);
  }

  window.LogRemovalPolicy=Object.freeze({...localPolicy,confirmDelete});
})();
