(function(){
'use strict';

const ENDPOINT='https://sharon.life/log/api/connections.php';
const VALID=/^[A-Za-z0-9_-]{12}$/;
let attempts=0;

function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function memberToken(id){const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`log.connection.member.v1:${id}`)));return b64url(digest);}
async function probeConnection(id){
  if(!VALID.test(String(id||'')))return false;
  const token=await memberToken(id);
  let response;
  try{response=await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`,{method:'GET',cache:'no-store',headers:{Accept:'application/json','X-Log-Access-Token':token}});}catch(error){error.connectionProbeNetwork=true;throw error;}
  if(response.status===404||response.status===403)return false;
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok){const error=Error(result.error||`Verbindingsserver reageerde met ${response.status}.`);error.status=response.status;throw error;}
  return String(result.connectionId||'')===String(id);
}
function locallyConfiguredAction(id){
  try{return !!window.LogLocationActions?.snapshot?.().rules?.some(rule=>String(rule?.logCodeId||'')===String(id));}catch(_){return false;}
}
async function routeBareIdentifier(id,fallback,payload){
  try{
    if(await probeConnection(id)){
      const oneQr=window.LogOneQrConnections;
      if(oneQr?.previewInvite){oneQr.previewInvite(`log-connect-v2:${id}`);return;}
    }
  }catch(error){
    console.warn('12-teken identifier kon niet als verbinding worden gecontroleerd.',error);
  }
  fallback(payload);
}
function installPreviewRouter(){
  const api=window.LogCode,oneQr=window.LogOneQrConnections;
  if(!api?.preview||!oneQr?.previewInvite){if(attempts++<240)setTimeout(installPreviewRouter,50);return;}
  if(api.preview.__bare12IdentifierRouter)return;
  const original=api.preview.bind(api);
  const wrapped=function(payload){
    const id=payload?.kind==='log-action'&&VALID.test(String(payload.id||''))?String(payload.id):'';
    if(!id||locallyConfiguredAction(id))return original(payload);
    routeBareIdentifier(id,original,payload);
    return true;
  };
  wrapped.__bare12IdentifierRouter=true;
  wrapped.__original=original;
  api.preview=wrapped;
}
function qrSvg(value){
  if(typeof window.qrcode!=='function')return'';
  try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(String(value),'Byte');qr.make();return qr.createSvgTag({cellSize:6,margin:16,scalable:true});}catch(_){return'';}
}
async function copy(value){try{await navigator.clipboard.writeText(String(value));return true;}catch(_){return false;}}
function normalizeConnectionQr(scope=document){
  scope.querySelectorAll?.('.log-oneqr-code strong').forEach(strong=>{
    const id=String(strong.textContent||'').trim();if(!VALID.test(id))return;
    const panel=strong.closest('.cards-dialog')||strong.closest('dialog')||document;
    const qr=panel.querySelector('.log-oneqr-qr');
    if(qr&&qr.dataset.bareIdentifier!==id){qr.innerHTML=qrSvg(id);qr.dataset.bareIdentifier=id;qr.setAttribute('aria-label',`Verbindingscode ${id}`);}
    const label=strong.parentElement?.querySelector('small');if(label)label.textContent='Verbindingscode';
    const button=panel.querySelector('[data-oneqr-copy]');
    if(button&&button.dataset.bareIdentifier!==id){
      const replacement=button.cloneNode(true);replacement.dataset.bareIdentifier=id;
      replacement.onclick=async()=>{const status=panel.querySelector('[data-oneqr-status]');if(status)status.textContent=await copy(id)?'12-teken verbindingscode gekopieerd.':'Kopiëren wordt op dit apparaat niet ondersteund.';};
      button.replaceWith(replacement);
    }
  });
}
function init(){
  installPreviewRouter();
  normalizeConnectionQr();
  new MutationObserver(records=>{for(const record of records){if(record.addedNodes.length){normalizeConnectionQr();break;}}}).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',()=>{installPreviewRouter();normalizeConnectionQr();});
  window.LogBareIdentifierRouter={probeConnection,route:id=>routeBareIdentifier(String(id),payload=>window.LogCode?.preview?.(payload),{kind:'log-action',version:1,id:String(id)})};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
