(function(){
  'use strict';
  const KEY='urenregistratie.test.pwa.v1';
  const IDENTITY='log-test-identity-sync-v2';
  const ENDPOINT='https://sharon.life/log/api/sync.php';
  const PENDING='log-person-card-link-target';
  const VALID=/^[A-Za-z0-9_-]{12}$/;
  const CODE=/^log-person-v1:([A-Za-z0-9_-]{12})$/;
  const ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>';
  let root=null,query='',signature='',scanPatchAttempts=0;

  function read(){const raw=JSON.parse(localStorage.getItem(KEY)||'{}');return {...raw,colleagues:Array.isArray(raw.colleagues)?raw.colleagues:[],settings:raw.settings||{}};}
  function readIdentity(){try{const value=JSON.parse(localStorage.getItem(IDENTITY)||'{}');return value&&typeof value==='object'?value:{};}catch(_){return{};}}
  function writeIdentity(value){localStorage.setItem(IDENTITY,JSON.stringify(value));window.dispatchEvent(new CustomEvent('log-identity-sync-change'));}
  function changed(){window.LogTimeModule?.reloadFromStorage?.({view:'home'});window.dispatchEvent(new CustomEvent('log-time-state-change'));refresh();}
  function randomId(){const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);return Array.from(bytes,b=>ALPHABET[b&63]).join('');}
  function randomBytes(length=32){const bytes=new Uint8Array(length);crypto.getRandomValues(bytes);return bytes;}
  function b64url(bytes){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  function fromB64url(value){const text=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padded=text+'='.repeat((4-text.length%4)%4),binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
  function makePersonCode(pairCode){return`log-person-v1:${pairCode}`;}
  function parsePersonCode(value){const text=String(value||'').trim(),match=text.match(CODE);if(match)return{pairCode:match[1],code:text};if(VALID.test(text)&&sessionStorage.getItem(PENDING))return{pairCode:text,code:makePersonCode(text)};return null;}

  async function pairKey(pairCode){
    if(!VALID.test(String(pairCode||'')))throw Error('Persoonscode moet exact 12 tekens bevatten.');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`log-person-v1:${pairCode}`));
    return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt']);
  }
  async function encryptPerson(value,pairCode){const iv=randomBytes(12),key=await pairKey(pairCode),plain=new TextEncoder().encode(JSON.stringify(value)),data=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));return{v:2,alg:'PAIR12-SHA256+A256GCM',iv:b64url(iv),data:b64url(data)};}
  async function decryptPerson(envelope,pairCode){if(Number(envelope?.v)!==2)throw Error('Deze persoonskaart gebruikt nog een oude testcode. Open de persoonskaart opnieuw op het andere apparaat.');try{const key=await pairKey(pairCode),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64url(envelope.iv)},key,fromB64url(envelope.data));return JSON.parse(new TextDecoder().decode(plain));}catch(_){throw Error('Deze persoonscode hoort niet bij deze persoonskaart of de kaart is beschadigd.');}}
  async function syncApi(method,id='',body=null,token=''){
    const url=id?`${ENDPOINT}?id=${encodeURIComponent(id)}`:ENDPOINT,options={method,cache:'no-store',headers:{Accept:'application/json'}};
    if(body!==null){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body);}if(token)options.headers['X-Log-Access-Token']=token;
    const response=await fetch(url,options);let result={};try{result=await response.json();}catch(_){}
    if(!response.ok){const error=Error(result.error||`Persoonskaartserver reageerde met ${response.status}.`);error.status=response.status;throw error;}return result;
  }
  function selfProfile(){
    const raw=read(),localId=String(raw.settings.selfPersonId||''),person=raw.colleagues.find(p=>String(p.id)===localId)||{},personId=window.LogIdentitySync?.personId?.()||person.logPersonId||'';
    return{personId:String(personId),displayName:String(person.name||'Mijn Log-profiel').trim().slice(0,120),organization:String(person.organization||'').trim().slice(0,160)};
  }
  function savePersonCardMeta(card){const state=readIdentity();state.self=state.self&&typeof state.self==='object'?state.self:{};const clean={...card};delete clean.contentKey;state.self.personCard=clean;writeIdentity(state);return clean;}
  async function ensureOwnPersonCard(force=false){
    const profile=selfProfile();if(!VALID.test(profile.personId))throw Error('Log-identiteit is nog niet beschikbaar. Open Instellingen → Mijn Log & samenwerking één keer en probeer opnieuw.');
    const state=readIdentity(),saved=state.self?.personCard&&typeof state.self.personCard==='object'?state.self.personCard:{},legacy=Object.prototype.hasOwnProperty.call(saved,'contentKey');
    let card={...saved};delete card.contentKey;
    if(!VALID.test(String(card.alias||''))||String(card.ownerToken||'').length<32){card={alias:randomId(),ownerToken:b64url(randomBytes(32)),revision:0};force=true;}
    if(legacy)force=true;
    const signature=JSON.stringify([profile.personId,profile.displayName,profile.organization]);let remote=null;
    if(!force&&card.signature===signature){try{remote=await syncApi('GET',card.alias,null,card.ownerToken);if(!remote.revoked&&remote.payload&&!remote.offline)return{...card,pairCode:card.alias,code:makePersonCode(card.alias),profile};force=true;}catch(_){force=true;}}
    if(force&&remote?.revoked){card={alias:randomId(),ownerToken:b64url(randomBytes(32)),revision:0};remote=null;}
    if(!remote&&Number(card.revision)>0){try{remote=await syncApi('GET',card.alias,null,card.ownerToken);}catch(_){card={alias:randomId(),ownerToken:b64url(randomBytes(32)),revision:0};}}
    const document={schema:'log.person-card.v2',version:2,personId:profile.personId,displayName:profile.displayName,organization:profile.organization,updatedAt:new Date().toISOString()},payload=await encryptPerson(document,card.alias),baseRevision=Math.max(0,Number(remote?.revision??card.revision)||0);
    let result;
    try{result=await syncApi('POST','',{action:'put',id:card.alias,kind:'collaboration',baseRevision,ownerPersonId:profile.personId,payload},card.ownerToken);}catch(error){if(error.status!==409)throw error;remote=await syncApi('GET',card.alias,null,card.ownerToken);result=await syncApi('POST','',{action:'put',id:card.alias,kind:'collaboration',baseRevision:Number(remote.revision)||0,ownerPersonId:profile.personId,payload},card.ownerToken);}
    card={...card,revision:Number(result.revision)||baseRevision+1,signature,updatedAt:result.updatedAt||new Date().toISOString()};savePersonCardMeta(card);
    return{...card,pairCode:card.alias,code:makePersonCode(card.alias),profile};
  }
  async function fetchPersonCard(value){const parsed=parsePersonCode(value);if(!parsed)throw Error('Dit is geen geldige Log-persoonscode.');const remote=await syncApi('GET',parsed.pairCode);if(remote.revoked)throw Error('Deze persoonskaart is ingetrokken.');if(remote.offline||!remote.payload)throw Error('Deze persoonskaart staat momenteel niet online.');const profile=await decryptPerson(remote.payload,parsed.pairCode);if(profile?.schema!=='log.person-card.v2'||profile.version!==2||!VALID.test(String(profile.personId||'')))throw Error('De persoonskaart bevat geen geldige Log-identiteit.');return{pairCode:parsed.pairCode,profile};}
  function qrSvg(value){if(typeof window.qrcode!=='function')return'';try{const qr=window.qrcode(0,'M');window.qrcode.stringToBytes=text=>Array.from(new TextEncoder().encode(text));qr.addData(value,'Byte');qr.make();return qr.createSvgTag({cellSize:5,margin:16,scalable:true});}catch(_){return'';}}
  async function copyText(value){try{await navigator.clipboard.writeText(String(value));return true;}catch(_){return false;}}
  function bodyHost(panel){return panel?.querySelector?.('.cards-dialog-body')||panel;}
  function replaceBody(panel,html){const host=bodyHost(panel);if(!host)return null;const message=host.querySelector?.('[data-card-message]');if(message){[...host.children].forEach(child=>{if(child!==message)child.remove();});message.insertAdjacentHTML('beforebegin',html);}else host.innerHTML=html;return host;}
  function closeSheet(){window.LogCardsUI?.close?.();}

  async function showOwnPersonCard(){
    const panel=window.LogCardsUI.sheet('Mijn persoonskaart','<p role="status">Persoonskaart voorbereiden…</p>');
    try{const current=await ensureOwnPersonCard(false);if(!panel.isConnected)return;const host=replaceBody(panel,`<div class="people-person-card-profile"><strong>${esc(current.profile.displayName)}</strong>${current.profile.organization?`<span>${esc(current.profile.organization)}</span>`:''}</div><div class="people-person-card-qr">${qrSvg(current.code)}</div><div class="people-person-code"><small>Persoonscode</small><strong>${esc(current.pairCode)}</strong></div><p class="cards-notice">Deze persoonscode bestaat uit exact 12 tekens. De technische PersonId blijft verborgen.</p><button type="button" class="btn secondary full" data-person-code-copy>12-teken code kopiëren</button><button type="button" class="btn secondary full" data-person-code-refresh>Kaart bijwerken</button><p role="status" data-person-code-status></p>`);const status=host.querySelector('[data-person-code-status]');host.querySelector('[data-person-code-copy]').onclick=async()=>{status.textContent=await copyText(current.pairCode)?'Persoonscode gekopieerd.':'Kopiëren wordt op dit apparaat niet ondersteund.';};host.querySelector('[data-person-code-refresh]').onclick=async event=>{event.currentTarget.disabled=true;status.textContent='Persoonskaart bijwerken…';try{await ensureOwnPersonCard(true);status.textContent='Persoonskaart is bijgewerkt. De 12-teken code blijft hetzelfde.';}catch(error){status.textContent=error.message;}finally{event.currentTarget.disabled=false;}};}catch(error){if(panel.isConnected)replaceBody(panel,`<p class="cards-notice">${esc(error.message)}</p>`);}
  }
  function linkedByPersonId(raw,personId){return raw.colleagues.find(p=>String(p.logPersonId||'')===String(personId))||null;}
  function recordPair(localId,profile,pairCode){const raw=read(),target=raw.colleagues.find(p=>String(p.id)===String(localId));if(!target)throw Error('Persoon niet gevonden.');target.logPersonCardAlias=pairCode;target.logPersonLinkedAt=new Date().toISOString();target.logPersonCardName=String(profile.displayName||'').slice(0,120);localStorage.setItem(KEY,JSON.stringify(raw));changed();return target;}
  function linkProfile(localId,profile,pairCode){const raw=read(),existing=linkedByPersonId(raw,profile.personId);if(existing&&String(existing.id)!==String(localId))throw Error(`Deze persoonskaart is al gekoppeld aan ${existing.name}.`);if(!window.LogIdentitySync?.linkContact)throw Error('De Log-identiteitslaag is nog niet beschikbaar.');window.LogIdentitySync.linkContact(localId,profile.personId);return recordPair(localId,profile,pairCode);}
  async function previewPersonCard(value){
    const parsed=parsePersonCode(value);if(!parsed)return false;const panel=window.LogCardsUI.sheet('Persoonskaart','<p role="status">Persoonskaart ophalen…</p>');
    try{const {pairCode,profile}=await fetchPersonCard(parsed.code);if(!panel.isConnected)return true;const raw=read(),selfId=window.LogIdentitySync?.personId?.()||'',pendingId=sessionStorage.getItem(PENDING)||'',pending=raw.colleagues.find(p=>String(p.id)===String(pendingId))||null,already=linkedByPersonId(raw,profile.personId);if(String(profile.personId)===String(selfId)){replaceBody(panel,'<p class="cards-notice">Dit is jouw eigen persoonskaart.</p>');return true;}if(already&&(!pending||String(already.id)!==String(pending.id))){sessionStorage.removeItem(PENDING);replaceBody(panel,`<p class="cards-notice">Deze persoonskaart is al gekoppeld aan <strong>${esc(already.name)}</strong>.</p>`);return true;}if(pending){const host=replaceBody(panel,`<div class="people-person-card-profile"><strong>${esc(profile.displayName||'Log-gebruiker')}</strong>${profile.organization?`<span>${esc(profile.organization)}</span>`:''}</div><p class="cards-notice">Koppel deze Log-identiteit aan <strong>${esc(pending.name)}</strong>.</p><button type="button" class="btn primary full" data-person-code-link>Koppelen</button><button type="button" class="btn secondary full" data-person-code-cancel>Annuleren</button><p role="status" data-person-code-status></p>`);host.querySelector('[data-person-code-link]').onclick=()=>{try{linkProfile(pending.id,profile,pairCode);sessionStorage.removeItem(PENDING);closeSheet();}catch(error){host.querySelector('[data-person-code-status]').textContent=error.message;}};host.querySelector('[data-person-code-cancel]').onclick=()=>{sessionStorage.removeItem(PENDING);closeSheet();};return true;}const choices=raw.colleagues.filter(p=>String(p.id)!==String(raw.settings.selfPersonId)&&!VALID.test(String(p.logPersonId||'')));const host=replaceBody(panel,`<div class="people-person-card-profile"><strong>${esc(profile.displayName||'Log-gebruiker')}</strong>${profile.organization?`<span>${esc(profile.organization)}</span>`:''}</div><label>Koppelen aan<select data-person-code-target><option value="__new__">Nieuwe persoon aanmaken</option>${choices.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><button type="button" class="btn primary full" data-person-code-link>Verbinden</button><p role="status" data-person-code-status></p>`);host.querySelector('[data-person-code-link]').onclick=()=>{try{const target=host.querySelector('[data-person-code-target]').value;let local;if(target==='__new__'){local=save('',{name:profile.displayName||'Nieuwe persoon',relationship:'',organization:profile.organization||'',email:'',phone:'',note:'',color:'#4da3ff'},false);linkProfile(local.id,profile,pairCode);}else linkProfile(target,profile,pairCode);closeSheet();}catch(error){host.querySelector('[data-person-code-status]').textContent=error.message;}};}catch(error){if(panel.isConnected)replaceBody(panel,`<p class="cards-notice">${esc(error.message)}</p>`);}return true;
  }
  function openPersonScanner(localId){sessionStorage.setItem(PENDING,String(localId));closeSheet();setTimeout(()=>{const action=document.querySelector('.log-bottom-scan-action');if(action){action.click();return;}let scan=document.querySelector('#kmShellPlaceholderView [data-cards-scan]');if(!scan&&window.LogCardsModule?.mount){let host=document.getElementById('logPeopleScannerHost');if(!host){host=document.createElement('div');host.id='logPeopleScannerHost';host.hidden=true;document.body.appendChild(host);}window.LogCardsModule.mount(host);scan=host.querySelector('[data-cards-scan]');}if(scan){scan.click();document.querySelector('.cards-dialog [data-camera-start]')?.click();return;}sessionStorage.removeItem(PENDING);window.LogCardsUI.sheet('Persoonskaart koppelen','<p class="cards-notice">De QR-scanner kon niet worden geopend. Gebruik de Scan-knop onderin.</p>');},120);}
  function manualPersonCode(localId){const raw=read(),target=raw.colleagues.find(p=>String(p.id)===String(localId));if(!target)return;const value=prompt(`Persoonscode van ${target.name} (12 tekens):`,target.logPersonCardAlias||'');if(value===null)return;const code=String(value).trim();if(!VALID.test(code)){window.LogCardsUI.sheet('Persoonscode niet geldig','<p class="cards-notice">Gebruik exact 12 tekens: A–Z, a–z, 0–9, - en _.</p>');return;}sessionStorage.setItem(PENDING,String(localId));previewPersonCard(makePersonCode(code));}

  function save(id,values,self=false,source=null){
    const raw=read(),existing=raw.colleagues.find(p=>String(p.id)===String(id));
    if(id&&!existing)throw Error('Deze persoon is niet meer beschikbaar. Open Personen opnieuw.');
    const name=String(values.name||'').trim().slice(0,120);if(!name)throw Error('Vul een naam in.');
    const person={...existing,id:existing?.id||crypto.randomUUID(),name,usageCount:existing?.usageCount||0,createdAt:existing?.createdAt||new Date().toISOString()};
    for(const key of ['relationship','organization','email','phone','note'])person[key]=String(values[key]||'').trim().slice(0,key==='note'?2000:200);
    person.color=/^#[0-9a-f]{6}$/i.test(values.color||'')?values.color:'#4da3ff';
    if(source){
      if(!['vcard','picker'].includes(source.type))throw Error('Ongeldige contactbron.');
      const ref={type:source.type,importedAt:source.importedAt};
      if(source.type==='vcard'&&source.uid)ref.uid=String(source.uid).slice(0,1024);
      const refs=Array.isArray(existing?.contactSources)?existing.contactSources:[];
      person.contactSources=[...refs.filter(s=>!(s.type===ref.type&&(s.uid||'')===(ref.uid||''))),ref];
    }
    if(existing)raw.colleagues=raw.colleagues.map(p=>p.id===existing.id?person:p);else raw.colleagues.push(person);
    if(self)raw.settings.selfPersonId=person.id;
    localStorage.setItem(KEY,JSON.stringify(raw));changed();return person;
  }
  function edit(id='',self=false){
    const raw=read(),p=raw.colleagues.find(p=>String(p.id)===String(id))||{};
    self=self||Boolean(id&&String(raw.settings.selfPersonId)===String(id));
    const field=(key,label,type='text')=>`<label>${label}<input name="${key}" type="${type}" value="${esc(p[key]||'')}" maxlength="${key==='name'?120:200}"${key==='name'?' required':''}></label>`;
    const select=self&&!id?`<label>Bestaande persoon gebruiken<select data-person-existing><option value="">Nieuwe kaart maken</option>${raw.colleagues.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label>`:'';
    const d=window.LogCardsUI.sheet(self?'Mijn gegevens':id?'Persoon bewerken':'Persoon toevoegen',`<button type="button" class="btn secondary full contact-update" data-person-import>Contactgegevens overnemen</button><form class="people-form">${select}${field('name','Naam')}${self?'':field('relationship','Relatie (bijvoorbeeld collega, klant of familie)')}${field('organization','Organisatie')}${field('email','E-mailadres','email')}${field('phone','Telefoonnummer','tel')}<label>Kleur<input name="color" type="color" value="${esc(/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:'#4da3ff')}"></label><label>Notitie<textarea name="note" maxlength="2000">${esc(p.note||'')}</textarea></label><button class="btn primary full" type="submit">Bewaren</button></form>`);
    d.querySelector('[data-person-import]').onclick=()=>window.LogContactImport.open({targetId:id,self,searchName:d.querySelector('[name="name"]').value});
    d.querySelector('[data-person-existing]')?.addEventListener('change',e=>{if(e.target.value)edit(e.target.value,true)});
    d.querySelector('form').onsubmit=e=>{e.preventDefault();try{const values=Object.fromEntries(new FormData(e.target));if(self)values.relationship=p.relationship||'';save(id,values,self);window.LogCardsUI.close();}catch(error){d.querySelector('[data-card-message]').textContent=error.message||'Bewaren is niet gelukt.';}};
  }
  function show(id,self=false){
    const raw=read(),p=raw.colleagues.find(p=>String(p.id)===String(id));if(!p){edit('',self);return;}
    self=self||String(raw.settings.selfPersonId)===String(p.id);
    const linked=VALID.test(String(p.logPersonId||'')),pairCode=VALID.test(String(p.logPersonCardAlias||''))?String(p.logPersonCardAlias):'';
    const personCard=self?`<div class="people-person-card-block"><small>Log-identiteit</small><p>Persoonskaart met vaste 12-teken code</p><button type="button" class="btn secondary full" data-person-card-own>Mijn persoonskaart tonen</button></div>`:`<div class="people-person-card-block"><small>Log-verbinding</small><p>${linked?`Verbonden${pairCode?` · code ${esc(pairCode)}`:''}`:'Nog niet gekoppeld'}</p><button type="button" class="btn secondary full" data-person-card-scan>${linked?'Persoonskaart opnieuw scannen':'Persoonskaart scannen'}</button><details class="cards-content-details"><summary>Code invoeren</summary><button type="button" class="btn secondary full" data-person-card-manual>12-teken persoonscode invoeren</button></details></div>`;
    const d=window.LogCardsUI.sheet(self?'Mijn gegevens':p.name,`<div class="people-detail"><h3>${esc(p.name)}</h3>${p.contactSources?.length?'<p class="cards-notice">Overgenomen contact · handmatig bijwerken</p>':''}${[['Relatie',p.relationship],['Organisatie',p.organization],['E-mailadres',p.email],['Telefoonnummer',p.phone],['Notitie',p.note]].filter(([,v])=>v).map(([label,v])=>`<div><small>${label}</small><p>${esc(v)}</p></div>`).join('')}${personCard}</div><button type="button" class="btn secondary full" data-person-edit="${esc(p.id)}">Bewerken</button><button type="button" class="btn secondary full contact-update" data-person-import>Contactgegevens bijwerken</button><details class="cards-content-details"><summary>Lokale identifier</summary><p class="people-identifier">${esc(p.id)}</p></details>`);
    d.querySelector('[data-person-edit]').onclick=()=>edit(p.id,self);
    d.querySelector('[data-person-import]').onclick=()=>window.LogContactImport.open({targetId:p.id,self});
    d.querySelector('[data-person-card-own]')?.addEventListener('click',showOwnPersonCard);
    d.querySelector('[data-person-card-scan]')?.addEventListener('click',()=>openPersonScanner(p.id));
    d.querySelector('[data-person-card-manual]')?.addEventListener('click',()=>manualPersonCode(p.id));
  }
  function row(p,self=false){
    const id=p?.id||'',plan=id&&!self?window.LogTimeRemovalPolicy?.colleaguePlan(id):null;
    const lifecycle=Boolean(plan&&window.LogSwipePolicy?.enabled('people')!==false);
    const color=/^#[0-9a-f]{6}$/i.test(p?.color||'')?p.color:'#4da3ff';
    return `<div class="code-card-swipe" data-person-row style="--card-color:${color};--card-action-count:${lifecycle?2:1}"><div class="code-card-actions" inert aria-hidden="true">${lifecycle?`<button type="button" class="${plan.action==='archive'?'activity-swipe-archive':'swipe-delete'}" data-delete-colleague="${esc(id)}">${plan.action==='archive'?'Archiveer':'Verwijder'}</button>`:''}<button type="button" class="swipe-edit" data-person-edit="${esc(id)}"${self?' data-person-self':''}>Bewerk</button></div><div class="code-card-surface"><button type="button" class="code-card" data-person-open="${esc(id)}"${self?' data-person-self':''}><span class="code-card-icon">${icon}</span><span class="code-card-copy"><strong>${esc(self?'Mijn gegevens':p.name)}</strong><small>${esc(self?(p?.name||'Vul je eigen gegevens in'):[p.relationship||'Contact',p.organization].filter(Boolean).join(' · '))}</small></span><span class="code-card-open-icon">${icon}</span></button></div></div>`;
  }
  function render(){
    if(!root)return 0;const raw=read(),self=raw.colleagues.find(p=>String(p.id)===String(raw.settings.selfPersonId));
    const list=raw.colleagues.filter(p=>p!==self&&[p.name,p.relationship,p.organization,p.email,p.phone,p.note].join(' ').toLocaleLowerCase('nl').includes(query)).sort((a,b)=>a.name.localeCompare(b.name,'nl'));
    const archives=window.LogTimeRemovalPolicy?.peopleArchiveRecords()||[];
    root.innerHTML=`<section class="cards-module people-module"><div class="people-self">${row(self,true)}</div><div class="people-import-actions"><button type="button" class="btn primary full" data-person-import>Contact overnemen</button><button type="button" class="btn secondary full" data-person-add>＋ Zelf toevoegen</button></div><div class="people-list">${list.map(p=>row(p)).join('')||'<p class="cards-empty">Geen personen gevonden.</p>'}</div>${archives.length?`<details class="cards-content-details"><summary>Archief · ${archives.length}</summary>${archives.map(r=>`<div class="people-archive"><span>${esc(r.payload?.name||'Persoon')}</span><button type="button" class="btn secondary" data-log-time-restore="${esc(r.batchId)}">Herstel</button></div>`).join('')}</details>`:''}</section>`;
    return list.length;
  }
  function refresh(){if(!root)return;const next=JSON.stringify([read(),window.LogSwipePolicy?.enabled('people'),window.LogTimeRemovalPolicy?.peopleArchiveRecords()]);if(next!==signature){signature=next;render();}}
  function mount(target){if(root===target&&root.querySelector('.people-module'))return;root=target;signature='';root.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-person-open')&&Date.now()<Number(b.closest('[data-person-row]')?.dataset.suppressUntil||0))return;const self=b.hasAttribute('data-person-self');if(b.hasAttribute('data-person-import'))window.LogContactImport.open();if(b.hasAttribute('data-person-add'))edit();if(b.hasAttribute('data-person-open'))show(b.dataset.personOpen,self);if(b.hasAttribute('data-person-edit'))edit(b.dataset.personEdit,self);};refresh();}

  function installPersonCardStyles(){if(document.getElementById('logPeoplePersonCardStyles'))return;const style=document.createElement('style');style.id='logPeoplePersonCardStyles';style.textContent=`.people-person-card-block{display:grid;gap:7px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}.people-person-card-block>small{font-size:11px;color:var(--muted)}.people-person-card-block>p{margin:0}.people-person-card-profile{display:grid;gap:3px;text-align:center;margin:4px 0 10px}.people-person-card-profile strong{font-size:18px}.people-person-card-profile span{font-size:12px;color:var(--muted)}.people-person-card-qr{display:grid;place-items:center;max-width:300px;margin:8px auto 12px;padding:8px;background:#fff;border-radius:14px}.people-person-card-qr svg{width:100%;height:auto}.people-person-code{display:grid;gap:3px;place-items:center;margin:8px 0 12px}.people-person-code small{font-size:10px;color:var(--muted)}.people-person-code strong{font:700 19px/1.2 "SFMono-Regular",Consolas,monospace;letter-spacing:.08em}`;document.head.appendChild(style);}
  function installScanBridge(){const code=window.LogCode,dispatcher=window.LogScanDispatcher;if(!code?.parse||!code?.preview||!dispatcher?.classify){if(scanPatchAttempts++<200)setTimeout(installScanBridge,50);return;}if(!code.parse.__peoplePersonCard){const oldParse=code.parse.bind(code);const parse=value=>{const person=parsePersonCode(value);return person?{kind:'log-person-card',version:2,code:person.code}:oldParse(value);};parse.__peoplePersonCard=true;code.parse=parse;const oldPreview=code.preview.bind(code),preview=payload=>payload?.kind==='log-person-card'?(previewPersonCard(payload.code),true):oldPreview(payload);preview.__peoplePersonCard=true;code.preview=preview;}if(!dispatcher.classify.__peoplePersonCard){const old=dispatcher.classify.bind(dispatcher);const classify=value=>{const person=parsePersonCode(value);return person?{kind:'payload',payload:{kind:'log-person-card',version:2,code:person.code},value:String(value)}:old(value);};classify.__peoplePersonCard=true;dispatcher.classify=classify;}}

  window.LogPeopleModule={mount,save,read,refresh,showOwnPersonCard,previewPersonCard,unmount(){if(root){window.LogCardsUI.close();root.onclick=null;root=null;query='';}},search(value){const next=String(value||'').toLocaleLowerCase('nl');if(query===next)return root?.querySelectorAll('.people-list [data-person-row]').length||0;query=next;return render();}};
  installPersonCardStyles();installScanBridge();
  for(const name of ['storage','log-time-state-change','log-km-state-change'])window.addEventListener(name,refresh);
})();
