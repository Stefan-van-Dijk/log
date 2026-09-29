(function(){
'use strict';

const VALID=/^[A-Za-z0-9_-]{12}$/;
let attempts=0;

function localSharedRoot(id){
  try{return window.LogSharedConfig?.storedRoot?.(id)||null;}catch(_){return null;}
}
function identifierForCard(cardId){
  try{return String(window.LogCollaboration?.identifierForItem?.('card',cardId)||'');}catch(_){return '';}
}
function labelFor(id){
  try{
    const state=JSON.parse(localStorage.getItem('log-test-sharing-v1')||'{}');
    const meta=state?.collaboration?.[id]||{};
    if(meta.revoked)return 'Als nieuwe deling publiceren';
    if(meta.offline)return meta.reactivationMode==='new-id'?'Opnieuw delen':'Opnieuw online zetten';
    return meta.collaboration?'Delen / publiceren':'Deling beheren';
  }catch(_){return 'Deling beheren';}
}
async function openRecoveryForIdentifier(id){
  if(!VALID.test(String(id||''))||!window.LogCollaboration)return false;
  let remote=null;
  try{remote=await window.LogCollaboration.syncRemoteAccess(id);}catch(_){}
  const state=remote?.state||{};
  if(!state.offline&&!state.revoked)return false;
  const root=localSharedRoot(id);
  if(root?.object?.id){
    await window.LogCollaboration.showSharedStatus(root.type||'card',root.object.id,null);
    return true;
  }
  const ui=window.LogCardsUI;
  if(ui?.sheet){
    const title=state.revoked?'Identifier ingetrokken':'Gedeelde kaart offline';
    const text=state.revoked
      ?'Deze identifier is definitief ingetrokken. Op dit apparaat is geen lokale kopie gevonden om opnieuw te delen.'
      :'Deze gedeelde kaart staat offline. Op dit apparaat is geen lokale kopie gevonden om opnieuw online te zetten.';
    const panel=ui.sheet(title,`<p>${text}</p><button class="btn full" data-offline-share-close>Sluiten</button>`);
    panel.querySelector('[data-offline-share-close]').onclick=()=>ui.close();
    return true;
  }
  return false;
}
function augmentOpenCard(cardId){
  const id=identifierForCard(cardId);
  if(!VALID.test(id))return;
  const panel=document.querySelector('dialog.cards-dialog.cards-display[open],dialog.cards-dialog.cards-display');
  const body=panel?.querySelector('.cards-dialog-body');
  if(!body||body.querySelector('[data-shared-card-manage]'))return;
  const button=document.createElement('button');
  button.type='button';
  button.className='btn secondary full';
  button.dataset.sharedCardManage='1';
  button.textContent=labelFor(id);
  button.onclick=async()=>{
    button.disabled=true;
    try{await window.LogCollaboration.showSharedStatus('card',cardId,null);}
    catch(error){
      button.disabled=false;
      const message=panel.querySelector('[data-card-message]');
      if(message)message.textContent=error?.message||'De deling kon niet worden geopend.';
    }
  };
  const details=body.querySelector('.cards-content-details');
  if(details)details.insertAdjacentElement('afterend',button);else body.appendChild(button);
}
function patchSharedOpen(){
  const shared=window.LogSharedConfig;
  if(!shared?.openByIdentifier||shared.openByIdentifier.__offlineRecoveryBridge)return false;
  const original=shared.openByIdentifier.bind(shared);
  const wrapped=async id=>{
    if(await openRecoveryForIdentifier(id))return true;
    return original(id);
  };
  wrapped.__offlineRecoveryBridge=true;
  wrapped.__original=original;
  shared.openByIdentifier=wrapped;
  if(window.LogSharedCard)window.LogSharedCard.openByIdentifier=wrapped;
  return true;
}
function patchCards(){
  const cards=window.LogCardsModule;
  if(!cards?.show||cards.show.__offlineRecoveryBridge)return false;
  const original=cards.show.bind(cards);
  const wrapped=function(id,recognized){
    const result=original(id,recognized);
    setTimeout(()=>augmentOpenCard(id),0);
    return result;
  };
  wrapped.__offlineRecoveryBridge=true;
  wrapped.__original=original;
  cards.show=wrapped;
  return true;
}
function patchLogCode(){
  const code=window.LogCode;
  if(!code?.preview||code.preview.__offlineRecoveryBridge)return false;
  const original=code.preview.bind(code);
  const wrapped=function(payload){
    if(payload?.kind==='log-action'&&VALID.test(String(payload.id||''))&&localSharedRoot(payload.id)){
      return window.LogSharedConfig?.openByIdentifier?.(payload.id);
    }
    return original(payload);
  };
  wrapped.__offlineRecoveryBridge=true;
  wrapped.__original=original;
  code.preview=wrapped;
  return true;
}
function install(){
  const ready=patchSharedOpen()&&patchCards()&&patchLogCode();
  if(!ready&&attempts++<200)setTimeout(install,50);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
install();
window.addEventListener('pageshow',install);
window.addEventListener('log-shell-view-refresh',install);
})();