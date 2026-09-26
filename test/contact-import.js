(function(){
  'use strict';
  const fields={name:'Naam',organization:'Organisatie',email:'E-mailadres',phone:'Telefoonnummer'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v??'').replace(/\u0000/g,'').trim();
  const unescape=v=>v.replace(/\\([nN,;\\])/g,(_,c)=>/[nN]/.test(c)?'\n':c);
  function parts(value){
    const result=[];let part='';
    for(let i=0;i<value.length;i++){
      if(value[i]==='\\'&&i+1<value.length){part+=value[i]+value[++i];continue;}
      if(value[i]===';'){result.push(unescape(part));part='';}else part+=value[i];
    }
    result.push(unescape(part));return result;
  }
  const emailKey=v=>clean(v).toLowerCase();
  const phoneKey=v=>clean(v).replace(/^tel:/i,'').replace(/[\s().-]/g,'').replace(/^00/,'+');
  function normalize(contact){
    const emails=[...new Set((contact.emails||[]).map(clean).filter(Boolean))].slice(0,20);
    const phones=[...new Set((contact.phones||[]).map(v=>clean(v).replace(/^tel:/i,'')).filter(Boolean))].slice(0,20);
    const value={name:clean(contact.name),organization:clean(contact.organization),emails,phones,uid:clean(contact.uid),type:contact.type==='picker'?'picker':'vcard'};
    if(!value.name&&!emails.length&&!phones.length&&!value.organization)throw Error('Dit contact bevat geen bruikbare naam of contactgegevens.');
    if(value.name.length>120||value.organization.length>200||value.uid.length>1024||[...emails,...phones].some(v=>v.length>200))throw Error('Een contactveld is te lang. Verkort dit in het contactbestand.');
    return value;
  }
  function parse(text){
    if(typeof text!=='string'||text.length>5*1024*1024)throw Error('Kies een contactbestand van maximaal 5 MB.');
    const lines=[];
    for(const line of text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n')){
      const last=lines.length-1;
      if(last>=0&&/;ENCODING=QUOTED-PRINTABLE[;:]/i.test(lines[last])&&lines[last].endsWith('='))lines[last]=lines[last].slice(0,-1)+line.replace(/^[ \t]/,'');
      else if(/^[ \t]/.test(line)&&last>=0)lines[last]+=line.slice(1);
      else lines.push(line);
    }
    const contacts=[];let card=null,version='';
    for(const line of lines){
      if(/^BEGIN:VCARD$/i.test(line.trim())){if(card)throw Error('Het contactbestand is onvolledig.');card={emails:[],phones:[],type:'vcard'};version='';continue;}
      if(/^END:VCARD$/i.test(line.trim())){if(!card)throw Error('Ongeldig contactbestand.');if(!['2.1','3.0','4.0'].includes(version))throw Error('Alleen vCard 2.1, 3.0 en 4.0 worden ondersteund.');contacts.push(normalize(card));card=null;if(contacts.length>100)throw Error('Dit bestand bevat te veel contacten. Exporteer één contact.');continue;}
      if(!card)continue;
      let quoted=false,colon=-1;for(let i=0;i<line.length;i++){if(line[i]==='"')quoted=!quoted;if(line[i]===':'&&!quoted){colon=i;break;}}
      if(colon<0)continue;
      const header=line.slice(0,colon),key=header.split(';')[0].split('.').pop().toUpperCase();let value=line.slice(colon+1);
      if(!['VERSION','FN','N','ORG','EMAIL','TEL','UID'].includes(key))continue;
      if(/;ENCODING=(?:B|BASE64)(?:;|$)/i.test(header))throw Error('Dit contact gebruikt een niet-ondersteunde tekstcodering. Exporteer het opnieuw als vCard.');
      if(/;ENCODING=QUOTED-PRINTABLE(?:;|$)/i.test(header)){
        const charset=(header.match(/;CHARSET="?([^;\"]+)/i)?.[1]||'utf-8').toLowerCase();
        if(!['utf-8','utf8','iso-8859-1','windows-1252','us-ascii'].includes(charset))throw Error('Deze tekencodering wordt niet ondersteund.');
        const bytes=[];for(let i=0;i<value.length;i++){if(value[i]==='='&&/^[\da-f]{2}$/i.test(value.slice(i+1,i+3))){bytes.push(parseInt(value.slice(i+1,i+3),16));i+=2;}else bytes.push(...new TextEncoder().encode(value[i]));}
        try{value=new TextDecoder(charset,{fatal:true}).decode(new Uint8Array(bytes));}catch(_){throw Error('De contacttekst kon niet worden gelezen.');}
      }
      if(key==='VERSION')version=value.trim();
      if(key==='FN')card.name=unescape(value);
      if(key==='N'&&!card.name){const n=parts(value);card.name=[n[3],n[1],n[2],n[0],n[4]].filter(Boolean).join(' ');}
      if(key==='ORG')card.organization=parts(value).filter(Boolean).join(' · ');
      if(key==='EMAIL')card.emails.push(unescape(value).replace(/^mailto:/i,''));
      if(key==='TEL')card.phones.push(unescape(value));
      if(key==='UID')card.uid=unescape(value);
    }
    if(card||!contacts.length)throw Error('Geen volledig vCard-contact gevonden. Kies een .vcf-bestand.');
    return contacts;
  }
  function candidates(contact,people){
    return people.filter(p=>(contact.uid&&p.contactSources?.some(s=>s.type==='vcard'&&s.uid===contact.uid))||
      (p.email&&contact.emails.some(e=>emailKey(e)===emailKey(p.email)))||
      (p.phone&&contact.phones.some(t=>phoneKey(t)===phoneKey(p.phone)))||
      (contact.name&&clean(p.name).toLocaleLowerCase('nl')===contact.name.toLocaleLowerCase('nl')));
  }
  function preview(input,{targetId='',self=false}={}){
    const contact=normalize(input),people=window.LogPeopleModule.read().colleagues;
    const matches=candidates(contact,people);
    if(targetId&&!people.some(p=>String(p.id)===String(targetId)))throw Error('Deze persoon bestaat niet meer. Open Personen opnieuw.');
    const d=window.LogCardsUI.sheet('Contact overnemen',`<p class="cards-notice">${esc(contact.name||contact.emails[0]||contact.phones[0]||contact.organization)}</p><p class="cards-notice">Je neemt één contact over. Wijzigingen op je telefoon worden niet automatisch bijgewerkt.</p>${matches.length?'<p class="contact-match">Mogelijk al aanwezig in Log. Kies de juiste persoon om dubbele kaarten te voorkomen.</p>':''}<form class="people-form"><label>Opslaan bij<select name="target" required><option value="">Kies een persoon of maak een nieuwe</option><option value="new">Nieuwe persoon</option>${people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${matches.includes(p)?' · overeenkomst':''}${p.id===window.LogPeopleModule.read().settings.selfPersonId?' · mijn gegevens':''}</option>`).join('')}</select></label><div data-contact-fields></div><button class="btn primary full" type="submit" disabled>Contact bewaren</button></form>`);
    const form=d.querySelector('form'),target=form.elements.target;let baseline=null;
    target.value=targetId||(!matches.length?'new':matches.length===1?matches[0].id:'');
    function draw(){
      const p=window.LogPeopleModule.read().colleagues.find(p=>String(p.id)===target.value);baseline=p?JSON.parse(JSON.stringify(p)):null;
      form.querySelector('button[type=submit]').disabled=!target.value;
      const values={name:contact.name,organization:contact.organization,email:contact.emails[0]||'',phone:contact.phones[0]||''};
      d.querySelector('[data-contact-fields]').innerHTML=Object.entries(fields).map(([key,label])=>{
        const options=key==='email'?contact.emails:key==='phone'?contact.phones:[];
        const value=values[key],old=p?.[key]||'';
        const control=options.length>1?`<select name="${key}">${options.map(v=>`<option>${esc(v)}</option>`).join('')}</select>`:`<input name="${key}" value="${esc(value)}" maxlength="${key==='name'?120:200}">`;
        return `<div class="contact-import-field"><label class="contact-use"><input type="checkbox" name="use_${key}"${value?' checked':''}><span>${label} overnemen</span></label>${control}${old?`<small>In Log: ${esc(old)}</small>`:''}</div>`;
      }).join('');
    }
    target.onchange=draw;draw();
    form.onsubmit=e=>{e.preventDefault();try{
      const id=target.value==='new'?'':target.value;if(!target.value)throw Error('Kies waar je dit contact wilt opslaan.');
      const raw=window.LogPeopleModule.read(),existing=raw.colleagues.find(p=>String(p.id)===id);
      if(id&&!existing)throw Error('Deze persoon is niet meer beschikbaar. Open de import opnieuw.');
      if(existing&&JSON.stringify(existing)!==JSON.stringify(baseline))throw Error('Deze persoon is intussen gewijzigd. Kies de persoon opnieuw om de actuele gegevens te bekijken.');
      const linked=contact.uid&&raw.colleagues.find(p=>p.contactSources?.some(s=>s.type==='vcard'&&s.uid===contact.uid)&&String(p.id)!==id);
      if(linked)throw Error(`Dit contactbestand is al gekoppeld aan ${linked.name}. Kies die persoon.`);
      const archived=contact.uid&&(window.LogTimeRemovalPolicy?.peopleArchiveRecords?.()||[]).find(r=>r.payload?.contactSources?.some(s=>s.type==='vcard'&&s.uid===contact.uid));
      if(archived)throw Error(`Dit contact hoort bij ${archived.payload.name} in het archief. Herstel die persoon eerst om dezelfde Log-ID te behouden.`);
      const values={...existing};for(const key of Object.keys(fields))if(form.elements['use_'+key].checked)values[key]=form.elements[key].value;
      if(!clean(values.name))throw Error('Vul een naam in en vink Naam overnemen aan.');
      window.LogPeopleModule.save(id,values,self,{type:contact.type,uid:contact.uid,importedAt:new Date().toISOString()});window.LogCardsUI.close();
    }catch(error){d.querySelector('[data-card-message]').textContent=error.message||'Contact bewaren is niet gelukt.';}};
    return d;
  }
  function choose(contacts,options){
    if(contacts.length===1)return preview(contacts[0],options);
    const d=window.LogCardsUI.sheet('Kies één contact',`<p class="cards-notice">Dit bestand bevat ${contacts.length} contacten. Alleen het contact dat je kiest wordt overgenomen.</p><label class="people-form">Contact<select data-contact-choice>${contacts.map((c,i)=>`<option value="${i}">${esc([c.name||c.organization,c.emails[0]||c.phones[0]].filter(Boolean).join(' · '))}</option>`).join('')}</select></label><button class="btn primary full" type="button" data-contact-next>Verder</button>`);
    d.querySelector('[data-contact-next]').onclick=()=>preview(contacts[Number(d.querySelector('select').value)],options);
  }
  function open(options={}){
    const supported=typeof navigator.contacts?.select==='function';
    const d=window.LogCardsUI.sheet('Contact toevoegen',`<div class="people-form">${supported?'<button class="btn primary full" type="button" data-contact-picker>Contact kiezen op telefoon</button>':''}<label>Contactbestand importeren<input type="file" accept=".vcf,.vcard,text/vcard,text/x-vcard" data-contact-file></label><p class="cards-notice">${supported?'Of importeer een contactbestand.':'De directe contactkiezer is in deze browser niet beschikbaar.'} Deel of exporteer één contact uit je Contacten-app als .vcf, sla het op in Bestanden en kies het hier. Je ziet eerst welke gegevens worden overgenomen.</p></div>`);
    const message=text=>{if(d.isConnected)d.querySelector('[data-card-message]').textContent=text;};
    let props=['name','email','tel'];
    if(supported&&navigator.contacts.getProperties){const b=d.querySelector('[data-contact-picker]');b.disabled=true;navigator.contacts.getProperties().then(available=>{props=props.filter(p=>available.includes(p));if(d.isConnected){b.disabled=!props.length;if(!props.length)b.hidden=true;}}).catch(()=>{if(d.isConnected)b.disabled=false;});}
    d.querySelector('[data-contact-picker]')?.addEventListener('click',async e=>{
      const button=e.currentTarget;button.disabled=true;message('');try{
        const results=await navigator.contacts.select(props,{multiple:false});
        if(!d.isConnected||!results?.length)return;
        const c=results[0];preview({name:c.name?.[0]||'',emails:c.email||[],phones:c.tel||[],type:'picker'},options);
      }catch(error){message(error.name==='AbortError'?'Geen contact gekozen.':'Contact kiezen is niet gelukt. Je kunt hieronder een contactbestand importeren.');}finally{if(d.isConnected)button.disabled=false;}
    });
    d.querySelector('[data-contact-file]').onchange=async e=>{
      const input=e.currentTarget,file=input.files?.[0];if(!file)return;message('');input.disabled=true;
      try{if(file.size>5*1024*1024)throw Error('Kies een contactbestand van maximaal 5 MB.');
        const bytes=new Uint8Array(await file.arrayBuffer());let text;
        try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch(_){text=new TextDecoder('windows-1252').decode(bytes);}
        const contacts=parse(text);if(d.isConnected)choose(contacts,options);
      }catch(error){message(error.message||'Het contactbestand kon niet worden gelezen.');}finally{input.value='';input.disabled=false;}
    };
  }
  window.LogContactImport={open,parse,preview,candidates};
})();
