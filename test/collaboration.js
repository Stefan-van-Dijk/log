(function(){
'use strict';
const STORE='log-test-sharing-v1';
const ENDPOINT='https://sharon.life/log/api/publish.php';
const PUBLIC_BASE='https://sharon.life/log/config/';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const read=()=>{try{const v=JSON.parse(localStorage.getItem(STORE)||'{}');return v&&typeof v==='object'?v:{};}catch(_){return {};}};
const write=v=>localStorage.setItem(STORE,JSON.stringify(v));
function saveRight(id,token){if(!VALID.test(id)||!token)return;const s=read();s.collaboration=s.collaboration&&typeof s.collaboration==='object'?s.collaboration:{};s.collaboration[id]={editToken:String(token),receivedAt:new Date().toISOString()};write(s);}
function right(id){return read().collaboration?.[id]?.editToken||'';}
function shareValue(id,token){return JSON.stringify({kind:'log-share',version:1,id,editToken:token});}
function parseShare(value){try{const p=typeof value==='string'?JSON.parse(value):value;return p?.kind==='log-share'&&p.version===1&&VALID.test(p.id)&&typeof p.editToken==='string'&&p.editToken.length>=20?p:null;}catch(_){return null;}}
function installFetch(){if(window.fetch?.__logCollaboration)return;const native=window.fetch.bind(window);const wrapped=async(input,init={})=>{const url=typeof input==='string'?input:input?.url||'',method=String(init.method||input?.method||'GET').toUpperCase();if(url===ENDPOINT&&method==='POST'&&typeof init.body==='string'){
 let body=null;try{body=JSON.parse(init.body);}catch(_){}
 if(body?.kind==='log-config'&&VALID.test(body.id)){
   const headers=new Headers(init.headers||{}),token=right(body.id),owner=headers.get('X-Log-Publish-Key');
   if(token&&!owner)headers.set('X-Log-Edit-Token',token);
   init={...init,headers};
 }
}
const response=await native(input,init);return response;};wrapped.__logCollaboration=true;wrapped.__native=native;window.fetch=wrapped;}
async function enableCollaboration(bundle,key){const headers={'Content-Type':'application/json','Accept':'application/json','X-Log-Publish-Key':key,'X-Log-Collaboration-Create':'1'};const response=await fetch(ENDPOINT,{method:'POST',headers,body:JSON.stringify(bundle),cache:'no-store'});let result={};try{result=await response.json();}catch(_){}if(!response.ok)throw Error(result.error||`Samenwerken activeren mislukt (${response.status}).`);if(result.editToken)saveRight(bundle.id,result.editToken);return result;}
function importShare(value){const p=parseShare(value);if(!p)return false;saveRight(p.id,p.editToken);return true;}
async function copy(text){try{await navigator.clipboard.writeText(text);return true;}catch(_){return false;}}
function augmentPublishedDialog(){const d=document.querySelector('dialog.log-share-dialog[open]');if(!d||d.dataset.collaborationAugmented)return;const id=d.querySelector('.log-share-id')?.textContent?.trim();if(!VALID.test(id))return;d.dataset.collaborationAugmented='1';const actions=d.querySelector('.log-share-actions'),status=d.querySelector('[data-copy-status]');if(!actions)return;
 const s=read(),info=s.published?.[id],localType=info?.type,localId=info?.id;if(!localType||localType!=='card')return;
 const btn=document.createElement('button');btn.type='button';btn.className='btn secondary';btn.textContent=right(id)?'Samenwerkingscode kopiëren':'Samenwerken';actions.appendChild(btn);
 btn.onclick=async()=>{try{let token=right(id);if(!token){const key=s.key;if(!key)throw Error('De publicatiesleutel ontbreekt op dit apparaat.');if(!window.LogSharing?.buildBundle)throw Error('Deelfunctie is nog niet beschikbaar.');const result=await enableCollaboration(window.LogSharing.buildBundle('card',localId),key);token=result.editToken||right(id);if(!token)throw Error('De server gaf geen samenwerkingscode terug.');}
 const value=shareValue(id,token);if(status)status.textContent=await copy(value)?'Samenwerkingscode gekopieerd. Deel deze code met de ontvanger.':value;btn.textContent='Samenwerkingscode kopiëren';}catch(e){if(status)status.textContent=e.message;}};
}
function installScannerBridge(){const timer=setInterval(()=>{const api=window.LogCode;if(!api?.parse||api.parse.__collaboration)return;const original=api.parse.bind(api);const wrapped=value=>{const shared=parseShare(value);if(shared){saveRight(shared.id,shared.editToken);return {kind:'log-share',version:1,id:shared.id,editToken:shared.editToken};}return original(value);};wrapped.__collaboration=true;api.parse=wrapped;
 if(api.preview&&!api.preview.__collaboration){const old=api.preview.bind(api);const preview=p=>{if(p?.kind==='log-share'){saveRight(p.id,p.editToken);const ui=window.LogCardsUI;if(ui?.sheet){const panel=ui.sheet('Samenwerking toegevoegd',`<p>Je mag wijzigingen terugschrijven naar deze gedeelde kaart.</p><p><strong>${p.id}</strong></p><button class="btn full" data-collab-close>Sluiten</button>`);panel.querySelector('[data-collab-close]').onclick=()=>ui.close();return panel;}return;}return old(p);};preview.__collaboration=true;api.preview=preview;}clearInterval(timer);},100);setTimeout(()=>clearInterval(timer),15000);}
function install(){installFetch();installScannerBridge();new MutationObserver(augmentPublishedDialog).observe(document.documentElement,{childList:true,subtree:true});setTimeout(augmentPublishedDialog,0);window.LogCollaboration={saveRight,right,shareValue,parseShare,importShare,enableCollaboration};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();