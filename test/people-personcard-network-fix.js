(function(){
'use strict';

const TIME='urenregistratie.test.pwa.v1';
const IDENTITY='log-test-identity-sync-v2';
const ENDPOINT='https://sharon.life/log/api/sync.php';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function randomId(){const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);return Array.from(bytes,b=>ALPHABET[b&63]).join('');}
function randomBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes;}
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function makeCode(pairCode){return`log-person-v1:${pairCode}`;}
function profile(){
  const time=read(TIME,{}),people=Array.isArray(time.colleagues)?time.colleagues:[],localId=String(time.settings?.selfPersonId||''),person=people.find(p=>String(p.id)===localId)||{},personId=window.LogIdentitySync?.personId?.()||person.logPersonId||'';
  if(!VALID.test(String(personId)))throw Error('Log-identiteit is nog niet beschikbaar. Open Instellingen → Mijn Log & samenwerking één keer.');
  return{personId:String(personId),displayName:String(person.name||'Mijn Log-profiel').trim().slice(0,120),organization:String(person.organization||'').trim().slice(0,160)};
}
function prepareLocalCard(){
  const state=read(IDENTITY,{});state.self=state.self&&typeof state.self==='object'?state.self:{};
  const saved=state.self.personCard&&typeof state.self.personCard==='object'?state.self.personCard:{};
  let card={...saved};delete card.contentKey;
  if(!VALID.test(String(card.alias||'')))card.alias=randomId();
  if(String(card.ownerToken||'').length<32)card.ownerToken=b64url(randomBytes(32));
  card.revision=Math.max(0,Number(card.revision)||0);
  card.localPreparedAt=new Date().toISOString();
  state.self.personCard=card;write(IDENTITY,state);
  window.dispatchEvent(new CustomEvent('log-identity-sync-change'));
  return card;
}
async function pairKey(pairCode){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`log-person-v1:${pairCode}`));return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt']);}
async function encrypt(value,pairCode){const iv=randomBytes(12),key=await pairKey(pairCode),plain=new TextEncoder().encode(JSON.stringify(value)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{v:2,alg:'PAIR12-SHA256+A256GCM',iv:b64url(iv),data:b64url(data)};}
async function api(method,id='',body=null,token=''){
  const url=id?`${ENDPOINT}?id=${encodeURIComponent(id)}`:ENDPOINT,options={method,cache:'no-store',headers:{Accept:'application/json'}};
  if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}
  if(token)options.headers['X-Log-Access-Token']=token;
  let response;
  try{response=await fetch(url,options);}catch(_){throw Error('Online publiceren is momenteel niet bereikbaar. De 12-teken persoonscode blijft wel lokaal beschikbaar.');}
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok){const error=Error(result.error||`Online publiceren reageerde met ${response.status}.`);error.status=response.status;throw error;}
  return result;
}
function saveCard(card){const state=read(IDENTITY,{});state.self=state.self&&typeof state.self==='object'?state.self:{};state.self.personCard=card;write(IDENTITY,state);window.dispatchEvent(new CustomEvent('log-identity-sync-change'));}
async function publish(card,p){
  let remote=null;
  if(card.revision>0){try{remote=await api('GET',card.alias,null,card.ownerToken);}catch(error){if(!String(error.message).includes('niet bereikbaar'))remote=null;else throw error;}}
  if(remote?.revoked){card={alias:randomId(),ownerToken:b64url(randomBytes(32)),revision:0};saveCard(card);}
  const document={schema:'log.person-card.v2',version:2,personId:p.personId,displayName:p.displayName,organization:p.organization,updatedAt:new Date().toISOString()};
  const payload=await encrypt(document,card.alias),baseRevision=Math.max(0,Number(remote?.revision??card.revision)||0),signature=JSON.stringify([p.personId,p.displayName,p.organization]);
  let result;
  try{result=await api('POST','',{action:'put',id:card.alias,kind:'collaboration',baseRevision,ownerPersonId:p.personId,payload},card.ownerToken);}catch(error){
    if(error.status!==409)throw error;
    remote=await api('GET',card.alias,null,card.ownerToken);
    result=await api('POST','',{action:'put',id:card.alias,kind:'collaboration',baseRevision:Number(remote.revision)||0,ownerPersonId:p.personId,payload},card.ownerToken);
  }
  card={...card,revision:Number(result.revision)||baseRevision+1,signature,updatedAt:result.updatedAt||new Date().toISOString(),online:true};saveCard(card);return card;
}
function qrSvg(value){if(typeof window.qrcode!=='function')return'';try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(value,'Byte');qr.make();return qr.createSvgTag({cellSize:5,margin:16,scalable:true});}catch(_){return'';}}
async function copy(value){try{await navigator.clipboard.writeText(String(value));return true;}catch(_){return false;}}
function host(panel){return panel?.querySelector?.('.cards-dialog-body')||panel;}
function render(panel,card,p){
  const target=host(panel);if(!target)return null;
  const message=target.querySelector?.('[data-card-message]');
  const html=`<div class="people-person-card-profile"><strong>${esc(p.displayName)}</strong>${p.organization?`<span>${esc(p.organization)}</span>`:''}</div><div class="people-person-card-qr">${qrSvg(makeCode(card.alias))}</div><div class="people-person-code"><small>Persoonscode</small><strong>${esc(card.alias)}</strong></div><p class="cards-notice">De persoonscode bestaat uit exact 12 tekens. De kaart is direct lokaal beschikbaar; online koppelen wordt apart gecontroleerd.</p><button type="button" class="btn secondary full" data-pcn-copy>12-teken code kopiëren</button><button type="button" class="btn secondary full" data-pcn-publish>Opnieuw online zetten</button><p role="status" data-pcn-status>Online status controleren…</p>`;
  if(message){[...target.children].forEach(child=>{if(child!==message)child.remove();});message.insertAdjacentHTML('beforebegin',html);}else target.innerHTML=html;
  return target;
}
async function show(){
  const panel=window.LogCardsUI?.sheet?.('Mijn persoonskaart','<p role="status">Persoonskaart openen…</p>');if(!panel)return;
  let p,card;
  try{p=profile();card=prepareLocalCard();}catch(error){host(panel).innerHTML=`<p class="cards-notice">${esc(error.message)}</p>`;return;}
  const target=render(panel,card,p),status=target.querySelector('[data-pcn-status]');
  target.querySelector('[data-pcn-copy]').onclick=async()=>{status.textContent=await copy(card.alias)?'Persoonscode gekopieerd.':'Kopiëren wordt op dit apparaat niet ondersteund.';};
  const tryPublish=async button=>{if(button)button.disabled=true;status.textContent='Persoonskaart online zetten…';try{card=await publish(card,p);status.textContent='Persoonskaart staat online en kan op een ander apparaat worden opgehaald.';}catch(error){status.textContent=error.message;}finally{if(button)button.disabled=false;}};
  target.querySelector('[data-pcn-publish]').onclick=e=>tryPublish(e.currentTarget);
  tryPublish(null);
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-person-card-own]');if(!button)return;
  event.preventDefault();event.stopImmediatePropagation();show();
},true);

window.LogPeoplePersonCardNetworkFix={show};
})();
