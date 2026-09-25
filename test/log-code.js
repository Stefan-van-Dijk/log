(function(){
  'use strict';
  const KM='kmreg-test-v4-data', TIME='urenregistratie.test.pwa.v1';
  const types=['theme','subtheme','location','person'];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const read=key=>JSON.parse(localStorage.getItem(key)||'{}');
  const list=(raw,key)=>Array.isArray(raw[key])?raw[key]:[];
  const collection={theme:'themes',subtheme:'subthemes',location:'locations',person:'colleagues'};
  function parse(value){
    let p;try{p=JSON.parse(value);}catch(_){return null;}
    if(!p||p.kind!=='log-code')return null;
    if(value.length>4000||p.version!==1)throw Error('Deze Log-code is te groot of gebruikt een niet ondersteunde versie.');
    if(!Array.isArray(p.entities)||p.entities.length>20||!Array.isArray(p.actions)||p.actions.length>2)throw Error('Ongeldige Log-code.');
    const text=(v,max=160)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error('Ongeldige gegevens in Log-code.');return v;};
    const ids=new Set();
    const entities=p.entities.map(e=>{
      if(!e||!types.includes(e.type))throw Error('Onbekend soort gegevens.');
      const n={type:e.type,id:text(e.id,80),name:text(e.name)};
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
    const km=read(KM),time=read(TIME),map=new Map(),rows=[],remaining=[...payload.entities];
    while(remaining.length){
      const index=remaining.findIndex(e=>(!e.parentId||map.has(e.parentId))&&(!e.themeId||map.has(e.themeId)));
      if(index<0)throw Error('Onoplosbare verwijzingen.');
      const e=remaining.splice(index,1)[0],raw=e.type==='location'?km:time,key=collection[e.type];
      raw[key]=list(raw,key);const relation=e.parentId?{parentId:map.get(e.parentId)}:e.themeId?{themeId:map.get(e.themeId)}:{};
      const fields={...e,...relation};delete fields.type;delete fields.id;
      const exact=raw[key].find(x=>x.logCodeId===e.id||x.id===e.id);
      const candidates=exact?[exact]:raw[key].filter(x=>x.name===e.name&&Object.entries(fields).every(([k,v])=>String(x[k]??'')===String(v)));
      if(candidates.length>1)throw Error(`Meerdere bestaande vermeldingen voor “${e.name}”. Maak die eerst eenduidig.`);
      const found=candidates[0],changed=found&&Object.entries(fields).some(([k,v])=>String(found[k]??'')!==String(v));
      const id=found?.id||crypto.randomUUID();map.set(e.id,id);
      if(!found)raw[key].push({...fields,...(e.type==='location'?{type:'other',shareRide:'never',useCount:0}:{}),id,logCodeId:e.id,usageCount:0,createdAt:new Date().toISOString()});
      else if(!found.logCodeId)found.logCodeId=e.id;
      rows.push({entity:e,local:found||null,status:found?(changed?'Bestaand · lokale gegevens behouden':'Al aanwezig'):'Nieuw'});
    }
    return {km,time,map,rows};
  }
  function commit(payload){
    // Repeat planning at confirmation. Writes are idempotent; a failed second store
    // leaves imported references recoverable by retrying, never executes an action.
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
  function preview(payload){
    const ui=window.LogCardsUI,result=plan(payload);
    const panel=ui.sheet('Log-code herkennen',`<h3>${esc(payload.title)}</h3><p>Controleer deze gegevens. Bestaande waarden blijven behouden.</p>${result.rows.map(({entity:e,local,status})=>`<div class="log-code-row"><strong>${esc(e.name)}</strong><small>${esc({theme:'Thema',subtheme:'Subthema',location:'Locatie',person:'Persoon'}[e.type])} · ${esc(status)}</small><small>${esc(details(e))}</small>${local&&status.includes('lokale')?`<small>In Log: ${esc(local.name)} · ${esc(details(local))}</small>`:''}</div>`).join('')}<p>${payload.actions.length?'Na toevoegen kies je zelf een starter.':'Deze code is een informatiedrager zonder starter.'}</p><button class="btn full" data-import-code>Gegevens toevoegen / gebruiken</button><p data-log-status role="status"></p>`);
    panel.querySelector('[data-import-code]').onclick=()=>{
      try{const saved=commit(payload);ready(payload,saved);}catch(error){panel.querySelector('[data-log-status]').textContent=error.message;}
    };
  }
  function ready(payload,result){
    const panel=window.LogCardsUI.sheet(payload.title,`<p>Gegevens zijn beschikbaar in Log. Personen staan in de module Personen.</p>${payload.actions.map((a,i)=>`<button class="btn full cards-scan-action" data-code-starter="${i}">${a.type==='task'?'Taak starten':'Rit voorbereiden'} · ${esc(payload.entities.find(e=>e.id===(a.type==='task'?(a.subthemeId||a.themeId):a.locationId))?.name)}</button>`).join('')}<p class="cards-notice">Een taak start na aantikken. Bij een rit controleer je eerst vertrekpunt, kilometerstand en type rit.</p><p data-log-status role="status"></p>`);
    panel.querySelectorAll('[data-code-starter]').forEach(button=>button.onclick=async()=>{
      if(button.disabled)return;button.disabled=true;
      try{
        const a=payload.actions[Number(button.dataset.codeStarter)],current=plan(payload);
        // A deleted target must be reimported explicitly, never recreated by an action.
        if(current.rows.some(row=>row.status==='Nieuw'))throw Error('Gegevens zijn gewijzigd of verwijderd. Scan de code opnieuw.');
        const id=ref=>current.map.get(ref);
        const loc=list(read(KM),'locations').find(x=>x.id===id(a.locationId));
        if(a.type==='task'){
          window.LogTimeModule.startFromCard({themeId:id(a.themeId),subthemeId:id(a.subthemeId),locationName:loc?.name||''});
          window.LogCardsUI.close();window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section:'time'}}));
        }else{await window.LogRideStarter.prepare(id(a.locationId));window.LogCardsUI.close();}
      }catch(error){panel.querySelector('[data-log-status]').textContent=error.message;button.disabled=false;}
    });
  }
  function builder(){
    const km=read(KM),time=read(TIME),options=(items)=>'<option value="">Niet opnemen</option><option value="new">Nieuw invullen</option>'+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
    const groups=[['theme','Thema',list(time,'themes')],['subtheme','Subthema',list(time,'subthemes')],['location','Locatie',list(km,'locations')],['person','Persoon',list(time,'colleagues')]];
    const panel=window.LogCardsUI.sheet('Log-code maken',`<form data-log-builder><label>Titel<input name="title" maxlength="80" required></label>${groups.map(([type,label,items])=>`<div class="form-group"><label>${label}<select name="${type}">${options(items)}</select></label><div data-new="${type}" hidden><label>Naam<input name="${type}Name" maxlength="160"></label>${type==='location'?'<label>Adres<input name="address" maxlength="160"></label>':type==='person'?'<label>E-mail<input name="email" type="email" maxlength="160"></label><label>Telefoon<input name="phone" maxlength="80"></label>':''}</div></div>`).join('')}<label><input type="checkbox" name="task"> Starter: taak starten</label><label><input type="checkbox" name="ride"> Starter: rit voorbereiden</label><p>Een subthema hoort bij het gekozen thema. Bij bestaande sublocaties gaat de hoofdlocatie mee.</p><p>Iedereen die deze QR leest kan de opgenomen persoonsgegevens zien. Neem alleen gegevens op die je wilt delen.</p><label><input type="checkbox" name="consent" required> Ik wil deze gegevens in de code opnemen.</label><button class="btn full" type="submit">QR-kaart maken</button><p data-log-status role="status"></p></form>`);
    const form=panel.querySelector('form');
    for(const [type] of groups)form.elements[type].onchange=()=>{panel.querySelector(`[data-new="${type}"]`).hidden=form.elements[type].value!=='new';};
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
          const value=form.elements[type].value;if(!value)continue;
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
        window.LogCardsUI.edit(null,{value,format:'QR_CODE',name:payload.title});
      }catch(error){panel.querySelector('[data-log-status]').textContent=error.message;}
    };
  }
  window.LogCode={parse,plan,commit,preview,builder};
})();
