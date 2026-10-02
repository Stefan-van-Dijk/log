(function(){
  'use strict';
  const KEY='urenregistratie.test.pwa.v1';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>';
  let root=null,query='',signature='';
  function read(){const raw=JSON.parse(localStorage.getItem(KEY)||'{}');return {...raw,colleagues:Array.isArray(raw.colleagues)?raw.colleagues:[],settings:raw.settings||{}};}
  function changed(){window.LogTimeModule?.reloadFromStorage?.({view:'home'});window.dispatchEvent(new CustomEvent('log-time-state-change'));refresh();}
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
    const d=window.LogCardsUI.sheet(self?'Mijn gegevens':p.name,`<div class="people-detail"><h3>${esc(p.name)}</h3>${p.contactSources?.length?'<p class="cards-notice">Overgenomen contact · handmatig bijwerken</p>':''}${[['Relatie',p.relationship],['Organisatie',p.organization],['E-mailadres',p.email],['Telefoonnummer',p.phone],['Notitie',p.note]].filter(([,v])=>v).map(([label,v])=>`<div><small>${label}</small><p>${esc(v)}</p></div>`).join('')}</div><button type="button" class="btn secondary full" data-person-edit="${esc(p.id)}">Bewerken</button><button type="button" class="btn secondary full contact-update" data-person-import>Contactgegevens bijwerken</button><details class="cards-content-details"><summary>Identifier</summary><p class="people-identifier">${esc(p.id)}</p></details>`);
    d.querySelector('[data-person-edit]').onclick=()=>edit(p.id,self);
    d.querySelector('[data-person-import]').onclick=()=>window.LogContactImport.open({targetId:p.id,self});
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
  window.LogPeopleModule={mount,save,read,refresh,unmount(){if(root){window.LogCardsUI.close();root.onclick=null;root=null;query='';}},search(value){const next=String(value||'').toLocaleLowerCase('nl');if(query===next)return root?.querySelectorAll('.people-list [data-person-row]').length||0;query=next;return render();}};
  for(const name of ['storage','log-time-state-change','log-km-state-change'])window.addEventListener(name,refresh);
})();
