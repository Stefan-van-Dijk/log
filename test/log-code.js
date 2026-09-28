(function(){
  'use strict';
  const KM='kmreg-test-v4-data', TIME='urenregistratie.test.pwa.v1';
  const types=['theme','subtheme','location','person'];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=key=>JSON.parse(localStorage.getItem(key)||'{}');
  const list=(raw,key)=>Array.isArray(raw[key])?raw[key]:[];
  const collection={theme:'themes',subtheme:'subthemes',location:'locations',person:'colleagues'};
  const taskIdPattern=/^[A-Za-z0-9_-]{12}$/;
  const newCodeId=()=>crypto.randomUUID().replace(/-/g,'').slice(0,12);
  function parse(value){
    if(typeof value==='string'&&value.startsWith('log-task:'))value=JSON.stringify({kind:'log-task',version:1,id:value.slice(9)});
    let p;try{p=JSON.parse(value);}catch(_){return null;}
    if(!p)return null;
    if(p.kind==='log-task'){
      if(p.version!==1)throw Error('Deze taakcode gebruikt een niet ondersteunde versie.');
      if(typeof p.id!=='string'||!/^[A-Za-z0-9_-]{12}$/.test(p.id))throw Error('Ongeldige taakidentifier.');
      return {kind:'log-task',version:1,id:p.id};
    }
    if(p.kind!=='log-code')return null;
    if(value.length>4000||p.version!==1)throw Error('Deze Log-code is te groot of gebruikt een niet ondersteunde versie.');
    if(!Array.isArray(p.entities)||p.entities.length>20||!Array.isArray(p.actions)||p.actions.length>2)throw Error('Ongeldige Log-code.');
    const text=(v,max=160)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Ongeldige gegevens in Log-code.');return v;};
    const ids=new Set();
    const entities=p.entities.map(e=>{
      if(!e||!types.includes(e.type))throw Error('Onbekend soort gegevens.');
      const n={type:e.type,id:text(e.id,80),name:text(e.name)};
      if(e.taskCodeId!=null){if(!['theme','subtheme'].includes(e.type)||typeof e.taskCodeId!=='string'||!taskIdPattern.test(e.taskCodeId))throw Error('Ongeldige taakidentifier.');n.taskCodeId=e.taskCodeId;}
      if(ids.has(n.id))throw Error('Dubbele identifier in Log-code.');ids.add(n.id);
      for(const k of e.type==='location'?['address','parentId']:e.type==='person'?['email','phone']:e.type==='subtheme'?['themeId']:['color']){
        if(e[k]!=null&&e[k]!=='')n[k]=text(e[k],k.endsWith('Id')?80:160);
      }
      if(n.color&&!/^#[0-9a-f]{6}$/i.test(n.color))throw Error('Ongeldige kleur.');
      if(e.type==='location'&&(e.lat!=null||e.lng!=null)){
        if(typeof e.lat!=='number'||typeof e.lng!=='number'||!Number.isFinite(e.lat)||!Number.isFinite(e.lng)||Math.abs(e.lat)>90||Math.abs(e.lng)>180)throw Error('Ongeldige GPS-positie.');
        n.lat=e.lat;n.lng=e.lng;
      }
      return n;
    });
    const find=(id,type)=>entities.find(e=>e.id===id&&e.type===type);
    const taskIds=new Set();
    for(const e of entities.filter(e=>['theme','subtheme'].includes(e.type))){for(const id of new Set([e.id,e.taskCodeId].filter(Boolean))){if(taskIds.has(id))throw Error('Dubbele taakidentifier.');taskIds.add(id);}}
    for(const e of entities){
      if(e.type==='subtheme'&&!find(e.themeId,'theme'))throw Error('Het hoofdthema ontbreekt.');
      if(e.parentId&&!find(e.parentId,'location'))throw Error('De hoofdlocatie ontbreekt.');
      if(e.parentId&&find(e.parentId,'location').parentId)throw Error('Log ondersteunt hoofdlocaties met één niveau sublocaties.');
      const seen=new Set([e.id]);let parent=e.parentId;
      while(parent){if(seen.has(parent))throw Error('Cirkel in locatiekoppelingen.');seen.add(parent);parent=find(parent,'location').parentId;}
    }
    const actions=p.actions.map(a=>{
      if(!a||!['task','ride'].includes(a.type))throw Error('Deze actie wordt niet ondersteund.');
      const n={type:a.type};
      if(a.type==='task'){
        if(!find(a.themeId,'theme'))throw Error('De taak mist een thema.');n.themeId=a.themeId;
        if(a.subthemeId){if(find(a.subthemeId,'subtheme')?.themeId!==a.themeId)throw Error('Subthema hoort niet bij dit thema.');n.subthemeId=a.subthemeId;}
      }
      if(a.locationId){if(!find(a.locationId,'location'))throw Error('De actie mist een locatie.');n.locationId=a.locationId;}
      if(a.type==='ride'&&!n.locationId)throw Error('De rit mist een bestemming.');
      return n;
    });
    if(!entities.length)throw Error('Deze code bevat geen gegevens.');
    return {kind:'log-code',version:1,title:text(p.title||'Log-code',80),entities,actions};
  }
  function plan(payload){
    const km=read(KM),time=read(TIME),map=new Map(),rows=[],remaining=payload.entities.map(e=>({...e}));
    while(remaining.length){
      const index=remaining.findIndex(e=>(!e.parentId||map.has(e.parentId))&&(!e.themeId||map.has(e.themeId)));
      if(index<0)throw Error('Onoplosbare verwijzingen.');
      const e=remaining.splice(index,1)[0],raw=e.type==='location'?km:time,key=collection[e.type];
      if(['theme','subtheme'].includes(e.type)&&!e.taskCodeId&&taskIdPattern.test(e.id))e.taskCodeId=e.id;
      raw[key]=list(raw,key);const relation=e.parentId?{parentId:map.get(e.parentId)}:e.themeId?{themeId:map.get(e.themeId)}:{};
      const fields={...e,...relation};delete fields.type;delete fields.id;
      const exact=raw[key].find(x=>x.logCodeId===e.id||x.taskCodeId===e.id||x.id===e.id);
      const candidates=exact?[exact]:raw[key].filter(x=>x.name===e.name&&Object.entries(['theme','subtheme'].includes(e.type)?relation:fields).every(([k,v])=>String(x[k]??'')===String(v)));
      if(candidates.length>1)throw Error(`Meerdere bestaande vermeldingen voor “${e.name}”. Maak die eerst eenduidig.`);
      const found=candidates[0],changed=found&&Object.entries(fields).some(([k,v])=>String(found[k]??'')!==String(v));
      if(found&&e.type==='subtheme'&&found.themeId!==relation.themeId)throw Error('Dit subthema is al gekoppeld aan een ander hoofdthema.');
      if(found?.taskCodeId&&e.taskCodeId&&found.taskCodeId!==e.taskCodeId)throw Error('Dit item heeft al een andere taakcode. Bestaande koppeling blijft behouden.');
      const id=found?.id||crypto.randomUUID();map.set(e.id,id);
      if(!found)raw[key].push({...fields,...(e.type==='location'?{type:'other',shareRide:'never',useCount:0}:{}),id,logCodeId:e.id,usageCount:0,createdAt:new Date().toISOString()});
      else if(!found.logCodeId)found.logCodeId=e.id;
      if(found&&e.taskCodeId)found.taskCodeId=e.taskCodeId;
      rows.push({entity:e,local:found||null,status:found?(changed?'Bestaand · lokale gegevens behouden':'Al aanwezig'):'Nieuw'});
    }
    const owners=new Map();
    for(const x of [...list(time,'themes'),...list(time,'subthemes')])for(const code of [x.logCodeId,x.taskCodeId,x.id].filter(c=>taskIdPattern.test(c||''))){if(owners.has(code)&&owners.get(code)!==x)throw Error('Een taakidentifier hoort bij meerdere items. Bestaande gegevens blijven behouden.');owners.set(code,x);}
    return {km,time,map,rows};
  }
  function commit(payload){
    const result=plan(payload);
    try{
      if(payload.entities.some(e=>e.type==='location'))localStorage.setItem(KM,JSON.stringify(result.km));
      if(payload.entities.some(e=>e.type!=='location'))localStorage.setItem(TIME,JSON.stringify(result.time));
    }catch(_){throw Error('Opslaan niet voltooid. Mogelijk is een deel toegevoegd. Maak opslagruimte vrij en probeer opnieuw; bestaande gegevens worden herkend.');}
    window.dispatchEvent(new CustomEvent('log-km-state-change',{detail:{reason:'code-import'}}));
    window.LogTimeModule?.reloadFromStorage?.({view:'home'});
    window.dispatchEvent(new Event('log-time-state-change'));
    return result;
  }
  function details(e){return [e.address,e.lat!=null?`${e.lat}, ${e.lng}`:'',e.email,e.phone].filter(Boolean).join(' · ');}
  function previewTask(payload){
    let resolved;try{resolved=resolveTask(payload.id);}catch(error){const panel=window.LogCardsUI.sheet('Log-code',`<p role="status">${esc(error.message)}</p><p>Scan eerst de configuratie-QR voor dit thema.</p><button class="btn full" data-task-back>Terug</button>`);panel.querySelector('[data-task-back]').onclick=()=>window.LogCardsUI.close();return;}
    const {theme,sub}=resolved;
    const panel=window.LogCardsUI.sheet('Taak herkend',`<h3>${esc(theme.name)}</h3><p>${esc(sub?.name||'Zonder subthema')}</p><button class="btn full cards-scan-action" data-start-compact-task>Taak starten</button><p class="cards-notice">Controleer de ingevulde taak en bevestig met Start.</p><p data-log-status role="status"></p>`);
    panel.querySelector('[data-start-compact-task]').onclick=()=>{
      const button=panel.querySelector('[data-start-compact-task]');if(button.disabled)return;button.disabled=true;
      try{
        const current=resolveTask(payload.id);
        prepareTask({themeId:current.theme.id,subthemeId:current.sub?.id||'',locationName:'',note:current.sub?.name||''});
      }catch(error){panel.querySelector('[data-log-status]').textContent=error.message;button.disabled=false;}
    };
  }
  function resolveTask(id){
    const time=read(TIME),matches=[...list(time,'themes').map(x=>({theme:x})),...list(time,'subthemes').map(x=>({sub:x}))].filter(r=>[r.sub?.logCodeId,r.sub?.taskCodeId,r.sub?.id,r.theme?.logCodeId,r.theme?.taskCodeId,r.theme?.id].includes(id));
    if(!matches.length)throw Error('Deze Log-code is nog niet geconfigureerd.');
    if(matches.length!==1)throw Error('Deze Log-code is niet eenduidig geconfigureerd.');
    const {sub}=matches[0],theme=sub?list(time,'themes').find(t=>t.id===sub.themeId):matches[0].theme;
    if(!theme)throw Error('Het hoofdthema van deze taak is niet beschikbaar.');
    return {theme,sub};
  }
  function prepareTask(args){
    // Validate before closing the scanner; showHome must run before opening the modal.
    window.LogTimeModule.prepareFromCode(args);
    window.LogCardsUI.close();
  }
  function preview(payload){
    if(payload.kind==='log-task')return previewTask(payload);
    const ui=window.LogCardsUI,result=plan(payload);
    const panel=ui.sheet('Log-code herkennen',`<h3>${esc(payload.title)}</h3><p>Controleer deze gegevens. Bestaande waarden blijven behouden.</p>${result.rows.map(({entity:e,local,status})=>`<div class="log-code-row"><strong>${esc(e.name)}</strong><small>${esc({theme:'Thema',subtheme:'Subthema',location:'Locatie',person:'Persoon'}[e.type])} · ${esc(status)}</small><small>${esc(details(e))}</small>${local&&status.includes('lokale')?`<small>In Log: ${esc(local.name)} · ${esc(details(local))}</small>`:''}</div>`).join('')}<p>${payload.actions.length?'Na toevoegen kies je zelf een starter.':'Deze code is een informatiedrager zonder starter.'}</p><button class="btn full" data-import-code>Gegevens toevoegen / gebruiken</button><p data-log-status role="status"></p>`);
    panel.querySelector('[data-import-code]').onclick=()=>{
      try{const saved=commit(payload);ready(payload,saved);}catch(error){panel.querySelector('[data-log-status]').textContent=error.message;}
    };
  }
  function ready(payload,result){
    const panel=window.LogCardsUI.sheet(payload.title,`<p>Gegevens zijn beschikbaar in Log. Personen staan in de module Personen.</p>${payload.actions.map((a,i)=>`<button class="btn full cards-scan-action" data-code-starter="${i}">${a.type==='task'?'Taak starten':'Rit voorbereiden'} · ${esc(payload.entities.find(e=>e.id===(a.type==='task'?(a.subthemeId||a.themeId):a.locationId))?.name)}</button>`).join('')}<p class="cards-notice">Bij een taak controleer je eerst thema en optioneel subthema en bevestig je met Start. Bij een rit controleer je vertrekpunt, kilometerstand en type rit.</p><p data-log-status role="status"></p>`);
    panel.querySelectorAll('[data-code-starter]').forEach(button=>button.onclick=async()=>{
      if(button.disabled)return;button.disabled=true;
      try{
        const a=payload.actions[Number(button.dataset.codeStarter)],current=plan(payload);
        if(current.rows.some(row=>row.status==='Nieuw'))throw Error('Gegevens zijn gewijzigd of verwijderd. Scan de code opnieuw.');
        const id=ref=>current.map.get(ref);
        const loc=list(read(KM),'locations').find(x=>x.id===id(a.locationId));
        if(a.type==='task'){
          prepareTask({themeId:id(a.themeId),subthemeId:id(a.subthemeId)||'',locationName:loc?.name||''});
        }else{await window.LogRideStarter.prepare(id(a.locationId));window.LogCardsUI.close();}
      }catch(error){panel.querySelector('[data-log-status]').textContent=error.message;button.disabled=false;}
    });
  }
  function builder(){
    const km=read(KM),time=read(TIME),options=(items)=>'<option value="">Niet opnemen</option><option value="new">Nieuw invullen</option>'+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    const groups=[['theme','Thema',list(time,'themes')],['subtheme','Subthema',list(time,'subthemes')],['location','Locatie',list(km,'locations')],['person','Persoon',list(time,'colleagues')]];
    const panel=window.LogCardsUI.sheet('Log-code maken',`<form data-log-builder><label>Titel<input name="title" maxlength="80" required></label>${groups.map(([type,label,items])=>`<div class="form-group" data-group="${type}"><label>${label}<select name="${type}">${options(items)}</select></label><div data-new="${type}" hidden><label>Naam<input name="${type}Name" maxlength="160"></label>${type==='location'?'<label>Adres<input name="address" maxlength="160"></label>':type==='person'?'<label>E-mail<input name="email" type="email" maxlength="160"></label><label>Telefoon<input name="phone" maxlength="80"></label>':''}</div></div>`).join('')}<label data-task-starter hidden><input type="checkbox" name="task"> Starter: taak starten</label><label data-ride-starter hidden><input type="checkbox" name="ride"> Starter: rit voorbereiden</label><p data-subtheme-help hidden>Het subthema hoort bij het gekozen thema.</p><p data-location-help hidden>De hoofdlocatie wordt samen met deze sublocatie opgenomen.</p><p data-person-help hidden>Iedereen die deze QR leest kan de opgenomen persoonsgegevens zien. Neem alleen gegevens op die je wilt delen.</p><label><input type="checkbox" name="consent" required> Ik wil deze gegevens in de code opnemen.</label><button class="btn full" type="submit">Inhoud controleren</button><p data-log-status role="status"></p></form>`);
    const form=panel.querySelector('form');
    const modes=document.createElement('div');modes.innerHTML='<button type="button" class="btn full" data-theme-config>Thema-configuratie (KIP)</button><button type="button" class="btn full" data-task-code>Compacte actie-QR</button><p>Of maak hieronder een algemene Log-code.</p>';form.before(modes);
    modes.querySelector('[data-theme-config]').onclick=configBuilder;
    modes.querySelector('[data-task-code]').onclick=taskBuilder;
    function show(selector,visible){const node=panel.querySelector(selector);node.hidden=!visible;node.style.display=visible?'':'none';node.querySelectorAll('input,select').forEach(input=>{input.disabled=!visible;});}
    function fields(){
      const theme=form.elements.theme.value,location=form.elements.location.value,person=form.elements.person.value;
      const sub=form.elements.subtheme,previous=sub.value;
      sub.innerHTML=options(theme&&theme!=='new'?list(time,'subthemes').filter(item=>String(item.themeId)===theme):[]);
      sub.value=[...sub.options].some(option=>option.value===previous)?previous:'';if(!theme)sub.value='';
      show('[data-group="subtheme"]',Boolean(theme));
      for(const [type] of groups){const input=form.elements[type],isNew=!input.disabled&&input.value==='new';show('[data-new="'+type+'"]',isNew);form.elements[type+'Name'].required=isNew;}
      show('[data-task-starter]',Boolean(theme));show('[data-ride-starter]',Boolean(location));if(!theme)form.elements.task.checked=false;if(!location)form.elements.ride.checked=false;
      show('[data-subtheme-help]',Boolean(sub.value));show('[data-location-help]',Boolean(list(km,'locations').find(item=>String(item.id)===location)?.parentId));show('[data-person-help]',Boolean(person));
    }
    for(const [type] of groups)form.elements[type].onchange=fields;fields();
    form.onsubmit=event=>{
      event.preventDefault();try{
        if(!form.elements.consent.checked)throw Error('Bevestig welke gegevens je wilt delen.');
        const entities=[],selected={},visiting=new Set(),add=(type,x)=>{
          const id=x.logCodeId||x.id;if(entities.some(e=>e.id===id))return id;if(visiting.has(id))throw Error('Cirkel in bestaande locatiekoppelingen.');visiting.add(id);
          const e={type,id,name:x.name};
          for(const k of type==='location'?['address','lat','lng']:type==='person'?['email','phone']:type==='theme'?['color']:[])if(x[k]!=null&&x[k]!=='')e[k]=x[k];
          if(type==='location'&&x.parentId){const parent=list(km,'locations').find(l=>l.id===x.parentId);if(!parent)throw Error('Hoofdlocatie niet beschikbaar.');e.parentId=add('location',parent);}
          if(type==='subtheme'){const parent=list(time,'themes').find(t=>t.id===x.themeId);if(!parent)throw Error('Hoofdthema niet beschikbaar.');e.themeId=add('theme',parent);}
          entities.push(e);visiting.delete(id);return id;
        };
        for(const [type,,items] of groups){
          const value=form.elements[type].value;if(form.elements[type].disabled||!value)continue;
          if(value==='new'){
            const e={type,id:crypto.randomUUID(),name:form.elements[type+'Name'].value.trim()};
            if(type==='subtheme'){if(!selected.theme)throw Error('Kies eerst een thema.');e.themeId=selected.theme;}
            if(type==='location')e.address=form.elements.address.value.trim();
            if(type==='person'){e.email=form.elements.email.value.trim();e.phone=form.elements.phone.value.trim();}
            entities.push(e);selected[type]=e.id;
          }else{const item=items.find(x=>String(x.id)===value);if(!item)throw Error('Selectie niet meer beschikbaar.');selected[type]=add(type,item);}
        }
        if(selected.subtheme){const parent=entities.find(e=>e.id===selected.subtheme).themeId;if(selected.theme&&selected.theme!==parent)throw Error('Subthema hoort bij een ander thema.');selected.theme=parent;}
        const actions=[];
        if(form.elements.task.checked){if(!selected.theme)throw Error('Kies een thema voor de taak.');actions.push({type:'task',themeId:selected.theme,subthemeId:selected.subtheme,locationId:selected.location});}
        if(form.elements.ride.checked){if(!selected.location)throw Error('Kies een bestemming voor de rit.');actions.push({type:'ride',locationId:selected.location});}
        const payload={kind:'log-code',version:1,title:form.elements.title.value.trim(),entities,actions},value=JSON.stringify(payload);parse(value);
        if(new TextEncoder().encode(value).length>1800)throw Error('Te veel gegevens voor een goed scanbare QR. Kort de inhoud in of maak meerdere codes.');
        panel.querySelector('[data-log-review]')?.remove();
        const review=document.createElement('section');review.dataset.logReview='1';
        const names={theme:'Thema',subtheme:'Subthema',location:'Locatie',person:'Persoon'};
        review.innerHTML='<h3>'+esc(payload.title)+'</h3><p>Deze gegevens komen in de QR:</p>'+payload.entities.map(e=>'<div class="log-code-row"><strong>'+esc(e.name)+'</strong><small>'+esc(names[e.type])+'</small><small>'+esc(details(e))+'</small></div>').join('')+
          '<h3>Starters</h3>'+(actions.length?actions.map(a=>'<p>'+esc(a.type==='task'?'Taak starten':'Rit voorbereiden')+' · '+esc(entities.find(e=>e.id===(a.type==='task'?(a.subthemeId||a.themeId):a.locationId))?.name)+(a.type==='task'&&a.locationId?' · '+esc(entities.find(e=>e.id===a.locationId)?.name):'')+'</p>').join(''):'<p>Geen starters · alleen gegevens delen.</p>')+
          '<button type="button" class="btn full" data-log-create>QR-kaart maken</button><button type="button" class="btn secondary full" data-log-back>Terug naar invoer</button>';
        form.hidden=true;form.style.display='none';panel.append(review);
        review.querySelector('[data-log-back]').onclick=()=>{review.remove();form.hidden=false;form.style.display='';};
        review.querySelector('[data-log-create]').onclick=()=>window.LogCardsUI.edit(null,{value,format:'QR_CODE',name:payload.title});
      }catch(error){panel.querySelector('[data-log-status]').textContent=error.message;}
    };
  }
  const kipThemes=[['KIP000000000','0 – Projectmanagement'],['KIP1a0000000','1a – Procesanalyse'],['KIP2b0000000','2b – API en gebruikersinterface'],['KIP2d0000000','2d – Systeemmodellen']];
  function configBuilder(){
    const time=read(TIME),themes=list(time,'themes');
    const panel=window.LogCardsUI.sheet('Thema-configuratie maken',`<form><label>Thema<select name="theme"><option value="">Nieuw thema</option>${kipThemes.map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('')}${themes.map((t,i)=>`<option value="local-${i}">Bestaand: ${esc(t.name)}</option>`).join('')}</select></label><label>Naam hoofdthema<input name="themeName" required maxlength="160"></label><label>Subthema’s (optioneel, één per regel)<textarea name="subs" rows="6"></textarea></label><p>Een hoofdthema kan altijd zonder subthema worden gebruikt. Bestaande gegevens blijven behouden; we voegen alleen ontbrekende gegevens en QR-koppelingen toe.</p><button class="btn full" type="submit">Configuratie controleren</button><p data-log-status role="status"></p></form>`);
    const form=panel.querySelector('form');let selected=null,preset=null;
    form.elements.theme.onchange=()=>{
      const value=form.elements.theme.value;preset=kipThemes.find(([id])=>id===value)||null;
      selected=value.startsWith('local-')?themes[Number(value.slice(6))]:themes.find(t=>t.logCodeId===preset?.[0]||t.name===preset?.[1]);
      form.elements.themeName.value=selected?.name||preset?.[1]||'';
      form.elements.subs.value=selected?list(time,'subthemes').filter(s=>s.themeId===selected.id).map(s=>s.name).join('\n'):'';
    };
    form.onsubmit=event=>{event.preventDefault();try{
      const name=form.elements.themeName.value.trim();if(!name)throw Error('Vul een hoofdthema in.');
      const entity=(type,item,name,id)=>{const code=item?.logCodeId||id||newCodeId();return {type,id:code,name:item?.name||name,...(item?.color?{color:item.color}:{}),taskCodeId:item?.taskCodeId||(taskIdPattern.test(code)?code:newCodeId())};};
      const existing=selected||themes.find(t=>t.name===name),theme=entity('theme',existing,name,preset?.[0]);
      const names=[...new Set(form.elements.subs.value.split('\n').map(s=>s.trim()).filter(Boolean))];
      const entities=[theme,...names.map(name=>({...entity('subtheme',list(time,'subthemes').find(s=>s.themeId===existing?.id&&s.name===name),name),themeId:theme.id}))];
      const payload=parse(JSON.stringify({kind:'log-code',version:1,title:theme.name.slice(0,80),entities,actions:[]}));
      const value=JSON.stringify(payload);if(new TextEncoder().encode(value).length>1800)throw Error('Te veel gegevens voor één QR. Verdeel de subthema’s over meerdere configuratiecodes voor hetzelfde thema.');
      const review=document.createElement('section');review.dataset.configReview='';review.innerHTML=`<h3>${esc(theme.name)}</h3>${names.length?'<ul>'+names.map(n=>`<li>${esc(n)}</li>`).join('')+'</ul>':'<p>Zonder subthema’s</p>'}<p>Bewaar deze configuratie in Log en maak de deelbare configuratie-QR. Daarna kun je compacte actie-QR’s maken.</p><button class="btn full" data-save-config>Configuratie bewaren en QR maken</button><button class="btn full" data-config-back>Terug</button><p data-config-status role="status"></p>`;
      panel.querySelector('[data-config-review]')?.remove();form.hidden=true;panel.append(review);
      review.querySelector('[data-config-back]').onclick=()=>{review.remove();form.hidden=false;};
      review.querySelector('[data-save-config]').onclick=()=>{try{commit(payload);window.LogCardsUI.edit(null,{value,format:'QR_CODE',name:'Configuratie · '+payload.title});}catch(error){review.querySelector('[data-config-status]').textContent=error.message;}};
    }catch(error){panel.querySelector('[data-log-status]').textContent=error.message;}};
  }
  function taskBuilder(){
    const time=read(TIME),themes=list(time,'themes');
    const panel=window.LogCardsUI.sheet('Compacte actie-QR maken',`<form><label>Hoofdthema<select name="theme" required><option value="">Kies een thema</option>${themes.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></label><label>Subthema (optioneel)<select name="sub"><option value="">Geen subthema</option></select></label><p>De QR bevat alleen een taak-ID van 12 tekens. Scan op een ander apparaat eerst de configuratie-QR.</p><button type="submit" class="btn full">Actie-QR maken</button><p data-log-status role="status"></p></form>`);
    const form=panel.querySelector('form');
    form.elements.theme.onchange=()=>{form.elements.sub.innerHTML='<option value="">Geen subthema</option>'+list(time,'subthemes').filter(s=>s.themeId===form.elements.theme.value).map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');};
    form.onsubmit=event=>{event.preventDefault();try{
      const fresh=read(TIME),theme=list(fresh,'themes').find(t=>t.id===form.elements.theme.value),sub=form.elements.sub.value?list(fresh,'subthemes').find(s=>s.id===form.elements.sub.value&&s.themeId===theme?.id):null;
      if(!theme||(form.elements.sub.value&&!sub))throw Error('Kies een geldig hoofdthema en eventueel subthema.');
      const item=sub||theme,id=item.taskCodeId||item.logCodeId;
      if(!taskIdPattern.test(id||''))throw Error('Bewaar eerst een thema-configuratie voor dit thema via Log-code maken.');
      resolveTask(id);
      window.LogCardsUI.edit(null,{value:JSON.stringify({kind:'log-task',version:1,id}),format:'QR_CODE',name:theme.name+(sub?' · '+sub.name:'')});
    }catch(error){panel.querySelector('[data-log-status]').textContent=error.message;}};
  }
  window.LogCode={parse,plan,commit,preview,builder,configBuilder,taskBuilder,resolveTask};
})();
