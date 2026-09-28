(function(){
  'use strict';
  const TIME='urenregistratie.test.pwa.v1',KM='kmreg-test-v4-data',VISITS='log-test-location-action-visits-v1';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=key=>JSON.parse(localStorage.getItem(key)||'{}');
  const SNOOZES='log-test-action-snoozes-v1',EDGES='log-test-action-transitions-v1',DEPARTURE='log-test-smart-ride-departure-v1';
  const types={ride:'Rit voorbereiden',task:'Taak voorbereiden',card:'Kaart tonen'};
  const typeUI={ride:{label:'Rit',color:'#3984d8',path:'M5 11l2-6h10l2 6M5 11h14v7H5zM7 18v2m10-2v2M8 14h1m6 0h1'},task:{label:'Taak',color:'#b17a27',path:'M8 5H5v16h14V5h-3M8 3h8v4H8zM8 14l3 3 5-6'},card:{label:'Kaart',color:'#8d62cc',path:'M3 5h18v14H3zM7 9h4M7 14h2m5-4v5m3-5v5'}};
  const days=['Zo','Ma','Di','Wo','Do','Vr','Za'];
  const failed=new Set(),lastHandled=new Map();
  let permissionState='unknown',permissionHandle=null;
  function permissionText(){return !navigator.geolocation?'Locatiebepaling niet beschikbaar':({granted:'Toegestaan',denied:'Niet toegestaan · pas locatietoegang aan in je browser- of telefooninstellingen',prompt:'Nog toestemming nodig · kies Opnieuw controleren',unknown:'Toestemmingsstatus niet beschikbaar in deze browser'})[permissionState]||'Onbekend';}
  function settingsHtml(kind){
    if(kind==='ride')return `<div data-la-ride-settings><label class="log-swipe-setting"><input type="checkbox" data-la-smart-ride><span><span aria-hidden="true">🚗</span> Slimme ritvoorstellen<small>Wacht na parkeren op een volgend waargenomen vertrek en bereidt dan in Ritten een voorstel voor vanaf het laatst afgeronde eindpunt, met de bestemming uit je historie. Je bevestigt zelf de start.</small></span></label></div>`;
    return `<section><h3>Locatiegebruik</h3><p class="cards-notice">Log vraagt bij openen je locatie op. Zolang de app zichtbaar is: elke 6 seconden zonder actieve rit, elke minuut tijdens een rit. Hiervoor is locatietoestemming nodig. Er is geen aparte hoofdschakelaar. Per actie bepaal je of die actief is. Dit geeft geen locatieherkenning wanneer Log gesloten is.</p><p class="cards-notice">Kaarten kunnen direct verschijnen; ritten en taken worden voorbereid. Een nieuw bezoek wordt herkend als Log je eerst duidelijk buiten en daarna weer binnen de locatie ziet.</p><p>Locatietoestemming: <span data-la-permission role="status"></span></p><p class="cards-notice" data-la-status role="status"></p><button type="button" class="btn secondary full" data-la-check>Opnieuw controleren</button></section>`;
  }
  function updateSettings(){
    document.querySelectorAll('[data-la-permission]').forEach(el=>{if(el.textContent!==permissionText())el.textContent=permissionText();});
    document.querySelectorAll('[data-la-status]').forEach(el=>{if(el.textContent!==status)el.textContent=status;});
    const smart=smartRideState();document.querySelectorAll('[data-la-ride-settings]').forEach(el=>{if(el.hidden!==!smart.available)el.hidden=!smart.available;const input=el.querySelector('[data-la-smart-ride]');input.checked=smart.enabled;if(input.disabled!==!smart.available)input.disabled=!smart.available;});
  }
  async function queryPermission(){
    try{if(!navigator.permissions?.query)return;const p=await navigator.permissions.query({name:'geolocation'});if(permissionHandle)permissionHandle.onchange=null;permissionHandle=p;permissionState=p.state;if(p.state==='denied'){stop();status='Geen locatietoestemming.';}p.onchange=()=>{permissionState=p.state;if(p.state==='denied'){stop();status='Geen locatietoestemming.';}else start();updateSettings();};}catch(_){}finally{updateSettings();}
  }
  function bindSettings(host){
    updateSettings();queryPermission();
    host.querySelector('[data-la-check]')?.addEventListener('click',()=>{start();queryPermission();});
    host.querySelector('[data-la-smart-ride]')?.addEventListener('change',e=>{if(!smartRideState().available){updateSettings();return;}try{write(raw=>{raw.settings={...raw.settings,smartRideEnabled:e.target.checked};});}catch(error){updateSettings();window.LogCardsUI.sheet('Instelling niet bewaard',`<p>${esc(error.message)}</p>`);}});
  }
  let suppressOpenUntil=0,pollingUnsubscribe=null;
  let root=null,query='',watch=null,timer=null,generation=0,point=null,status='Locatie wordt gecontroleerd zodra Log zichtbaar is.',busy=false,signature='';
  function snapshot(){const time=read(TIME),km=read(KM);return {time,km,rules:time.locationActions||[],locations:km.locations||[],cards:km.cards||[],themes:time.themes||[],subs:time.subthemes||[]};}
  function rideModuleEnabled(){return window.LogModuleVisibility?.enabled('rides')===true;}
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
    if(rule.type==='ride'&&rule.selection!=='smart'&&!s.locations.some(l=>l.id===rule.targetId))return 'Bestemming ontbreekt';
    if(rule.type==='card'&&!s.cards.some(c=>c.id===rule.targetId))return 'Kaart ontbreekt';
    if(rule.type==='task'&&rule.selection!=='smart'&&(!s.themes.some(t=>t.id===rule.targetId)||(rule.subthemeId&&!s.subs.some(t=>t.id===rule.subthemeId&&t.themeId===rule.targetId))))return 'Thema of subthema ontbreekt';
    if(!types[rule.type])return 'Actietype onbekend';return '';
  }
  function targetName(rule,s=snapshot()){if(rule.selection==='smart'&&rule.type!=='card')return 'Slim voorstel uit je historie';const list=rule.type==='ride'?s.locations:rule.type==='card'?s.cards:s.themes;const item=list.find(i=>i.id===rule.targetId);const sub=s.subs.find(i=>i.id===rule.subthemeId);return (item?.name||'Item ontbreekt')+(rule.type==='task'&&sub?' › '+sub.name:'');}
  function validate(rule){
    if(!rule.name?.trim())throw Error('Vul een naam in.');
    if(rule.selection&&!['fixed','smart'].includes(rule.selection))throw Error('Kies een vast of slim voorstel.');
    if(rule.repeatMode&&!['visit','halfHour','duration','location','day'].includes(rule.repeatMode))throw Error('Kies wanneer de actie opnieuw mag gelden.');
    if(rule.repeatMode==='duration'&&(!Number.isInteger(rule.repeatMinutes)||rule.repeatMinutes<1||rule.repeatMinutes>525600))throw Error('Kies een wachttijd van 1 minuut tot 365 dagen.');
    const error=problem(rule);if(error)throw Error(error);
    if(rule.radius<25||rule.radius>5000||!Number.isFinite(rule.radius))throw Error('Kies een straal van 25 tot 5000 meter.');
    if(Boolean(rule.start)!==Boolean(rule.end))throw Error('Vul zowel begin- als eindtijd in.');
    if(rule.start&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.end)||rule.start===rule.end))throw Error('Kies twee verschillende geldige tijden.');
  }
  function edit(id=''){
    const s=snapshot(),old=s.rules.find(r=>r.id===id);if(id&&!old)return;
    const r=old||{enabled:true,radius:Math.max(25,Number(s.km.settings?.recognitionRadius)||500),days:[],type:'card'};
    const repeatMinutes=r.repeatMode==='halfHour'?30:Number(r.repeatMinutes)||30;
    const repeatUnit=repeatMinutes%1440===0?'days':repeatMinutes%60===0?'hours':'minutes';
    const repeatValue=repeatMinutes/({minutes:1,hours:60,days:1440}[repeatUnit]);
    const options=(list,current)=>'<option value="">Kies een item</option>'+list.map(l=>`<option value="${esc(l.id)}"${l.id===current?' selected':''}>${esc(l.name)}</option>`).join('');
    const d=window.LogCardsUI.sheet(id?'Actie bewerken':'Nieuwe actie',`<form class="people-form la-form"><label>Naam<input name="name" maxlength="120" required value="${esc(r.name||'')}"></label><label>Locatie<select name="locationId" required>${options(s.locations.map(l=>({...l,name:label(l.id,s)})),r.locationId)}</select></label><label>Herkennen binnen (meter)<input type="number" min="25" max="5000" name="radius" required value="${r.radius}"></label><p class="cards-notice">Wacht na bewaren op een volgende aankomst of het ingaan van het tijdvak terwijl Log geopend is. Een sublocatie zonder eigen GPS gebruikt de coördinaten van de hoofdlocatie.</p><label>Voorstel<select name="type">${Object.entries(types).map(([k,v])=>`<option value="${k}"${r.type===k?' selected':''}>${v}</option>`).join('')}</select></label><label data-selection>Voorstel bepalen<select name="selection"><option value="fixed">Vast item</option><option value="smart"${r.selection==='smart'?' selected':''}>Slim · bestaand algoritme</option></select></label><label data-target><span data-target-label>Gekoppeld item</span><select name="targetId" required></select></label><label data-repeat>Opnieuw toestaan<select name="repeatMode">${Object.entries({visit:'Bij een volgend bezoek',duration:'Na een zelfgekozen wachttijd',location:'Na locatiewisseling',day:'De volgende dag'}).map(([k,v])=>`<option value="${k}"${(r.repeatMode==='halfHour'?'duration':r.repeatMode||'visit')===k?' selected':''}>${v}</option>`).join('')}</select></label><div class="la-times" data-repeat-duration><label>Wachttijd<input name="repeatValue" type="number" min="1" max="525600" step="1" value="${repeatValue}"></label><label>Eenheid<select name="repeatUnit">${Object.entries({minutes:'Minuten',hours:'Uren',days:'Dagen (24 uur)'}).map(([k,v])=>`<option value="${k}"${repeatUnit===k?' selected':''}>${v}</option>`).join('')}</select></label></div><p class="cards-notice" data-repeat-help>De wachttijd begint na tonen, voorbereiden of resetten. Je kunt op dezelfde locatie blijven. Locatie, dagen en tijdvak blijven gelden.</p><label data-subfield>Subthema<select name="subthemeId"></select></label><label>Dagen<select name="dayMode"><option value="all">Elke dag</option><option value="selected"${r.days?.length?' selected':''}>Bepaalde dagen</option></select></label><fieldset class="la-days" data-day-fields><legend>Kies de dagen</legend>${days.map((day,i)=>`<label><input type="checkbox" name="day" value="${i}"${r.days.includes(i)?' checked':''}>${day}</label>`).join('')}</fieldset><label>Tijd<select name="timeMode"><option value="all">Hele dag</option><option value="window"${r.start?' selected':''}>Binnen een tijdvak</option></select></label><div class="la-times" data-time-fields><label>Vanaf<input type="time" name="start" value="${esc(r.start||'')}"></label><label>Tot<input type="time" name="end" value="${esc(r.end||'')}"></label></div><p class="cards-notice" data-time-help>Een tijdvak over middernacht hoort bij de dag waarop het begint.</p><p class="cards-notice" data-la-editor-status></p><label class="contact-use"><input type="checkbox" name="enabled"${r.enabled?' checked':''}>Actief</label><button type="submit" class="btn primary full">Bewaren</button></form>`);
    const f=d.querySelector('form');function sub(){f.elements.subthemeId.innerHTML='<option value="">Geen subthema</option>'+s.subs.filter(x=>x.themeId===f.elements.targetId.value).map(x=>`<option value="${esc(x.id)}"${x.id===r.subthemeId?' selected':''}>${esc(x.name)}</option>`).join('');}
    function targets(){f.elements.targetId.innerHTML=options(f.elements.type.value==='ride'?s.locations.map(l=>({...l,name:label(l.id,s)})):f.elements.type.value==='task'?s.themes:s.cards,r.targetId);d.querySelector('[data-subfield]').hidden=f.elements.type.value!=='task';sub();}
    function field(selector,show){const el=d.querySelector(selector);el.hidden=!show;el.querySelectorAll('input,select').forEach(input=>input.disabled=!show);}
    function fields(){
      const type=f.elements.type.value,card=type==='card',smart=!card&&f.elements.selection.value==='smart';
      field('[data-selection]',!card);field('[data-target]',!smart);
      const duration=f.elements.repeatMode.value==='duration';field('[data-repeat-duration]',duration);f.elements.repeatValue.required=duration;f.elements.repeatValue.max=String(525600/({minutes:1,hours:60,days:1440}[f.elements.repeatUnit.value]));d.querySelector('[data-repeat-help]').hidden=!duration;
      f.elements.targetId.required=!smart;
      field('[data-subfield]',type==='task'&&!smart&&s.subs.some(x=>x.themeId===f.elements.targetId.value));
      d.querySelector('[data-target-label]').textContent=card?'Kaart':type==='ride'?'Bestemming':'Thema';
      field('[data-day-fields]',f.elements.dayMode.value==='selected');
      const timed=f.elements.timeMode.value==='window';field('[data-time-fields]',timed);d.querySelector('[data-time-help]').hidden=!timed;
      f.elements.start.required=timed;f.elements.end.required=timed;
    }
    f.elements.repeatUnit.onchange=fields;f.elements.repeatMode.onchange=fields;f.elements.type.onchange=()=>{targets();fields();};f.elements.selection.onchange=fields;
    f.elements.targetId.onchange=()=>{sub();fields();};f.elements.dayMode.onchange=fields;f.elements.timeMode.onchange=fields;targets();fields();
    const info=d.querySelector('[data-la-editor-status]');if(old)info.dataset.ruleId=old.id;info.textContent=old?availability(old):'Na bewaren wacht de actie op een volgende verandering.';
    f.onsubmit=e=>{e.preventDefault();try{const fd=new FormData(f),rule={id:old?.id||crypto.randomUUID(),name:String(fd.get('name')).trim(),locationId:fd.get('locationId'),type:fd.get('type'),selection:fd.get('type')==='card'?'fixed':fd.get('selection'),repeatMode:fd.get('repeatMode'),...(fd.get('repeatMode')==='duration'?{repeatMinutes:Number(fd.get('repeatValue'))*({minutes:1,hours:60,days:1440}[fd.get('repeatUnit')])}:{}),targetId:fd.get('targetId')||'',subthemeId:fd.get('subthemeId')||'',radius:Number(fd.get('radius')),start:fd.get('start')||'',end:fd.get('end')||'',days:fd.getAll('day').map(Number),enabled:fd.has('enabled')};if(fd.get('dayMode')==='selected'&&!rule.days.length)throw Error('Kies minimaal één dag.');validate(rule);write(raw=>{const rules=raw.locationActions||[];if(id&&!rules.some(x=>x.id===id))throw Error('Deze actie is intussen verwijderd.');raw.locationActions=id?rules.map(x=>x.id===id?rule:x):[...rules,rule];});if(old?.repeatMode!==rule.repeatMode||old?.repeatMinutes!==rule.repeatMinutes){const snoozes=read(SNOOZES);delete snoozes[rule.id];localStorage.setItem(SNOOZES,JSON.stringify(snoozes));const state=visits();for(const v of Object.values(state))if(v.done)v.done=v.done.filter(x=>x!==rule.id);localStorage.setItem(VISITS,JSON.stringify(state));refresh();}observeTransitions(Date.now(),rule.id);refresh();window.LogCardsUI.close();}catch(error){d.querySelector('[data-card-message]').textContent=error.message;}};
  }
  function visits(){return Object.assign(Object.create(null),read(VISITS));}
  function assess(position,now=Date.now()){
    const c=position.coords,p={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,time:position.timestamp||now};
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180||!Number.isFinite(p.accuracy)||p.accuracy<0||now-p.time>120000||p.time>now+5000)return;
    point=p;const state=visits(),s=snapshot();
    for(const locationId of new Set(s.rules.map(r=>r.locationId))){
      const target=coordinates(locationId,s);if(!target)continue;
      const radius=Math.max(...s.rules.filter(r=>r.locationId===locationId).map(r=>r.radius));
      const delta=distance(p,target),v=state[locationId];
      if(delta+p.accuracy<=radius){if(!v?.inside)state[locationId]={inside:true,token:crypto.randomUUID(),done:v?.done||[]};else delete v.outsideSince;}
      else if(v?.inside&&delta-p.accuracy>radius+50){if(!v.outsideSince)v.outsideSince=now;else if(now-v.outsideSince>=20000)state[locationId]={...v,inside:false};}
      else if(v)delete v.outsideSince;
    }
    for(const key of Object.keys(state))if(!s.rules.some(r=>r.locationId===key))delete state[key];
    const snoozes=read(SNOOZES);let changed=false;
    for(const [id,snooze] of Object.entries(snoozes)){
      if(snooze.mode!=='location')continue;
      const origin=coordinates(snooze.locationId,s),rule=s.rules.find(r=>r.id===id);
      if(origin&&distance(p,origin)-p.accuracy>(rule?.radius||500)+50&&s.locations.some(l=>{const pos=coordinates(l.id,s);return l.id!==snooze.locationId&&pos&&distance(p,pos)+p.accuracy<=Math.max(25,Number(s.km.settings?.recognitionRadius)||500);})){delete snoozes[id];changed=true;}
    }
    if(changed)localStorage.setItem(SNOOZES,JSON.stringify(snoozes));
    localStorage.setItem(VISITS,JSON.stringify(state));status='Locatie gecontroleerd om '+new Date(now).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});refresh();
  }
  function saveState(key,value){const text=JSON.stringify(value);if(localStorage.getItem(key)!==text)localStorage.setItem(key,text);}
  function observedInside(rule,s,previous,now){
    if(!point||now-point.time>120000)return previous?.inside??null;
    const target=coordinates(rule.locationId,s);if(!target)return null;
    const delta=distance(point,target);
    if(delta+point.accuracy<=rule.radius){delete previous?.outsideSince;return true;}
    if(delta-point.accuracy>rule.radius+50){
      if(previous?.inside===true){
        if(!previous.outsideSince)previous.outsideSince=point.time;
        if(point.time-previous.outsideSince<20000)return true;
      }
      return false;
    }
    if(previous)delete previous.outsideSince;
    return previous?.inside??null;
  }
  function observeTransitions(now=Date.now(),resetId=''){
    const s=snapshot(),edges=read(EDGES),state=visits(),snoozes=read(SNOOZES);
    for(const r of s.rules){
      const fingerprint=JSON.stringify(r),old=edges[r.id],fresh=!old||old.fingerprint!==fingerprint||r.id===resetId;
      const edge=fresh?{fingerprint,inside:null,ready:false}:old;
      const inside=observedInside(r,s,edge,now),time=inTime(r,new Date(now));
      const arrival=edge.inside===false&&inside===true;
      const timeStarted=edge.time===false&&time;
      const snooze=snoozes[r.id],expired=edge.until&&now>=edge.until;
      const blocked=snooze&&(snooze.mode==='location'||now<snooze.until);
      if(!fresh&&!blocked&&r.enabled&&inside===true&&time&&(arrival||timeStarted||expired)){
        edge.ready=true;
        const v=state[r.locationId];if(v)v.done=(v.done||[]).filter(id=>id!==r.id);
        failed.delete(r.id);
      }
      if(blocked||inside===false||!time||!r.enabled||(r.type==='ride'&&s.km.activeTrip))edge.ready=false;
      Object.assign(edge,{inside,time,until:snooze?.until>now?snooze.until:null});edges[r.id]=edge;
    }
    for(const id of Object.keys(edges))if(!s.rules.some(r=>r.id===id))delete edges[id];
    saveState(EDGES,edges);saveState(VISITS,state);
    observeDeparture(s,now);
    return edges;
  }
  function observeDeparture(s,now){
    const smart=smartRideState(s),old=read(DEPARTURE);
    const edge=old.token===smart.token?old:{token:smart.token,inside:null,ready:false};
    const dest=smart.last?.destination;
    const origin=dest&&Number.isFinite(dest.lat)&&Number.isFinite(dest.lng)?dest:dest?.id?coordinates(dest.id,s):null;
    if(!smart.enabled||!smart.available||s.km.activeTrip){edge.ready=false;edge.inside=null;delete edge.outsideSince;}
    else if(origin&&point&&now-point.time<=120000){
      const radius=Math.max(25,Number(s.km.settings?.recognitionRadius)||500),delta=distance(point,origin);
      if(delta+point.accuracy<=radius){edge.inside=true;edge.ready=false;delete edge.outsideSince;}
      else if(delta-point.accuracy>radius+50&&edge.inside===true){
        if(!edge.outsideSince)edge.outsideSince=point.time;
        if(point.time-edge.outsideSince>=20000){edge.inside=false;edge.ready=true;}
      }else delete edge.outsideSince;
    }
    saveState(DEPARTURE,edge);
  }
  function toggle(id){
    const rule=snapshot().rules.find(r=>r.id===id);if(!rule)return;
    write(raw=>{raw.locationActions=(raw.locationActions||[]).map(r=>r.id===id?{...r,enabled:!r.enabled}:r);});
    // Hervatten legt de huidige situatie opnieuw vast; lopende wachttijden blijven behouden.
    observeTransitions(Date.now(),id);refresh();
  }
  function reset(id){
    const s=snapshot(),rule=s.rules.find(r=>r.id===id);if(!rule)return;
    const now=Date.now();
    const snoozes=read(SNOOZES);delete snoozes[id];saveState(SNOOZES,snoozes);
    const state=visits();for(const v of Object.values(state))if(v.done)v.done=v.done.filter(x=>x!==id);saveState(VISITS,state);
    const edges=read(EDGES),edge={fingerprint:JSON.stringify(rule),inside:null,ready:false};
    edge.inside=observedInside(rule,s,edge,now);edge.time=inTime(rule,new Date(now));edge.until=null;edges[id]=edge;saveState(EDGES,edges);
    const timed=['duration','halfHour'].includes(rule.repeatMode);
    if(timed)suppressRules([rule],rule.repeatMode,now);
    failed.delete(id);suppressOpenUntil=now+500;signature='';refresh();showResetNotice(timed);
  }
  function eligible(now=Date.now(),includeHandled=false){
    if(document.hidden||!point||now-point.time>120000)return [];
    const edges=observeTransitions(now),s=snapshot(),state=visits(),snoozes=read(SNOOZES);return s.rules.filter(r=>{
      const v=state[r.locationId],edge=edges[r.id],pos=coordinates(r.locationId,s);
      const snooze=snoozes[r.id],suppressed=snooze&&(snooze.mode==='location'||now<snooze.until);
      return (includeHandled||edge?.ready)&&edge?.inside===true&&r.enabled&&(r.type!=='ride'||rideModuleEnabled())&&!problem(r,s)&&inTime(r,new Date(now))&&(includeHandled||(!suppressed&&!v?.done?.includes(r.id)))&&pos&&distance(point,pos)+point.accuracy<=r.radius;
    });
  }
  function done(rule,performed=false){
    if(performed)lastHandled.set(rule.id,Date.now());
    const edges=read(EDGES);if(edges[rule.id]){edges[rule.id].ready=false;saveState(EDGES,edges);}
    if(rule.repeatMode&&rule.repeatMode!=='visit'){suppressRules([rule],rule.repeatMode);return;}
    const state=visits(),v=state[rule.locationId];if(v){v.done=[...new Set([...(v.done||[]),rule.id])];localStorage.setItem(VISITS,JSON.stringify(state));}refresh();
  }
  function stop(){generation++;if(pollingUnsubscribe){pollingUnsubscribe();pollingUnsubscribe=null;}if(watch!==null)navigator.geolocation?.clearWatch(watch);watch=null;clearInterval(timer);timer=null;point=null;renderSuggestions();}
  function start(){
    stop();failed.clear();if(document.hidden)return;
    if(!navigator.geolocation){status='Locatiebepaling is niet beschikbaar.';refresh();return;}
    const token=generation;status='Locatie bepalen…';refresh();
    const success=p=>{if(token!==generation)return;try{permissionState='granted';assess(p);}catch(_){status='Locatievoorstellen konden niet worden bijgewerkt.';point=null;refresh();}};
    const failure=e=>{if(token!==generation)return;point=null;status=e.code===1?'Geen locatietoestemming. Sta locatie toe en tik op Opnieuw controleren.':'Geen betrouwbare locatie beschikbaar. Probeer opnieuw.';if(e.code===1){permissionState='denied';stop();}refresh();};
    if(window.LogLocationPolling){
      pollingUnsubscribe=window.LogLocationPolling.subscribe((p,error)=>error?failure(error):success(p));
      window.LogLocationPolling.request({maxAge:window.LogLocationPolling.interval()}).catch(failure);return;
    }
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
  function suppressRules(rules,mode,now=Date.now()){
    if(!['halfHour','duration','location','day'].includes(mode))throw Error('Onbekende keuze.');
    const snoozes=read(SNOOZES),state=visits(),edges=read(EDGES),end=new Date(now);end.setHours(24,0,0,0);
    for(const r of rules){
      if(mode==='duration'&&(!Number.isInteger(r.repeatMinutes)||r.repeatMinutes<1||r.repeatMinutes>525600))throw Error('Ongeldige wachttijd. Bewerk de actie.');
      const until=mode==='halfHour'?now+1800000:mode==='duration'?now+r.repeatMinutes*60000:mode==='day'?end.getTime():null;
      snoozes[r.id]={mode,until,locationId:r.locationId};const v=state[r.locationId];if(v)v.done=(v.done||[]).filter(x=>x!==r.id);
      if(edges[r.id]){edges[r.id].ready=false;edges[r.id].until=until;}
    }
    localStorage.setItem(SNOOZES,JSON.stringify(snoozes));localStorage.setItem(VISITS,JSON.stringify(state));saveState(EDGES,edges);refresh();
  }
  function snoozeCard(id,mode,now=Date.now(),ruleIds=null) {
    const rules=snapshot().rules.filter(r=>r.type==='card'&&r.targetId===id&&(!ruleIds||ruleIds.includes(r.id)));
    suppressRules(rules,mode,now);
  }
  function decorateCard(){
    // Alleen een actie die de kaart zelf opent mag zijn eigen herhaalstatus wijzigen.
  }
  function recordFailure(rule,error){
    lastHandled.delete(rule.id);
    const state=visits(),snoozes=read(SNOOZES),edges=read(EDGES);
    for(const visit of Object.values(state))if(visit.done)visit.done=visit.done.filter(id=>id!==rule.id);
    delete snoozes[rule.id];
    if(edges[rule.id]){edges[rule.id].ready=false;edges[rule.id].until=null;}
    saveState(VISITS,state);saveState(SNOOZES,snoozes);saveState(EDGES,edges);
    status=error.message||'Actie kon niet worden voorbereid.';failed.add(rule.id);refresh();
  }
  async function propose(id){
    if(busy)return;const rule=eligible().find(r=>r.id===id);if(!rule)return;
    busy=true;
    try {
      if(rule.type==='ride'){
        if(read(KM).activeTrip)throw Error('Rond eerst de actieve rit af.');
        await window.LogRideStarter.prepare(rule.selection==='smart'?null:rule.targetId);done(rule,true);return;
      }
      if(rule.type==='card'){if(window.LogCardsModule.show(rule.targetId)===false)throw Error('Kaart kon niet worden geopend.');done(rule,true);return;}
      window.LogTimeModule.reloadFromStorage?.({view:'home'});
      const suggested=rule.selection==='smart'?window.LogTimeModule.suggestForAction():{themeId:rule.targetId,subthemeId:rule.subthemeId};
      if(!suggested)throw Error('Er is nog geen thema beschikbaar voor een slim voorstel.');
      const chosen={...rule,targetId:suggested.themeId,subthemeId:suggested.subthemeId,selection:'fixed'};
      const timer=window.LogTimeModule.getState().timer,expectedTimer=JSON.stringify(timer),original=JSON.stringify(rule);
      const active=timer.status==='active'&&!timer.interruption,inactive=timer.status==='inactive';
      if(!inactive&&!active)throw Error('Rond eerst de openstaande taak of tussenstop af.');
      const buttons=inactive?'<button type="button" class="btn primary full" data-la-start="start">Start taak</button>':active?'<button type="button" class="btn primary full" data-la-start="interrupt">Start als tussenstop</button><button type="button" class="btn secondary full" data-la-start="replace">Huidige afronden en nieuwe starten</button>':'<p class="cards-notice">Rond eerst de openstaande taak of tussenstop af. Er wordt niets gewijzigd.</p>';
      const d=window.LogCardsUI.sheet(rule.name,`<p>Taak: <strong>${esc(targetName(chosen))}</strong></p><p class="cards-notice">${esc(label(rule.locationId))}</p>${active?`<p>Er loopt: <strong>${esc(timer.themeName)}</strong></p><p class="cards-notice">Een tussenstop gebruikt je ingestelde aftrek en afronding. Daarna ga je verder met de huidige taak. Bij afronden wordt de huidige taak met de ingestelde afronding opgeslagen, zonder inzet van anderen.</p>`:''}<div class="la-task-actions">${buttons}</div>`);
      done(rule,true);
      d.querySelectorAll('[data-la-start]').forEach(button=>button.onclick=()=>{
        if(busy)return;busy=true;button.disabled=true;
        try{const current=eligible(Date.now(),true).find(r=>r.id===id);if(!current||JSON.stringify(current)!==original)throw Error('Dit voorstel is niet meer actueel. Sluit het en controleer de actie opnieuw.');
          window.LogTimeModule.startFromLocationAction({themeId:chosen.targetId,subthemeId:chosen.subthemeId,locationName:label(rule.locationId),mode:button.dataset.laStart,expectedTimer});
          window.LogCardsUI.close();window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section:'time'}}));
        }catch(error){recordFailure(rule,error);d.querySelector('[data-card-message]').textContent=error.message;}finally{busy=false;button.disabled=false;}
      });
    }catch(error){recordFailure(rule,error);window.LogCardsUI.sheet(rule.name,`<p>${esc(error.message||'Actie kon niet worden voorbereid.')}</p>`);}
    finally{busy=false;}
  }
  function smartRideState(s=snapshot()){
    const trips=s.km.trips||[],last=[...trips].sort((a,b)=>new Date(b.arrivalTime||b.departureTime)-new Date(a.arrivalTime||a.departureTime))[0];
    return {available:rideModuleEnabled(),enabled:s.time.settings?.smartRideEnabled!==false,last,token:last?JSON.stringify([last.id,last.arrivalTime,last.destination,last.endOdometer]):null};
  }
  async function prepareSmartRide(){
    observeTransitions();const s=snapshot(),smart=smartRideState(s),departure=read(DEPARTURE);
    if(!point||Date.now()-point.time>120000||departure.token!==smart.token||!departure.ready)return;
    if(busy||!smart.available||!smart.enabled||!smart.last?.destination||s.km.activeTrip||localStorage.getItem('kmreg-test-shell-section-v1')!=='rides'||!window.LogRideStarter||localStorage.getItem('log-test-smart-ride-handled-v1')===smart.token)return;
    busy=true;
    try{await window.LogRideStarter.prepare();localStorage.setItem('log-test-smart-ride-handled-v1',smart.token);const panel=document.getElementById('startInlinePanel');if(panel){panel.dataset.laAutoPrepared='true';const touched=()=>{delete panel.dataset.laAutoPrepared;};panel.addEventListener('input',touched,{once:true});panel.addEventListener('change',touched,{once:true});panel.addEventListener('pointerdown',touched,{once:true});}}
    catch(error){status=error.message;refresh();}
    finally{busy=false;}
  }
  function visible(el){
    if(!el?.isConnected)return false;
    for(let node=el;node;node=node.parentElement){if(node.hidden||node.getAttribute('aria-hidden')==='true')return false;const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden')return false;}
    return true;
  }
  function uiBlocked(allowAutoRide=false){
    const autoRide=allowAutoRide&&document.querySelector('#startInlinePanel[data-la-auto-prepared="true"]');
    return busy||document.hidden||[...document.querySelectorAll('dialog[open],.modal:not([hidden]),[data-action="cancel-start"],[data-action="cancel-arrival"],#cancelInlineInterruption,#inlineTaskTheme')].some(el=>!(autoRide&&el.matches('[data-action="cancel-start"]'))&&visible(el))||document.body.matches('.editor-view,.km-shell-settings-open,.km-shell-drawer-open,.km-shell-drawer-peek')||(document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')&&visible(document.activeElement));
  }
  function ruleStatus(rule){
    if(!rule.enabled)return 'Uitgeschakeld';
    if(rule.type==='ride'&&!rideModuleEnabled())return 'Ritten staat uit';
    const error=problem(rule);if(error)return error;
    if(failed.has(rule.id))return 'Kon niet worden geopend · controleer de instelling of reset';
    if(!inTime(rule))return 'Buiten de ingestelde dagen of tijden';
    if(!point||Date.now()-point.time>120000)return permissionState==='denied'?'Locatietoestemming nodig':'Wacht op een actuele GPS-locatie';
    const delta=distance(point,coordinates(rule.locationId));
    if(delta>rule.radius)return 'Buiten de locatie · circa '+Math.round(delta)+' m afstand';
    if(delta+point.accuracy>rule.radius)return 'GPS nog te onnauwkeurig · ±'+Math.round(point.accuracy)+' m';
    const snooze=read(SNOOZES)[rule.id];if(snooze?.mode==='location')return 'Wacht op een herkende locatiewisseling';
    if(snooze?.until>Date.now())return 'Opnieuw vanaf '+new Date(snooze.until).toLocaleString('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    if(visits()[rule.locationId]?.done?.includes(rule.id))return 'Dit bezoek al getoond · wacht op volgend bezoek';
    if(!read(EDGES)[rule.id]?.ready)return 'Wacht op een volgende verandering';
    if(failed.has(rule.id))return 'Kon niet worden geopend · controleer de instelling';
    return uiBlocked(rule.type==='card')?'Wacht tot het geopende scherm gesloten is':'Klaar om te tonen';
  }
  function nextWindow(rule,after=Date.now()){
    if(inTime(rule,new Date(after)))return after;
    const start=rule.start?rule.start.split(':').map(Number):[0,0];
    for(let offset=0;offset<=7;offset++){
      const day=new Date(after);day.setDate(day.getDate()+offset);day.setHours(start[0],start[1],0,0);
      if(day.getTime()>after&&inTime(rule,day))return day.getTime();
    }
    return null;
  }
  function availability(rule,now=Date.now()){
    if(!rule.enabled)return 'Uitgeschakeld';
    if(failed.has(rule.id))return 'Kon niet worden geopend · controleer de instelling of reset';
    if(rule.type==='ride'&&!rideModuleEnabled())return 'Ritten staat uit';
    const error=problem(rule);if(error)return error;
    const snooze=read(SNOOZES)[rule.id];
    if(snooze?.mode==='location')return 'Weer na een herkende locatiewisseling en terugkeer';
    const next=nextWindow(rule,Math.max(now,snooze?.until||0));
    if(next&&next>now){
      const at=new Date(next),today=new Date(now),sameDay=at.toDateString()===today.toDateString();
      const when=(sameDay?'vandaag ':at.toLocaleDateString('nl-NL',{weekday:'short',day:'numeric',month:'short'})+' ')+at.toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'});
      return `Weer vanaf ${when} · op de ingestelde locatie`;
    }
    if(visits()[rule.locationId]?.done?.includes(rule.id))return rule.start||rule.days?.length?'Weer bij een volgend bezoek of tijdvak':'Weer bij een volgend bezoek';
    if(!read(EDGES)[rule.id]?.ready){
      const waiting=rule.start||rule.days?.length?'wacht op aankomst of het volgende tijdvak':'wacht op een volgende aankomst';
      if(['duration','halfHour'].includes(rule.repeatMode)){
        if(snooze?.until&&snooze.until<=now)return `Wachttijd verstreken · ${waiting}`;
        const minutes=rule.repeatMode==='halfHour'?30:Number(rule.repeatMinutes);
        const amount=minutes%1440===0?minutes/1440:minutes%60===0?minutes/60:minutes;
        const unit=minutes%1440===0?(amount===1?'dag':'dagen'):minutes%60===0?'uur':amount===1?'minuut':'minuten';
        return `Na uitvoering: opnieuw na ${amount} ${unit} · ${waiting}`;
      }
      if(rule.repeatMode==='day')return `Na uitvoering: opnieuw de volgende dag · ${waiting}`;
      if(rule.repeatMode==='location')return `Na uitvoering: opnieuw na locatiewisseling · ${waiting}`;
      return waiting.charAt(0).toUpperCase()+waiting.slice(1);
    }
    return ruleStatus(rule);
  }
  function compactStatus(rule,now=Date.now()){
    if(!rule.enabled)return 'Uitgeschakeld';
    if(rule.type==='ride'&&!rideModuleEnabled())return 'Ritten staat uit';
    if(problem(rule))return 'Controleer koppeling';
    if(failed.has(rule.id))return 'Uitvoering mislukt';
    const snooze=read(SNOOZES)[rule.id];
    if(snooze?.mode==='location')return 'Wacht op locatiewisseling';
    const next=nextWindow(rule,Math.max(now,snooze?.until||0));
    if(next>now){
      const minutes=Math.ceil((next-now)/60000);
      return minutes<60?'Over '+minutes+' min':new Date(next).toDateString()===new Date(now).toDateString()?'Vanaf '+new Date(next).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'}):'Vanaf '+new Date(next).toLocaleString('nl-NL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    }
    if(!point||now-point.time>120000)return permissionState==='denied'?'Locatietoestemming nodig':'Wacht op GPS';
    const delta=distance(point,coordinates(rule.locationId));
    if(delta>rule.radius)return 'Wacht op aankomst';
    if(delta+point.accuracy>rule.radius)return 'GPS te onnauwkeurig';
    if(!read(EDGES)[rule.id]?.ready)return rule.start||rule.days?.length?'Wacht op aankomst of tijdvak':'Wacht op aankomst';
    return uiBlocked(rule.type==='card')?'Wacht op sluiten scherm':'Klaar om te tonen';
  }
  function detailHtml(rule){
    const now=Date.now(),fresh=point&&now-point.time<=120000,pos=coordinates(rule.locationId);
    const delta=fresh&&pos?distance(point,pos):null;
    const recognized=delta===null?'Nog niet te bepalen':delta+point.accuracy<=rule.radius?'Ja':delta-point.accuracy>rule.radius?'Nee':'Nog onzeker';
    const last=lastHandled.get(rule.id);
    const rows=[
      ['Status',ruleStatus(rule)],
      ['Locatie',label(rule.locationId)],
      ['Locatie herkend',recognized],
      ['GPS',fresh?'±'+Math.round(point.accuracy)+' m nauwkeurig'+(delta!==null?' · circa '+Math.round(delta)+' m van locatie':''):'Geen actuele GPS-meting'],
      ['Herkenningsstraal',rule.radius+' m'],
      ['Dagen',rule.days?.length?rule.days.map(day=>days[day]).join(', '):'Elke dag'],
      ['Tijdvak',rule.start?rule.start+' – '+rule.end:'Hele dag'],
      ['Laatst getoond / voorbereid (sessie)',last?new Date(last).toLocaleString('nl-NL'):'Niet geregistreerd'],
      ['Volgende mogelijkheid',availability(rule)]
    ];
    return '<dl>'+rows.map(([title,value])=>'<dt style="font-weight:600;margin-top:12px">'+esc(title)+'</dt><dd style="margin:4px 0;color:var(--muted)">'+esc(value)+'</dd>').join('')+'</dl>';
  }
  function details(id){
    const rule=snapshot().rules.find(r=>r.id===id);if(!rule)return;
    const panel=window.LogCardsUI.sheet(rule.name,'<p>'+esc(description(rule,snapshot()))+'</p><div data-la-details="'+esc(id)+'">'+detailHtml(rule)+'</div><p class="cards-notice">Automatische acties wachten zolang dit venster geopend is. De laatste uitvoering wordt alleen voor deze geopende sessie bijgehouden.</p><button type="button" class="btn secondary full" data-la-detail-edit>Bewerken</button>');
    panel.querySelector('[data-la-detail-edit]').onclick=()=>edit(id);
  }
  function updateRuleStatus(){
    const rules=snapshot().rules;
    document.querySelectorAll('[data-la-details]').forEach(el=>{
      const rule=rules.find(r=>r.id===el.dataset.laDetails),html=rule?detailHtml(rule):'<p>Deze actie is verwijderd.</p>';
      if(el.innerHTML!==html)el.innerHTML=html;
    });
    root?.querySelectorAll('[data-la-next]').forEach(el=>{const rule=rules.find(r=>r.id===el.dataset.laNext);if(rule){const text=compactStatus(rule);if(el.textContent!==text)el.textContent=text;}});
    document.querySelectorAll('[data-la-editor-status][data-rule-id]').forEach(el=>{const rule=rules.find(r=>r.id===el.dataset.ruleId);if(rule){const text=availability(rule);if(el.textContent!==text)el.textContent=text;}});
  }
  function drain(){
    observeTransitions();updateRuleStatus();
    const rules=eligible().filter(r=>!failed.has(r.id)&&!(r.type==='ride'&&read(KM).activeTrip));
    const card=rules.find(r=>r.type==='card');if(card&&!uiBlocked(true)){propose(card.id);return;}
    if(uiBlocked())return;
    const rule=rules[0];if(rule)propose(rule.id);else prepareSmartRide();
  }
  setInterval(drain,1000);
  function showResetNotice(timed=false){
    let note=document.getElementById('laResetNotice');
    if(!note){note=document.createElement('div');note.id='laResetNotice';note.className='la-reset-notice';note.setAttribute('role','status');document.body.append(note);}
    note.textContent=timed?'Wachttijd opnieuw gestart · je kunt op deze locatie blijven':'Opnieuw klaargezet · wacht op een volgende verandering';note.hidden=false;
    clearTimeout(note._timer);note._timer=setTimeout(()=>{note.hidden=true;},3000);
  }
  function description(rule,s){
    const target=targetName(rule,s),place=label(rule.locationId,s);
    if(rule.type==='card')return `Toont ${target} bij ${place}.`;
    if(rule.type==='ride')return rule.selection==='smart'?`Stelt bij ${place} een rit voor op basis van je historie.`:`Bereidt bij ${place} een rit naar ${target} voor.`;
    return rule.selection==='smart'?`Stelt bij ${place} een taak voor op basis van je historie.`:`Bereidt bij ${place} de taak ${target} voor.`;
  }
  function render(){
    if(!root)return;const s=snapshot(),allowed=window.LogSwipePolicy?.enabled('locationactions')!==false;
    const rules=s.rules.filter(r=>(r.name+' '+label(r.locationId,s)+' '+targetName(r,s)).toLocaleLowerCase('nl').includes(query));
    root.innerHTML=`<section class="cards-module"><button type="button" class="btn primary full contact-update" data-la-new>＋ Actie toevoegen</button>${rules.map(r=>`<div class="code-card-swipe" data-la-row data-la-type="${esc(r.type)}" style="--card-color:${(typeUI[r.type]||typeUI.card).color};--card-action-count:${allowed?2:1}"><div class="la-reset-actions" inert aria-hidden="true"><button type="button" class="swipe-reopen" data-la-reset="${esc(r.id)}" aria-label="Actie opnieuw klaarzetten">Reset</button></div><div class="code-card-actions" inert aria-hidden="true">${allowed?`<button type="button" class="swipe-delete" data-la-delete="${esc(r.id)}">Verwijder</button>`:''}<button type="button" class="swipe-edit" data-la-edit="${esc(r.id)}">Bewerk</button></div><div class="code-card-surface"><button type="button" class="code-card" data-la-open="${esc(r.id)}" aria-label="${esc(r.name)}${r.enabled?'':' · uitgeschakeld'}"><span class="code-card-icon" role="img" aria-label="${(typeUI[r.type]||typeUI.card).label}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${(typeUI[r.type]||typeUI.card).path}"/></svg></span><span class="code-card-copy"><strong>${esc(r.name)}</strong><small>${esc(description(r,s))}</small><small class="la-next" data-la-next="${esc(r.id)}">${esc(compactStatus(r))}</small></span></button><button type="button" class="btn secondary" style="margin:0 0 10px 44px;min-height:36px;padding:6px 12px" data-la-toggle="${esc(r.id)}" aria-label="${esc(r.name)} ${r.enabled?'pauzeren':'hervatten'}" aria-pressed="${!r.enabled}">${r.enabled?'Pauzeren':'Hervatten'}</button></div></div>`).join('')||'<p class="cards-empty">Nog geen acties voor deze selectie. Voeg een actie toe en kies Kaart tonen om een kaart op locatie te openen.</p>'}</section>`;
  }
  function refresh(){observeTransitions();updateRuleStatus();updateSettings();renderSuggestions();if(!root)return;const next=JSON.stringify([snapshot(),query,window.LogSwipePolicy?.enabled('locationactions')]);if(next!==signature){signature=next;render();}}
  function mount(target){
    if(root===target&&root.querySelector('[data-la-new]'))return;root=target;signature='';
    root.onclick=e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-la-open')&&Date.now()<Math.max(suppressOpenUntil,Number(b.closest('[data-la-row]')?.dataset.suppressUntil||0)))return;
      try{if(b.dataset.laToggle)toggle(b.dataset.laToggle);if(b.dataset.laReset)reset(b.dataset.laReset);if(b.hasAttribute('data-la-new'))edit();if(b.dataset.laEdit)edit(b.dataset.laEdit);if(b.dataset.laOpen)details(b.dataset.laOpen);
        if(b.dataset.laDelete&&window.LogSwipePolicy?.enabled('locationactions')!==false&&confirm('Deze actie verwijderen?'))write(raw=>{raw.locationActions=(raw.locationActions||[]).filter(r=>r.id!==b.dataset.laDelete);});
      }catch(error){window.LogCardsUI.sheet('Actie niet bijgewerkt',`<p>${esc(error.message)}</p>`);}
    };root.onchange=null;refresh();
  }
  window.LogLocationActions={mount,refresh,edit,reset,toggle,getSearch:()=>query,details,compactStatus,settingsHtml,bindSettings,drain,snoozeCard,decorateCard,smartRideState,prepareSmartRide,inTime,nextWindow,availability,coordinates,assess,eligible,propose,snapshot,validate,unmount(){if(root){window.LogCardsUI.close();root.onclick=null;root.onchange=null;root=null;query='';}},search(value){const next=String(value||'').toLocaleLowerCase('nl');if(next!==query){query=next;signature='';refresh();}return root?.querySelectorAll('[data-la-row]').length||0;}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});
  window.addEventListener('pagehide',stop);window.addEventListener('pageshow',start);
  for(const event of ['log-time-state-change','log-km-state-change','log-shell-view-refresh'])window.addEventListener(event,refresh);
  window.addEventListener('storage',refresh);
  window.addEventListener('log-navigation-modules-change',refresh);
})();
