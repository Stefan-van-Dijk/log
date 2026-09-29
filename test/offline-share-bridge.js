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
function parseIdentifier(value){
  let id=String(value||'').trim();
  if(id.startsWith('https://')){
    const url=new URL(id);
    if(url.origin!=='https://sharon.life'||url.search||url.hash)throw Error('Gebruik een geldige gedeelde link.');
    const match=url.pathname.match(/^\/log\/config\/([A-Za-z0-9_-]{12})\.json$/);
    if(!match)throw Error('Gebruik een geldige gedeelde link.');
    id=match[1];
  }
  if(!VALID.test(id))throw Error('Gebruik een identifier van 12 tekens of een geldige gedeelde link.');
  return id;
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
    try{
      if(await openRecoveryForIdentifier(id))return;
      await window.LogCollaboration.showSharedStatus('card',cardId,null);
    }catch(error){
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
  if(!shared?.openByIdentifier)return false;
  if(shared.openByIdentifier.__offlineRecoveryBridge)return true;
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
  if(!cards?.show)return false;
  if(cards.show.__offlineRecoveryBridge)return true;
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
  if(!code?.preview)return false;
  if(code.preview.__offlineRecoveryBridge)return true;
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
function patchManualInput(){
  const shared=window.LogSharedCard;
  if(!shared?.bindManual)return false;
  if(shared.bindManual.__offlineRecoveryBridge)return true;
  const original=shared.bindManual.bind(shared);
  const wrapped=function(panel){
    original(panel);
    const form=panel?.querySelector?.('form');
    const input=form?.querySelector?.('input');
    const status=panel?.querySelector?.('[data-shared-error]');
    if(!form||!input)return;
    form.onsubmit=async event=>{
      event.preventDefault();
      if(status)status.textContent='';
      let id='';
      try{
        id=parseIdentifier(input.value);
        if(status)status.textContent='Deelstatus controleren…';
        if(await openRecoveryForIdentifier(id))return;
        if(status)status.textContent='';
        await window.LogSharedConfig.openByIdentifier(id);
      }catch(error){
        if(status)status.textContent=error?.message==='Load failed'
          ?'De gedeelde bron kan niet rechtstreeks worden geladen. Controleer of deze offline staat via de lokale kaart.'
          :(error?.message||'De gedeelde gegevens konden niet worden geopend.');
      }
    };
  };
  wrapped.__offlineRecoveryBridge=true;
  wrapped.__original=original;
  shared.bindManual=wrapped;
  return true;
}
function install(){
  const a=patchSharedOpen();
  const b=patchCards();
  const c=patchLogCode();
  const d=patchManualInput();
  if(!(a&&b&&c&&d)&&attempts++<240)setTimeout(install,50);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
install();
window.addEventListener('pageshow',install);
window.addEventListener('log-shell-view-refresh',install);
})();