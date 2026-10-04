(function(){
'use strict';

const TIME='urenregistratie.test.pwa.v1';
const STORE='log-test-person-connections-v1';
const ENDPOINT='https://sharon.life/log/api/connections.php';
const VALID=/^[A-Za-z0-9_-]{12}$/;
const REFRESH_MS=15000;
let activePanel=null;
let activeTimer=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
function read(key,fallback={}){try{const value=JSON.parse(localStorage.getItem(key)||'null');return value&&typeof value==='object'?value:fallback;}catch(_){return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
function timeData(){const value=read(TIME,{});return{...value,settings:value.settings||{},colleagues:Array.isArray(value.colleagues)?value.colleagues:[]};}
function state(){const value=read(STORE,{});return{version:1,items:value.items&&typeof value.items==='object'?value.items:{}};}
function selfId(){return String(window.LogIdentitySync?.personId?.()||timeData().settings.selfPersonId||'');}
function personByLocalId(localId){return timeData().colleagues.find(person=>String(person.id)===String(localId)||String(person.logPersonId||'')===String(localId))||null;}
function personIds(localId){const person=personByLocalId(localId);return new Set([String(localId||''),String(person?.id||''),String(person?.logPersonId||'')].filter(Boolean));}
function otherPersonId(item){const doc=item?.cache||{},me=selfId();if(String(doc.fromPersonId||'')===me)return String(doc.toPersonId||'');if(String(doc.toPersonId||'')===me)return String(doc.fromPersonId||'');return String(item?.otherPersonId||'');}
function connectionForLocal(localId){const ids=personIds(localId);return Object.values(state().items).filter(item=>item&&item.status==='connected'&&!item.revoked&&VALID.test(String(item.connectionId||''))).sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))).find(item=>ids.has(String(item.otherPersonId||''))||ids.has(String(item.pendingLocalId||''))||ids.has(String(item.linkedLocalId||''))||ids.has(otherPersonId(item)))||null;}
function tokenFor(item){return String(item?.accessToken||item?.ownerToken||'');}
function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
async function contentSecret(connectionId){const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`log.connection.content.v1:${connectionId}`)));return b64url(digest);}
async function importSecret(secret){return crypto.subtle.importKey('raw',fromB64url(secret),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function decrypt(envelope,connectionId){if(Number(envelope?.v)!==1)throw Error('Onbekende verbindingsversleuteling.');try{const key=await importSecret(await contentSecret(connectionId)),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(envelope.iv)},key,fromB64url(envelope.data));return JSON.parse(new TextDecoder().decode(plain));}catch(_){throw Error('Het gesprek kan niet worden geopend.');}}
async function encrypt(value,connectionId){const key=await importSecret(await contentSecret(connectionId)),iv=crypto.getRandomValues(new Uint8Array(12)),plain=new TextEncoder().encode(JSON.stringify(value)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{v:1,alg:'A256GCM',iv:b64url(iv),data:b64url(data)};}
async function api(method,id,body=null,token=''){
  const options={method,cache:'no-store',headers:{Accept:'application/json'}};if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}if(token)options.headers['X-Log-Access-Token']=token;
  let response;try{response=await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`,options);}catch(_){throw Error('De verbinding met het gesprek is niet bereikbaar.');}
  let result={};try{result=await response.json();}catch(_){}
  if(!response.ok){const error=Error(result.error||`Gesprek reageerde met ${response.status}.`);error.status=response.status;throw error;}return result;
}
function saveLocal(item,remote,document){const current=state(),previous=current.items[item.connectionId]||item;current.items[item.connectionId]={...previous,revision:Number(remote.revision)||Number(previous.revision)||0,status:'connected',cache:document,revoked:false,lastChatSyncAt:new Date().toISOString(),updatedAt:new Date().toISOString()};write(STORE,current);window.dispatchEvent(new CustomEvent('log-person-connections-change'));return current.items[item.connectionId];}
async function fetchDocument(item){const token=tokenFor(item);if(token.length<16)throw Error('De lokale toegang tot deze verbinding ontbreekt.');const remote=await api('GET',item.connectionId,null,token);if(remote.revoked)throw Error('Deze verbinding is beëindigd.');if(!remote.payload)throw Error('De verbinding bevat momenteel geen gedeelde inhoud.');const document=await decrypt(remote.payload,item.connectionId);if(document?.schema!=='log.connection.v1'||document.status!=='connected')throw Error('Deze persoonsverbinding is nog niet volledig bevestigd.');return{remote,document,item:saveLocal(item,remote,document)};}
function chatMessages(document){const chat=document?.chat&&typeof document.chat==='object'?document.chat:{};return Array.isArray(chat.messages)?chat.messages:[];}
async function mutate(item,change){
  for(let attempt=0;attempt<3;attempt++){
    const current=await fetchDocument(item),document=current.document;document.chat=document.chat&&typeof document.chat==='object'?document.chat:{version:1,messages:[]};document.chat.version=1;document.chat.messages=Array.isArray(document.chat.messages)?document.chat.messages:[];
    change(document.chat,document);document.updatedAt=new Date().toISOString();const payload=await encrypt(document,item.connectionId);
    try{const remote=await api('POST',item.connectionId,{action:'put',id:item.connectionId,baseRevision:Number(current.remote.revision)||0,status:'connected',payload},tokenFor(current.item));return{remote,document,item:saveLocal(current.item,remote,document)};}catch(error){if(error.status!==409||attempt===2)throw error;}
  }
  throw Error('Het gesprek kon niet worden bijgewerkt.');
}
function messageMarkup(document,person){const me=selfId(),messages=chatMessages(document).slice(-100);if(!messages.length)return'<p class="cards-notice">Nog geen berichten. Stuur het eerste bericht.</p>';return messages.map(message=>{const mine=String(message.authorPersonId||'')===me,label=mine?'Ik':String(person?.name||'Persoon'),date=message.createdAt?new Intl.DateTimeFormat('nl-NL',{hour:'2-digit',minute:'2-digit'}).format(new Date(message.createdAt)):'';return `<div class="log-connection-chat-message${mine?' mine':''}"><small>${esc(label)}${date?` · ${esc(date)}`:''}</small><span>${esc(message.text||'')}</span></div>`;}).join('');}
function installStyles(){if(document.getElementById('logConnectionChatStyles'))return;const style=document.createElement('style');style.id='logConnectionChatStyles';style.textContent=`.log-connection-chat-messages{display:grid;gap:7px;max-height:48vh;overflow:auto;padding:2px 0 10px}.log-connection-chat-message{display:grid;gap:3px;padding:9px 11px;border-radius:12px;background:var(--card2,#1d2430)}.log-connection-chat-message.mine{margin-left:14%;background:rgba(77,163,255,.16)}.log-connection-chat-message small{font-size:10px;color:var(--muted,#8e8e93)}.log-connection-chat-message span{font-size:14px;line-height:1.35;white-space:pre-wrap;overflow-wrap:anywhere}.log-connection-chat-compose{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin-top:8px}.log-connection-chat-compose input{min-height:44px;padding:10px 12px;border:1px solid var(--line,#2a3442);border-radius:12px;background:var(--card2,#1d2430);color:var(--text,#fff)}.log-connection-chat-compose button{min-width:74px}.log-connection-chat-status{min-height:18px;font-size:11px;color:var(--muted,#8e8e93)}`;document.head.appendChild(style);}
function stopRefresh(){if(activeTimer){clearTimeout(activeTimer);activeTimer=null;}}
function scheduleRefresh(panel,item,person){stopRefresh();activeTimer=setTimeout(async()=>{if(panel!==activePanel||!panel.isConnected)return;if(document.visibilityState!=='visible'){scheduleRefresh(panel,item,person);return;}try{const current=await fetchDocument(item);if(panel===activePanel&&panel.isConnected){const host=panel.querySelector('[data-connection-chat-messages]');if(host)host.innerHTML=messageMarkup(current.document,person);}}catch(_){}scheduleRefresh(panel,item,person);},REFRESH_MS);}
async function open(localId){
  const person=personByLocalId(localId),item=connectionForLocal(localId);if(!item){window.LogCardsUI?.sheet?.('Chat',`<p class="cards-notice">Verbind eerst met ${esc(person?.name||'deze persoon')}. Een één-op-ééngesprek gebruikt voortaan direct de persoonsverbinding.</p>`);return false;}
  const panel=window.LogCardsUI?.sheet?.(person?.name?`Chat met ${person.name}`:'Chat','<p role="status">Gesprek laden…</p>');if(!panel)return false;activePanel=panel;stopRefresh();
  try{
    const current=await fetchDocument(item),body=panel.querySelector('.cards-dialog-body')||panel;body.innerHTML=`<div class="log-connection-chat-messages" data-connection-chat-messages>${messageMarkup(current.document,person)}</div><div class="log-connection-chat-compose"><input data-connection-chat-input maxlength="2000" placeholder="Bericht"><button type="button" class="btn" data-connection-chat-send>Stuur</button></div><p class="log-connection-chat-status" role="status" data-connection-chat-status></p>`;
    const input=body.querySelector('[data-connection-chat-input]'),send=body.querySelector('[data-connection-chat-send]'),status=body.querySelector('[data-connection-chat-status]');
    const submit=async()=>{const text=String(input.value||'').trim();if(!text)return;send.disabled=true;input.disabled=true;status.textContent='Versturen…';try{const updated=await mutate(connectionForLocal(localId)||current.item,chat=>{chat.messages.push({id:crypto.randomUUID(),authorPersonId:selfId(),text:text.slice(0,2000),createdAt:new Date().toISOString()});if(chat.messages.length>500)chat.messages=chat.messages.slice(-500);});input.value='';body.querySelector('[data-connection-chat-messages]').innerHTML=messageMarkup(updated.document,person);status.textContent='Verstuurd.';}catch(error){status.textContent=error.message;}finally{send.disabled=false;input.disabled=false;input.focus();}};
    send.onclick=submit;input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submit();}});input.focus();scheduleRefresh(panel,current.item,person);return true;
  }catch(error){const body=panel.querySelector('.cards-dialog-body')||panel;body.innerHTML=`<p class="cards-notice">${esc(error.message)}</p>`;return false;}
}
function intercept(event){const button=event.target.closest?.('[data-c2-chat]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();open(String(button.dataset.c2Chat||'')).catch(error=>window.LogCardsUI?.sheet?.('Chat',`<p class="cards-notice">${esc(error.message)}</p>`));}
function install(){installStyles();document.addEventListener('click',intercept,true);window.addEventListener('pageshow',()=>{if(activePanel?.isConnected&&activePanel.dataset.connectionChatLocalId)open(activePanel.dataset.connectionChatLocalId);});window.LogConnectionChat={open,connectionForLocal,fetchDocument};}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
