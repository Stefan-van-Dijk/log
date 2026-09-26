(function(){
  'use strict';
  const TIME='urenregistratie.test.pwa.v1',KM='kmreg-test-v4-data',VISITS='log-test-location-action-visits-v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=key=>JSON.parse(localStorage.getItem(key)||'{}');
  const types={ride:'Rit voorbereiden',task:'Taak starten',card:'Kaart tonen'};
  const days=['Zo','Ma','Di','Wo','Do','Vr','Za'];
  let root=null,query='',watch=null,timer=null,generation=0,point=null,status='Locatieherkenning staat uit.',busy=false,signature='';
  function snapshot(){const time=read(TIME),km=read(KM);return {time,km,rules:time.locationActions||[],locations:km.locations||[],cards:km.cards||[],themes:time.themes||[],subs:time.subthemes||[]};}
  function enabled(){return read(TIME).settings?.locationActionsEnabled===true;}
  function write(mutator){const raw=read(TIME);mutator(raw);localStorage.setItem(TIME,JSON.stringify(raw));window.LogTimeModule?.reloadFromStorage?.({view:window.LogTimeModule.getView?.()||'home'});window.dispatchEvent(new CustomEvent('log-time-state-change'));refresh();}
  function label(id,s=snapshot()){const l=s.locations.find(l=>l.id===id),parent=s.locations.find(p=>p.id===l?.parentId);return l?(parent?parent.name+' › ':'')+l.name:'Locatie ontbreekt';}
  function coordinates(id,s=snapshot(),seen=new Set()){
    const l=s.locations.find(l=>l.id===id);if(!l||seen.has(id))return null;seen.add(id);
    if(l.lat!==null&&l.lat!==''&&l.lat!==undefined&&l.lng!==null&&l.lng!==''&&l.lng!==undefined&&Number.isFinite(+l.lat)&&Number.isFinite(+l.lng)&&Math.abs(+l.lat)<=90&&Math.abs(+l.lng)<=180)return {lat:+l.lat,lng:+l.lng};
    return l.parentId?coordinates(l.parentId,s,seen):null;
  }
  function distance(a,b){const r=Math.PI/180,dlat=(b.lat-a.lat)*r,dlng=(b.lng-a.lng)*r;return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2)));}
  function inTime(rule,date=new Date()){
    let day=date.getDay();const now=date.getHours()*60+date.getMinutes();
    if(rule.start&&rule.end){const minute=v=>+v.slice(0,2)*60+(+v.slice(3)),start=minute(rule.start),end=minute(rule.end);
      if(start<end){if(now<start||now>=end)return false;}else {if(now>=end&&now<start)return false;if(now<end)day=(day+6)%7;}
    }
    return !rule.days?.length||rule.days.includes(day);
  }
  function problem(rule,s=snapshot()){
    if(!s.locations.some(l=>l.id===rule.locationId))return 'Locatie ontbreekt';
    if(!coordinates(rule.locationId,s))return 'Locatie heeft geen GPS-coördinaten';
    if(rule.type==='ride'&&!s.locations.some(l=>l.id===rule.targetId))return 'Bestemming ontbreekt';
    if(rule.type==='card'&&!s.cards.some(c=>c.id===rule.targetId))return 'Kaart ontbreekt';
    if(rule.type==='task'&&(!s.themes.some(t=>t.id===rule.targetId)||(rule.subthemeId&&!s.subs.some(t=>t.id===rule.subthemeId&&t.themeId===rule.targetId))))return 'Thema of subthema ontbreekt';
    if(!types[rule.type])return 'Actietype onbekend';return '';
  }
  function targetName(rule,s=snapshot()){const list=rule.type==='ride'?s.locations:rule.type==='card'?s.cards:s.themes;const item=list.find(i=>i.id===rule.targetId);const sub=s.subs.find(i=>i.id===rule.subthemeId);return (item?.name||'Item ontbreekt')+(rule.type==='task'&&sub?' › '+sub.name:'');}
  function validate(rule){
    if(!rule.name?.trim())throw Error('Vul een naam in.');
    const error=problem(rule);if(error)throw Error(error);
    if(rule.radius<25||rule.radius>5000||!Number.isFinite(rule.radius))throw Error('Kies een straal van 25 tot 5000 meter.');
    if(Boolean(rule.start)!==Boolean(rule.end))throw Error('Vul zowel begin- als eindtijd in.');
    if(rule.start&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.end)||rule.start===rule.end))throw Error('Kies twee verschillende geldige tijden.');
  }
  function edit(id=''){
    const s=snapshot(),old=s.rules.find(r=>r.id===id);if(id&&!old)return;
    const r=old||{enabled:true,radius:Math.max(25,Number(s.km.settings?.recognitionRadius)||500),days:[],type:'card'};
    const options=(list,current)=>'<option value="">Kies een item</option>'+list.map(l=>`<option value="${esc(l.id)}"${l.id===current?' selected':''}>${esc(l.name)}</option>`).join('');
    const d=window.LogCardsUI.sheet(id?'Locatieactie bewerken':'Nieuwe locatieactie',`<form class="people-form"><label>Naam<input name="name" maxlength="120" required value="${esc(r.name||'')}"></label><label>Locatie<select name="locationId" required>${options(s.locations.map(l=>({...l,name:label(l.id,s)})),r.locationId)}</select></label><label>Herkennen binnen (meter)<input type="number" min="25" max="5000" name="radius" required value="${r.radius}"></label><p class="cards-notice">Bij aankomst of aanwezigheid terwijl Log geopend is. Een sublocatie zonder eigen GPS gebruikt de coördinaten van de hoofdlocatie.</p><label>Voorstel<select name="type">${Object.entries(types).map(([k,v])=>`<option value="${k}"${r.type===k?' selected':''}>${v}</option>`).join('')}</select></label><label>Gekoppeld item<select name="targetId" required></select></label><label data-subfield>Subthema<select name="subthemeId"></select></label><fieldset class="la-days"><legend>Dagen · geen selectie betekent elke dag</legend>${days.map((day,i)=>`<label><input type="checkbox" name="day" value="${i}"${r.days.includes(i)?' checked':''}>${day}</label>`).join('')}</fieldset><div class="la-times"><label>Vanaf (optioneel)<input type="time" name="start" value="${esc(r.start||'')}"></label><label>Tot (optioneel)<input type="time" name="end" value="${esc(r.end||'')}"></label></div><p class="cards-notice">Een tijdvak over middernacht hoort bij de dag waarop het begint. Na uitvoeren of wegklikken verschijnt dit voorstel pas weer bij een volgend waargenomen bezoek.</p><label class="contact-use"><input type="checkbox" name="enabled"${r.enabled?' checked':''}>Actief</label><button type="submit" class="btn primary full">Bewaren</button></form>`);
    const f=d.querySelector('form');function sub(){f.elements.subthemeId.innerHTML='<option value="">Geen subthema</option>'+s.subs.filter(x=>x.themeId===f.elements.targetId.value).map(x=>`<option value="${esc(x.id)}"${x.id===r.subthemeId?' selected':''}>${esc(x.name)}</option>`).join('');}
    function targets(){f.elements.targetId.innerHTML=options(f.elements.type.value==='ride'?s.locations.map(l=>({...l,name:label(l.id,s)})):f.elements.type.value==='task'?s.themes:s.cards,r.targetId);d.querySelector('[data-subfield]').hidden=f.elements.type.value!=='task';sub();}
    f.elements.type.onchange=targets;f.elements.targetId.onchange=sub;targets();
    f.onsubmit=e=>{e.preventDefault();try{const fd=new FormData(f),rule={id:old?.id||crypto.randomUUID(),name:String(fd.get('name')).trim(),locationId:fd.get('locationId'),type:fd.get('type'),targetId:fd.get('targetId'),subthemeId:fd.get('type')==='task'?fd.get('subthemeId'):'',radius:Number(fd.get('radius')),start:fd.get('start'),end:fd.get('end'),days:fd.getAll('day').map(Number),enabled:fd.has('enabled')};validate(rule);write(raw=>{const rules=raw.locationActions||[];if(id&&!rules.some(x=>x.id===id))throw Error('Deze actie is intussen verwijderd.');raw.locationActions=id?rules.map(x=>x.id===id?rule:x):[...rules,rule];});window.LogCardsUI.close();}catch(error){d.querySelector('[data-card-message]').textContent=error.message;}};
  }
  function visits(){return Object.assign(Object.create(null),read(VISITS));}
  function assess(position,now=Date.now()){
    const c=position.coords,p={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,time:position.timestamp||now};
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||!Number.isFinite(p.accuracy)||p.accuracy<0||now-p.time>120000||p.time>now+5000)return;
    point=p;const state=visits(),s=snapshot();
    for(const locationId of new Set(s.rules.map(r=>r.locationId))){
      const target=coordinates(locationId,s);if(!target)continue;
      // A shared visit radius prevents overlapping rules from resetting one another.
      const radius=Math.max(...s.rules.filter(r=>r.locationId===locationId).map(r=>r.radius));
      const delta=distance(p,target),v=state[locationId];
      if(delta+p.accuracy<=radius){if(!v?.inside)state[locationId]={inside:true,token:crypto.randomUUID(),done:[]};else delete v.outsideSince;}
      else if(v?.inside&&delta-p.accuracy>radius+50){if(!v.outsideSince)v.outsideSince=now;else if(now-v.outsideSince>=20000)state[locationId]={inside:false};}
      else if(v)delete v.outsideSince;
    }
    for(const key of Object.keys(state))if(!s.rules.some(r=>r.locationId===key))delete state[key];
    localStorage.setItem(VISITS,JSON.stringify(state));status='Locatie gecontroleerd om '+new Date(now).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});refresh();
  }
  function eligible(now=Date.now()){
    if(!enabled()||document.hidden||!point||now-point.time>120000)return [];
    const s=snapshot(),state=visits();return s.rules.filter(r=>{
      const v=state[r.locationId],pos=coordinates(r.locationId,s);
      return r.enabled&&!problem(r,s)&&inTime(r,new Date(now))&&v?.inside&&!v.done?.includes(r.id)&&pos&&distance(point,pos)+point.accuracy<=r.radius;
    });
  }
  function done(rule){const state=visits(),v=state[rule.locationId];if(v){v.done=[...new Set([...(v.done||[]),rule.id])];localStorage.setItem(VISITS,JSON.stringify(state));}refresh();}
  function stop(){generation++;if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;clearInterval(timer);timer=null;point=null;renderSuggestions();}
  function start(){
    stop();if(!enabled()||document.hidden)return;
    if(!navigator.geolocation){status='Locatiebepaling is niet beschikbaar.';refresh();return;}
    const token=generation;status='Locatie bepalen…';refresh();
    const success=p=>{if(token!==generation)return;try{assess(p);}catch(_){status='Locatievoorstellen konden niet worden bijgewerkt.';point=null;refresh();}};
    const failure=e=>{if(token!==generation)return;point=null;status=e.code===1?'Geen locatietoestemming. Sta locatie toe en tik op Opnieuw controleren.':'Geen betrouwbare locatie beschikbaar. Probeer opnieuw.';if(e.code===1)stop();refresh();};
    const options={enableHighAccuracy:true,maximumAge:15000,timeout:15000};
    watch=navigator.geolocation.watchPosition(success,failure,options);
    timer=setInterval(()=>{if(!document.hidden){renderSuggestions();navigator.geolocation.getCurrentPosition(success,failure,options);}},60000);
  }
  function renderSuggestions(){
    let host=document.getElementById('logLocationSuggestions');if(!host){const shell=document.querySelector('.shell');if(!shell)return;host=document.createElement('section');host.id='logLocationSuggestions';host.setAttribute('aria-label','Voor deze locatie');const anchor=shell.querySelector('#app');if(anchor)shell.insertBefore(host,anchor);else shell.append(host);}
    const rules=eligible(),markup=rules.length?`<h2>Voor deze locatie</h2>${rules.map(r=>`<div class="la-proposal"><div><strong>${esc(r.name)}</strong><small>${esc(label(r.locationId))} · ${esc(types[r.type])}: ${esc(targetName(r))}</small></div><button type="button" class="btn secondary" data-la-propose="${esc(r.id)}">Bekijk</button><button type="button" class="la-dismiss" data-la-dismiss="${esc(r.id)}" aria-label="${esc(r.name)} wegklikken">×</button></div>`).join('')}`:'';
    if(host._markup!==markup){host.innerHTML=markup;host._markup=markup;}host.hidden=!rules.length;
    host.onclick=e=>{const id=e.target.closest('[data-la-propose]')?.dataset.laPropose,skip=e.target.closest('[data-la-dismiss]')?.dataset.laDismiss;if(skip){const r=eligible().find(r=>r.id===skip);if(r)done(r);}if(id)propose(id);};
  }
  function propose(id){
    const rule=eligible().find(r=>r.id===id);if(!rule)return;
    const original=JSON.stringify(rule);
    const d=window.LogCardsUI.sheet(rule.name,`<p>${esc(types[rule.type])}: <strong>${esc(targetName(rule))}</strong></p><p class="cards-notice">${esc(label(rule.locationId))}</p><button type="button" class="btn primary full" data-la-confirm>${esc(types[rule.type])}</button>`);
    d.querySelector('[data-la-confirm]').onclick=async e=>{if(busy)return;const button=e.currentTarget;try{
      const current=eligible().find(r=>r.id===id);if(!current||JSON.stringify(current)!==original)throw Error('Dit voorstel is niet meer actueel. Controleer de locatie opnieuw.');
      busy=true;button.disabled=true;
      if(rule.type==='ride'){const km=read(KM);if(km.activeTrip)throw Error('Rond eerst de actieve rit af.');await window.LogRideStarter.prepare(rule.targetId);}
      else if(rule.type==='task'){window.LogTimeModule.startFromCard({themeId:rule.targetId,subthemeId:rule.subthemeId,locationName:label(rule.locationId)});window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section:'time'}}));}
      else {if(!snapshot().cards.some(c=>c.id===rule.targetId))throw Error('Kaart ontbreekt.');}
      done(rule);window.LogCardsUI.close();if(rule.type==='card')window.LogCardsModule.show(rule.targetId);
    }catch(error){if(d.isConnected)d.querySelector('[data-card-message]').textContent=error.message||'Actie kon niet worden uitgevoerd.';}finally{busy=false;button.disabled=false;}};
  }
  function render(){
    if(!root)return;const s=snapshot(),allowed=window.LogSwipePolicy?.enabled('locationactions')!==false;
    const rules=s.rules.filter(r=>(r.name+' '+label(r.locationId,s)+' '+targetName(r,s)).toLocaleLowerCase('nl').includes(query));
    root.innerHTML=`<section class="cards-module"><label class="log-swipe-setting"><input type="checkbox" data-la-enabled${enabled()?' checked':''}><span>Locatievoorstellen aan<small>Controleert je locatie zolang Log geopend en zichtbaar is.</small></span></label><p class="cards-notice" data-la-status role="status">${esc(status)}</p><button type="button" class="btn secondary full" data-la-check>Opnieuw controleren</button><button type="button" class="btn primary full contact-update" data-la-new>＋ Locatieactie toevoegen</button><p class="cards-notice">Voorstellen starten niets automatisch. Een volgend bezoek wordt herkend wanneer Log je eerst duidelijk buiten de locatie en daarna weer binnen ziet.</p>${rules.map(r=>`<div class="code-card-swipe" data-la-row style="--card-color:var(--accent);--card-action-count:${allowed?2:1}"><div class="code-card-actions" inert aria-hidden="true">${allowed?`<button type="button" class="swipe-delete" data-la-delete="${esc(r.id)}">Verwijder</button>`:''}<button type="button" class="swipe-edit" data-la-edit="${esc(r.id)}">Bewerk</button></div><div class="code-card-surface"><button type="button" class="code-card" data-la-open="${esc(r.id)}"><span class="code-card-copy"><strong>${esc(r.name)}${r.enabled?'':' · uit'}</strong><small>${esc(label(r.locationId,s))} · ${esc(types[r.type])}</small><small>${esc(problem(r,s)||targetName(r,s))}</small><small>${r.days.length?r.days.map(i=>days[i]).join(', '):'Elke dag'} · ${r.start?r.start+'–'+r.end:'hele dag'}</small></span></button></div></div>`).join('')||'<p class="cards-empty">Nog geen locatieacties voor deze selectie.</p>'}</section>`;
  }
  function refresh(){if(!enabled()&&watch!==null)stop();renderSuggestions();if(!root)return;const next=JSON.stringify([snapshot(),query,status,window.LogSwipePolicy?.enabled('locationactions')]);if(next!==signature){signature=next;render();}}
  function mount(target){if(root===target&&root.querySelector('[data-la-new]'))return;root=target;signature='';root.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-la-open')&&Date.now()<Number(b.closest('[data-la-row]')?.dataset.suppressUntil||0))return;try{if(b.hasAttribute('data-la-new'))edit();if(b.dataset.laEdit||b.dataset.laOpen)edit(b.dataset.laEdit||b.dataset.laOpen);if(b.dataset.laDelete&&window.LogSwipePolicy?.enabled('locationactions')!==false&&confirm('Deze locatieactie verwijderen?'))write(raw=>{raw.locationActions=(raw.locationActions||[]).filter(r=>r.id!==b.dataset.laDelete);});if(b.hasAttribute('data-la-check')){if(enabled())start();else {status='Zet Locatievoorstellen aan om je locatie te controleren.';refresh();}}}catch(error){status=error.message;refresh();}};root.onchange=e=>{if(!e.target.matches('[data-la-enabled]'))return;try{const value=e.target.checked;write(raw=>{raw.settings={...raw.settings,locationActionsEnabled:value};});if(value)start();else {stop();status='Locatieherkenning staat uit.';refresh();}}catch(error){status='Instelling kon niet worden bewaard.';signature='';refresh();}};refresh();}
  window.LogLocationActions={mount,refresh,edit,inTime,coordinates,assess,eligible,propose,snapshot,validate,unmount(){if(root){window.LogCardsUI.close();root.onclick=null;root.onchange=null;root=null;query='';}},search(value){const next=String(value||'').toLocaleLowerCase('nl');if(next!==query){query=next;signature='';refresh();}return root?.querySelectorAll('[data-la-row]').length||0;}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});
  window.addEventListener('pagehide',stop);window.addEventListener('pageshow',start);
  for(const event of ['log-time-state-change','log-km-state-change','log-shell-view-refresh'])window.addEventListener(event,refresh);
  window.addEventListener('storage',()=>{refresh();if(!enabled())stop();});
})();
