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

  function embeddedFrame(){
    if(window.parent===window)return null;
    try{return window.frameElement||null;}catch(_){return null;}
  }

  async function confirmDelete(plan,options={}){
    if(topLevelConfirmationAvailable()){
      const parentDocument=window.parent.document;
      const frame=embeddedFrame();
      const previous=frame?{
        visibility:frame.style.getPropertyValue('visibility'),
        visibilityPriority:frame.style.getPropertyPriority('visibility'),
        pointerEvents:frame.style.getPropertyValue('pointer-events'),
        pointerEventsPriority:frame.style.getPropertyPriority('pointer-events')
      }:null;
      if(frame){
        frame.style.setProperty('visibility','hidden','important');
        frame.style.setProperty('pointer-events','none','important');
      }
      try{
        return await window.parent.LogRemovalPolicy.confirmDelete(plan,{...options,document:parentDocument});
      }finally{
        if(frame?.isConnected&&previous){
          if(previous.visibility)frame.style.setProperty('visibility',previous.visibility,previous.visibilityPriority);
          else frame.style.removeProperty('visibility');
          if(previous.pointerEvents)frame.style.setProperty('pointer-events',previous.pointerEvents,previous.pointerEventsPriority);
          else frame.style.removeProperty('pointer-events');
        }
      }
    }
    return localPolicy.confirmDelete(plan,options);
  }

  window.LogRemovalPolicy=Object.freeze({...localPolicy,confirmDelete});
})();
