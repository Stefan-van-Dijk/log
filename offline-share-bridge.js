(function(){
'use strict';

const VALID=/^[A-Za-z0-9_-]{12}$/;
const ENDPOINT='https://sharon.life/log/api/publish.php';
let attempts=0;

function rawSharingState(){
  try{const value=JSON.parse(localStorage.getItem('log-test-sharing-v1')||'{}');return value&&typeof value==='object'?value:{};}catch(_){return {};}
}
function localSharedRoot(id){
  try{return window.LogSharedConfig?.storedRoot?.(id)||null;}catch(_){return null;}
}
function identifierForCard(cardId){
  try{return String(window.LogCollaboration?.identifierForItem?.('card',cardId)||'');}catch(_){return '';}
}
function labelFor(id){
  try{
    const meta=rawSharingState()?.collaboration?.[id]||{};
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
function localBundle(id,root=localSharedRoot(id)){
  if(!root?.object?.id)throw Error('Op dit apparaat is geen lokale kopie van deze deling gevonden.');
  if(!window.LogSharing?.buildBundle)throw Error('Delen is nog niet beschikbaar.');
  const bundle=window.LogSharing.buildBundle(root.type||'card',root.object.id);
  bundle.id=id;
  return bundle;
}
async function directReactivate(id,root=localSharedRoot(id)){
  const bundle=localBundle(id,root),sharing=rawSharingState();
  const headers={'Content-Type':'application/json','Accept':'application/json','X-Log-Sharing-Action':'reactivate'};
  if(String(sharing.key||'').trim())headers['X-Log-Publish-Key']=String(sharing.key).trim();
  let response;
  try{
    response=await fetch(ENDPOINT,{method:'POST',headers,body:JSON.stringify(bundle),cache:'no-store'});
  }catch(_){
    throw Error('De herstelactie kon de server niet bereiken. De lokale kaart is behouden.');
  }
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok)throw Error(result.error||`Opnieuw online zetten is niet gelukt (${response.status}).`);
  try{await window.LogCollaboration?.syncRemoteAccess?.(id);}catch(_){}
  window.dispatchEvent(new Event('log-shell-view-refresh'));
  return result;
}
async function shareAsNew(root,id){
  if(!root?.object?.id)throw Error('Op dit apparaat is geen lokale kopie gevonden.');
  if(root.type!=='card')throw Error('Opnieuw delen met een nieuwe identifier is hier nog alleen voor kaarten beschikbaar.');
  if(!window.LogCollaboration?.shareAsNew)throw Error('Opnieuw delen is nog niet beschikbaar.');
  return window.LogCollaboration.shareAsNew(root.object.id,id);
}
function recoveryPanel(id,root,state={},message=''){
  const ui=window.LogCardsUI;if(!ui?.sheet||!root?.object?.id)return false;
  const revoked=state.revoked===true;
  const mode=['owner','collaborators','new-id'].includes(state.reactivationMode)?state.reactivationMode:(rawSharingState()?.collaboration?.[id]?.reactivationMode||'owner');
  const title=revoked?'Identifier ingetrokken':'Gedeelde kaart herstellen';
  const explanation=revoked
    ?'Deze identifier is definitief ingetrokken. Je lokale kaart blijft behouden en kan als nieuwe deling worden gepubliceerd.'
    :mode==='new-id'
      ?'Deze bron staat offline. Volgens het herstelrecht moet opnieuw delen een nieuwe identifier krijgen.'
      :mode==='collaborators'
        ?'Deze bron staat offline. Iedereen met deze identifier en een lokale kopie mag dezelfde identifier opnieuw online zetten.'
        :'Deze bron staat offline. Alleen de oorspronkelijke deler mag dezelfde identifier opnieuw online zetten.';
  const primary=revoked||mode==='new-id'
    ?'<button class="btn full" data-offline-share-new>Opnieuw delen met nieuwe identifier</button>'
    :'<button class="btn full" data-offline-direct-reactivate>Opnieuw online zetten</button>';
  const panel=ui.sheet(title,`
    <p>${explanation}</p>
    <p class="cards-notice">${message||`Identifier: ${id}`}</p>
    ${primary}
    <button class="btn secondary full" data-offline-open-local>Lokale kaart openen</button>
    <button class="btn secondary full" data-offline-share-close>Sluiten</button>
    <p role="status" data-offline-share-status></p>`);
  panel.querySelector('[data-offline-share-close]').onclick=()=>ui.close();
  panel.querySelector('[data-offline-open-local]').onclick=()=>{ui.close();window.LogCardsModule?.show?.(root.object.id);};
  const reactivate=panel.querySelector('[data-offline-direct-reactivate]');
  if(reactivate)reactivate.onclick=async event=>{
    const button=event.currentTarget,status=panel.querySelector('[data-offline-share-status]');button.disabled=true;
    try{
      const result=await directReactivate(id,root);
      status.textContent=`De deling staat weer online${result.revision?` · revisie ${Number(result.revision)}`:''}.`;
      setTimeout(()=>{ui.close();window.LogCardsModule?.show?.(root.object.id);},350);
    }catch(error){status.textContent=error?.message||'Herstellen is niet gelukt.';button.disabled=false;}
  };
  const asNew=panel.querySelector('[data-offline-share-new]');
  if(asNew)asNew.onclick=async event=>{
    const button=event.currentTarget,status=panel.querySelector('[data-offline-share-status]');button.disabled=true;
    try{ui.close();await shareAsNew(root,id);}
    catch(error){status.textContent=error?.message||'Opnieuw delen is niet gelukt.';button.disabled=false;}
  };
  return true;
}
function recoveryFallback(id,root,message=''){
  return recoveryPanel(id,root,rawSharingState()?.collaboration?.[id]||{},message||'De online deelstatus kon niet worden gelezen. Log kan de lokale herstelactie wel rechtstreeks aan de server voorleggen.');
}
async function openRecoveryForIdentifier(id){
  if(!VALID.test(String(id||''))||!window.LogCollaboration)return false;
  const root=localSharedRoot(id);
  let remote=null,statusError=null;
  try{remote=await window.LogCollaboration.syncRemoteAccess(id);}catch(error){statusError=error;}
  const state=remote?.state||{};
  if(state.offline||state.revoked){
    if(root?.object?.id)return recoveryPanel(id,root,state);
    const ui=window.LogCardsUI;
    if(ui?.sheet){
      const title=state.revoked?'Identifier ingetrokken':'Gedeelde kaart offline';
      const text=state.revoked
        ?'Deze identifier is definitief ingetrokken. Op dit apparaat is geen lokale kopie gevonden om opnieuw te delen.'
        :'Deze gedeelde kaart staat offline. Op dit apparaat is geen lokale kopie gevonden om opnieuw online te zetten.';
      const panel=ui.sheet(title,`<p>${text}</p><button class="btn full" data-offline-share-close>Sluiten</button>`);
      panel.querySelector('[data-offline-share-close]').onclick=()=>ui.close();return true;
    }
  }
  if(statusError&&root?.object?.id)return recoveryFallback(id,root,'De online deelstatus kon niet worden geladen. Dit blokkeert de lokale herstelactie niet.');
  return false;
}
function augmentOpenCard(cardId){
  const id=identifierForCard(cardId);
  if(!VALID.test(id))return;
  const panel=document.querySelector('dialog.cards-dialog.cards-display[open],dialog.cards-dialog.cards-display');
  const body=panel?.querySelector('.cards-dialog-body');
  if(!body||body.querySelector('[data-shared-card-manage]'))return;
  const button=document.createElement('button');
  button.type='button';button.className='btn secondary full';button.dataset.sharedCardManage='1';button.textContent=labelFor(id);
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
  const wrapped=async id=>{if(await openRecoveryForIdentifier(id))return true;return original(id);};
  wrapped.__offlineRecoveryBridge=true;wrapped.__original=original;shared.openByIdentifier=wrapped;
  if(window.LogSharedCard)window.LogSharedCard.openByIdentifier=wrapped;
  return true;
}
function patchCards(){
  const cards=window.LogCardsModule;
  if(!cards?.show)return false;
  if(cards.show.__offlineRecoveryBridge)return true;
  const original=cards.show.bind(cards);
  const wrapped=function(id,recognized){const result=original(id,recognized);setTimeout(()=>augmentOpenCard(id),0);return result;};
  wrapped.__offlineRecoveryBridge=true;wrapped.__original=original;cards.show=wrapped;return true;
}
function patchLogCode(){
  const code=window.LogCode;
  if(!code?.preview)return false;
  if(code.preview.__offlineRecoveryBridge)return true;
  const original=code.preview.bind(code);
  const wrapped=function(payload){
    if(payload?.kind==='log-action'&&VALID.test(String(payload.id||''))&&localSharedRoot(payload.id))return window.LogSharedConfig?.openByIdentifier?.(payload.id);
    return original(payload);
  };
  wrapped.__offlineRecoveryBridge=true;wrapped.__original=original;code.preview=wrapped;return true;
}
function patchManualInput(){
  const shared=window.LogSharedCard;
  if(!shared?.bindManual)return false;
  if(shared.bindManual.__offlineRecoveryBridge)return true;
  const original=shared.bindManual.bind(shared);
  const wrapped=function(panel){
    original(panel);
    const form=panel?.querySelector?.('form'),input=form?.querySelector?.('input'),status=panel?.querySelector?.('[data-shared-error]');
    if(!form||!input)return;
    form.onsubmit=async event=>{
      event.preventDefault();if(status)status.textContent='';
      try{
        const id=parseIdentifier(input.value),root=localSharedRoot(id);
        if(root?.object?.id){
          if(status)status.textContent='Deelstatus controleren…';
          if(await openRecoveryForIdentifier(id))return;
          if(status)status.textContent='';
        }
        await window.LogSharedConfig.openByIdentifier(id);
      }catch(error){
        let id='',root=null;try{id=parseIdentifier(input.value);root=localSharedRoot(id);}catch(_){}
        if(root?.object?.id&&recoveryFallback(id,root,'De online bron kon niet worden geladen. Je lokale kopie kan wel rechtstreeks opnieuw online worden gezet.'))return;
        if(status)status.textContent=error?.message||'De gedeelde gegevens konden niet worden geopend.';
      }
    };
  };
  wrapped.__offlineRecoveryBridge=true;wrapped.__original=original;shared.bindManual=wrapped;return true;
}
function install(){
  const a=patchSharedOpen(),b=patchCards(),c=patchLogCode(),d=patchManualInput();
  if(!(a&&b&&c&&d)&&attempts++<240)setTimeout(install,50);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
install();
window.addEventListener('pageshow',install);
window.addEventListener('log-shell-view-refresh',install);
})();
