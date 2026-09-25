(function () {
  'use strict';
  const FORMATS = {QR_CODE:'QR-code', CODE128:'Barcode · Code 128', EAN13:'Barcode · EAN-13', EAN8:'Barcode · EAN-8', UPC:'Barcode · UPC-A', UPCE:'Barcode · UPC-E', CODE39:'Barcode · Code 39', ITF:'Barcode · ITF', codabar:'Barcode · Codabar'};
  const SCAN_FORMATS = {QR_CODE:'QR_CODE', CODE_128:'CODE128', EAN_13:'EAN13', EAN_8:'EAN8', UPC_A:'UPC', UPC_E:'UPCE', CODE_39:'CODE39', ITF:'ITF', CODABAR:'codabar'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const $ = (selector, scope = document) => scope.querySelector(selector);
  let root = null, dialog = null, stream = null, scanTimer = null, scanReader = null, session = 0, previewTimer = null;
  let filter = '', query = '', nearby = null, notice = '', lastSignature = '';
  const snapshot = () => window.LogCardData.snapshot();
  const records = () => (snapshot().cards || []).filter(card => card && typeof card.id === 'string' && typeof card.value === 'string');
  const locations = () => snapshot().locations || [];
  const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#489ff8';
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h3v3h-3z"/></svg>';

  function locationLabel(id, list = locations()) {
    if (!id) return 'Zonder locatie';
    const item = list.find(location => String(location.id) === String(id));
    if (!item) return 'Locatie niet meer beschikbaar';
    const parent = list.find(location => String(location.id) === String(item.parentId));
    return parent ? `${parent.name} › ${item.name}` : item.name;
  }
  function locationOptions(selected = '', all = false) {
    const list = locations().slice().sort((a,b) => locationLabel(a.id).localeCompare(locationLabel(b.id),'nl'));
    return (all ? '<option value="">Alle locaties</option><option value="unlinked">Zonder locatie</option>' : '<option value="">Geen locatie</option>') + list.map(item => `<option value="${esc(item.id)}"${String(item.id) === selected ? ' selected' : ''}>${esc(locationLabel(item.id))}</option>`).join('');
  }
  function related(card, selected, list = locations()) {
    if (!selected) return true;
    if (selected === 'unlinked') return !card.locationId;
    if (String(card.locationId) === selected) return true;
    const cardLocation = list.find(item => String(item.id) === String(card.locationId));
    const chosen = list.find(item => String(item.id) === selected);
    return String(cardLocation?.parentId || '') === selected || Boolean(chosen?.parentId && String(card.locationId) === String(chosen.parentId));
  }
  function distance(a, b) {
    const r = Math.PI/180, dlat=(b.lat-a.lat)*r, dlng=(b.lng-a.lng)*r;
    return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dlng/2)**2)));
  }
  function nearbyIds(position, list, radius) {
    const point={lat:position.coords.latitude,lng:position.coords.longitude};
    const ids = new Set();
    for (const item of list) {
      const parent=list.find(location => String(location.id)===String(item.parentId));
      const lat=item.lat ?? parent?.lat, lng=item.lng ?? parent?.lng;
      if (lat == null || lng == null || lat === '' || lng === '' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) continue;
      if (distance(point,{lat:Number(lat),lng:Number(lng)}) <= radius) { ids.add(String(item.id)); if (parent) ids.add(String(parent.id)); }
    }
    return ids;
  }
  function validate(card) {
    if (!String(card.name || '').trim()) throw new Error('Geef de kaart een titel.');
    if (!Object.hasOwn(FORMATS, card.format)) throw new Error('Kies een ondersteund codetype.');
    if (!card.value || !card.value.trim()) throw new Error('Vul de inhoud van de code in.');
    if (new TextEncoder().encode(card.value).length > 2000) throw new Error('Deze inhoud is te lang. Gebruik maximaal 2000 bytes voor een QR-code.');
    if (card.format !== 'QR_CODE' && (card.value.length > 80 || !/^[\x20-\x7e]+$/.test(card.value))) throw new Error('Gebruik voor deze barcode maximaal 80 gewone letters, cijfers of tekens. Kies QR-code voor andere inhoud.');
    if (card.format === 'CODE39' && card.value !== card.value.toUpperCase()) throw new Error('Code 39 gebruikt hoofdletters. Pas de inhoud aan of kies Code 128.');
    const lengths = {EAN13:13,EAN8:8,UPC:12,UPCE:8};
    if (lengths[card.format] && !new RegExp(`^\\d{${lengths[card.format]}}$`).test(card.value)) throw new Error(`Gebruik ${lengths[card.format]} cijfers, inclusief het controlecijfer.`);
    if (card.format === 'codabar' && !/^[A-D][0-9\-.$/+ :]+[A-D]$/.test(card.value)) throw new Error('Codabar moet beginnen en eindigen met A, B, C of D.');
  }
  function makeCode(card) {
    validate({...card,name:card.name || 'Voorbeeld'});
    if (card.format === 'QR_CODE') {
      const qr = window.qrcode(0,'M');
      window.qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));
      qr.addData(card.value,'Byte'); qr.make();
      const holder=document.createElement('div');
      holder.innerHTML=qr.createSvgTag({cellSize:4,margin:16,scalable:true});
      const svg=holder.firstElementChild; svg.setAttribute('aria-label','QR-code'); svg.setAttribute('role','img');
      return svg;
    }
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    try { window.JsBarcode(svg,card.value,{format:card.format,width:2,height:100,margin:20,displayValue:false,background:'#fff',lineColor:'#000'}); }
    catch (_) { throw new Error('Deze inhoud past niet bij dit codetype. Controleer de tekens en het controlecijfer.'); }
    svg.setAttribute('viewBox',`0 0 ${parseFloat(svg.getAttribute('width'))} ${parseFloat(svg.getAttribute('height'))}`);
    svg.setAttribute('aria-label',FORMATS[card.format]);svg.setAttribute('role','img');return svg;
  }
  function renderCode(host, card) {
    host.replaceChildren(makeCode(card));host.classList.toggle('is-qr',card.format === 'QR_CODE');
  }
  function visibleCards() {
    const list=locations(), ids=nearby && Date.now()-nearby.time<300000 ? nearby.ids : new Set();
    return records().filter(card => related(card,filter,list) && (!query || `${card.name} ${card.value} ${locationLabel(card.locationId,list)}`.toLocaleLowerCase('nl').includes(query)))
      .sort((a,b) => Number(ids.has(String(b.locationId)))-Number(ids.has(String(a.locationId))) || String(a.name).localeCompare(String(b.name),'nl'));
  }
  function renderList() {
    if (!root) return 0;
    const list=visibleCards(), host=$('[data-cards-list]',root); if (!host) return 0;
    const markup=list.map(card => `<div class="code-card-swipe" style="--card-color:${color(card.color)};--card-action-count:${window.LogSwipePolicy?.enabled('cards')===false?1:2}"><div class="code-card-actions" inert aria-hidden="true">${window.LogSwipePolicy?.enabled('cards')===false?'':`<button type="button" data-card-delete="${esc(card.id)}">Verwijder</button>`}<button type="button" data-card-edit="${esc(card.id)}">Bewerk</button></div><div class="code-card-surface"><button type="button" class="code-card" data-card-open="${esc(card.id)}"><span class="code-card-icon">${icon}</span><span class="code-card-copy"><strong>${esc(card.name || 'Kaart')}</strong><small>${esc(locationLabel(card.locationId))}</small>${nearby?.ids.has(String(card.locationId))?'<span>In de buurt</span>':''}</span><span class="code-card-open-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 10h4M7 14h2m5-4v4m3-4v4"/></svg></span></button></div></div>`).join('') || `<div class="cards-empty">${records().length ? 'Geen kaarten voor deze selectie.' : 'Je eerste kaart toevoegen'}<small>${records().length ? 'Kies een andere locatie of zoekterm.' : 'Scan een code of voer de inhoud zelf in. Koppel de kaart aan een locatie om deze snel terug te vinden.'}</small></div>`;
    if(host._cardsMarkup!==markup){host.innerHTML=markup;host._cardsMarkup=markup;}
    const status=$('[data-cards-notice]',root);if(status.textContent!==notice)status.textContent=notice;
    return list.length;
  }
  function mount(target) {
    if (root === target && $('[data-cards-list]',target)) return;
    root=target;lastSignature='';
    root.innerHTML=`<section class="cards-module"><div class="cards-actions"><button type="button" class="btn" data-cards-scan>${icon}<span>Code scannen</span></button><button type="button" class="btn secondary" data-cards-new>＋ Nieuwe kaart</button></div><button type="button" class="btn secondary full cards-log-create" data-cards-log>＋ Log-QR met gegevens en starters</button><div class="cards-filter"><label><span>Locatie</span><select data-cards-location>${locationOptions(filter,true)}</select></label><button type="button" data-cards-near>◎ In de buurt</button></div><p class="cards-notice" data-cards-notice role="status"></p><div data-cards-list></div></section>`;
    $('[data-cards-location]',root).value=filter;
    root.onclick=event=>{const b=event.target.closest('button');if(!b)return;const row=b.closest('.code-card-swipe');if(row && b.dataset.cardOpen && Date.now()<Number(row.dataset.suppressUntil||0)){event.preventDefault();return;}if(b.hasAttribute('data-cards-log'))window.LogCode.builder();if(b.hasAttribute('data-cards-new'))edit();if(b.hasAttribute('data-cards-scan'))scanner();if(b.hasAttribute('data-cards-near'))findNearby();if(b.dataset.cardEdit){setSwipe(row,false);edit(b.dataset.cardEdit);}if(b.dataset.cardDelete)removeCard(b.dataset.cardDelete);if(b.dataset.cardOpen){if(row?.classList.contains('actions-open'))setSwipe(row,false);else show(b.dataset.cardOpen)}};
    $('[data-cards-location]',root).onchange=event=>{filter=event.target.value;renderList()};
    renderList();
  }
  function setSwipe(row,open) {
    if(!row)return;
    if(open)root?.querySelectorAll('.code-card-swipe.actions-open').forEach(other=>{if(other!==row)setSwipe(other,false)});
    row.classList.toggle('actions-open',open);
    const width=(window.LogSwipePolicy?.actionWidth() || 84)*$('.code-card-actions',row).children.length;
    $('.code-card-surface',row).style.transform=open?`translateX(-${width}px)`:'';
    $('.code-card-actions',row).toggleAttribute('inert',!open);
    $('.code-card-actions',row).setAttribute('aria-hidden',String(!open));

  }
  function removeCard(id) {
    if(window.LogSwipePolicy?.enabled('cards')===false)return;
    const card=records().find(item=>item.id===id);if(!card||!confirm(`Kaart “${card.name}” verwijderen?`))return;
    try{window.LogCardData.save(records().filter(item=>item.id!==id));notice='Kaart verwijderd.';refresh();}
    catch(_){notice='Verwijderen is niet gelukt. De kaart is behouden.';renderList();}
  }
  function refresh() {
    if (!root) return;
    const signature=JSON.stringify([records(),locations(),window.LogSwipePolicy?.enabled('cards')]);if(signature===lastSignature)return;lastSignature=signature;
    const select=$('[data-cards-location]',root);if(select){select.innerHTML=locationOptions(filter,true);if(filter && filter!=='unlinked' && !locations().some(l=>String(l.id)===filter))filter='';select.value=filter;}
    renderList();
  }
  function message(text) { const host=dialog?.querySelector('[data-card-message]');if(host)host.textContent=text; }
  function stopScanner() {
    session++;clearTimeout(scanTimer);scanTimer=null;
    if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
    scanReader?.reset();scanReader=null;
    const video=dialog?.querySelector('video');if(video){video.pause();video.srcObject=null;}
  }
  function close() {
    stopScanner();clearTimeout(previewTimer);
    if(dialog){dialog.close();dialog.remove();dialog=null;}
    document.body.classList.remove('cards-dialog-open');
  }
  function sheet(title, content) {
    close();dialog=document.createElement('dialog');dialog.className='cards-dialog';dialog.setAttribute('aria-labelledby','cardsDialogTitle');
    dialog.innerHTML=`<header><h2 id="cardsDialogTitle">${esc(title)}</h2><button type="button" data-card-close aria-label="Sluiten">×</button></header><div class="cards-dialog-body">${content}<p class="cards-message" data-card-message role="status"></p></div>`;
    document.body.append(dialog);$('[data-card-close]',dialog).onclick=close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close()});dialog.addEventListener('click',event=>{if(event.target===dialog)close()});
    document.body.classList.add('cards-dialog-open');dialog.showModal();return dialog;
  }
  function actionCatalog() { return window.LogTimeModule?.getThemeCatalog?.() || {themes:[],subthemes:[]}; }
  function actionEditor(card) {
    const action=card.scanAction || {}, catalog=actionCatalog();
    const options=(items,selected)=>items.map(item=>`<option value="${esc(item.id)}"${item.id===selected?' selected':''}>${esc(item.name)}</option>`).join('');
    return `<details class="cards-content-details"${action.type?' open':''}><summary>Acties na scannen</summary><label for="cardAction">Voorkeursactie</label><select id="cardAction" name="actionType"><option value="">Alleen kaart tonen</option><option value="location"${action.type==='location'?' selected':''}>Locatie openen</option><option value="task"${action.type==='task'?' selected':''}>Taak starten</option></select><p data-action-location>Gebruikt de locatie of sublocatie van deze kaart.</p><div data-action-task><label for="cardActionTheme">Thema</label><select id="cardActionTheme" name="actionTheme"><option value="">Kies een thema</option>${options(catalog.themes,action.themeId)}</select><label for="cardActionSubtheme">Subthema</label><select id="cardActionSubtheme" name="actionSubtheme"><option value="">Geen subthema</option>${options(catalog.subthemes.filter(item=>item.themeId===action.themeId),action.subthemeId)}</select><p>Na scannen bevestig je de start. Een lopende taak blijft behouden.</p></div></details>`;
  }
  function validateAction(card) {
    const action=card.scanAction;if(!action)return;
    if(!['location','task'].includes(action.type))throw Error('Kies een geldige scanactie.');
    if((action.type==='location'||card.locationId)&&!locations().some(item=>String(item.id)===String(card.locationId)))throw Error('Kies een beschikbare locatie voor deze actie.');
    if(action.type==='task'){
      const catalog=actionCatalog();
      if(!catalog.themes.some(item=>item.id===action.themeId))throw Error('Kies een beschikbaar thema voor deze actie.');
      if(action.subthemeId&&!catalog.subthemes.some(item=>item.id===action.subthemeId&&item.themeId===action.themeId))throw Error('Kies een beschikbaar subthema voor deze actie.');
    }
  }
  function actionLabel(card) {
    const action=card.scanAction;if(!action)return '';
    if(action.type==='location')return `Open ${locationLabel(card.locationId)}`;
    if(action.type!=='task')return '';
    const catalog=actionCatalog(),theme=catalog.themes.find(item=>item.id===action.themeId),sub=catalog.subthemes.find(item=>item.id===action.subthemeId);
    return `Start ${sub?.name || theme?.name || 'taak'}${card.locationId?' bij '+locationLabel(card.locationId):''}`;
  }
  function runAction(id) {
    const card=records().find(item=>item.id===id);if(!card)return message('Deze kaart is niet meer beschikbaar.');
    try {
      validateAction(card);
      if(card.scanAction?.type==='location'){
        if(!window.LogCardActions?.openLocation(card.locationId))throw Error('Locatie kan nu niet worden geopend.');
      } else if(card.scanAction?.type==='task'){
        if(!window.LogTimeModule?.startFromCard)throw Error('Tijd/Taken is niet beschikbaar.');
        window.LogTimeModule.startFromCard({...card.scanAction,locationName:card.locationId?locationLabel(card.locationId):''});
        close();window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section:'time'}}));
      }
    }catch(error){message(error.message || 'De actie kon niet worden uitgevoerd.');}
  }
  function edit(id = null, scanned = null) {
    const stored=id?records().find(card=>card.id===id):null;if(id&&!stored)return;
    const card=stored || {name:scanned?.name || (scanned?'Gescande kaart':''),value:scanned?.value || '',format:scanned?.format || 'QR_CODE',locationId:filter !== 'unlinked'?filter:''};
    const panel=sheet(id?'Kaart bewerken':'Nieuwe kaart',`<form id="cardForm"><div class="form-group"><label for="cardName">Titel</label><input id="cardName" name="name" maxlength="80" required value="${esc(card.name)}" placeholder="Bijvoorbeeld toegangspas of klantenkaart"></div><div class="form-group cards-color-field"><label for="cardColor">Kleur</label><input type="color" id="cardColor" name="color" value="${color(card.color)}"></div><div class="form-group"><label for="cardFormat">Codetype</label><select id="cardFormat" name="format">${Object.entries(FORMATS).map(([key,label])=>`<option value="${key}"${key===card.format?' selected':''}>${label}</option>`).join('')}</select></div><div class="form-group"><label for="cardValue">Inhoud</label><textarea id="cardValue" name="value" required maxlength="2000" spellcheck="false" autocapitalize="off">${esc(card.value)}</textarea><small>De inhoud blijft exact bewaard, ook voorloopnullen.</small></div><div class="form-group"><label for="cardLocation">Locatie of sublocatie</label><select id="cardLocation" name="locationId">${locationOptions(String(card.locationId || ''))}${card.locationId&&!locations().some(l=>String(l.id)===String(card.locationId))?`<option value="${esc(card.locationId)}" selected>Locatie niet meer beschikbaar</option>`:''}</select></div>${actionEditor(card)}<div class="code-surface cards-preview" data-card-preview hidden></div><p class="cards-preview-error" data-preview-error></p><button class="btn full" type="submit">Kaart opslaan</button></form>`);
    const form=$('form',panel);
    const values=()=>({name:form.elements.name.value.trim(),color:color(form.elements.color.value),value:form.elements.value.value,format:form.elements.format.value,locationId:form.elements.locationId.value || null,scanAction:form.elements.actionType.value?{type:form.elements.actionType.value,...(form.elements.actionType.value==='task'?{themeId:form.elements.actionTheme.value,subthemeId:form.elements.actionSubtheme.value || null}:{})}:null});
    const syncAction=()=>{$('[data-action-task]',form).hidden=form.elements.actionType.value!=='task';$('[data-action-location]',form).hidden=!form.elements.actionType.value;};
    form.elements.actionType.onchange=syncAction;syncAction();
    form.elements.actionTheme.onchange=()=>{form.elements.actionSubtheme.innerHTML='<option value="">Geen subthema</option>'+actionCatalog().subthemes.filter(item=>item.themeId===form.elements.actionTheme.value).map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');};
    const preview=()=>{if(dialog!==panel)return;const host=$('[data-card-preview]',panel);host.hidden=true;$('[data-preview-error]',panel).textContent='';if(!values().value)return;try{renderCode(host,values());host.hidden=false}catch(error){$('[data-preview-error]',panel).textContent=error.message || 'Deze inhoud kan niet als code worden weergegeven.'}};
    form.addEventListener('input',()=>{clearTimeout(previewTimer);previewTimer=setTimeout(preview,180)});form.addEventListener('change',preview);preview();
    if(scanned)message('Code gelezen. Kies een titel, kleur en eventueel een locatie en sla de kaart op.');
    form.onsubmit=event=>{event.preventDefault();try{
      const fields=values();validate(fields);makeCode(fields);validateAction(fields);
      const next={...stored,...fields,id:stored?.id || crypto.randomUUID(),createdAt:stored?.createdAt || new Date().toISOString(),updatedAt:new Date().toISOString()};
      const cards=records();const duplicate=cards.find(item=>item.id!==next.id && item.format===next.format && item.value===next.value && String(item.locationId||'')===String(next.locationId||''));
      if(duplicate){message(`Deze code staat voor deze locatie al opgeslagen als “${duplicate.name}”.`);return;}
      const index=cards.findIndex(item=>item.id===next.id);if(index>=0)cards[index]=next;else cards.push(next);
      window.LogCardData.save(cards);notice='Kaart opgeslagen.';refresh();show(next.id);
    }catch(error){message(error.message || 'Opslaan is niet gelukt. Je invoer blijft staan.')}};
  }
  function show(id, recognized = false) {
    const card=records().find(item=>item.id===id);if(!card)return;
    const panel=sheet(card.name,`${recognized?'<p class="cards-recognized" role="status">✓ Code herkend · bestaande kaart</p>':''}<p class="cards-location-label">${esc(locationLabel(card.locationId))}</p><div class="code-surface" data-code-display></div><details class="cards-content-details"><summary>Inhoud bekijken</summary><pre class="cards-value">${esc(card.value)}</pre><button type="button" class="btn secondary full" data-card-copy>Inhoud kopiëren</button></details>${recognized&&actionLabel(card)?`<button type="button" class="btn full cards-scan-action" data-run-card-action>${esc(actionLabel(card))}</button>${card.scanAction.type==='task'?'<p class="cards-notice">De taak start pas als je op deze knop tikt.</p>':''}`:''}`);
    $('[data-run-card-action]',panel)?.addEventListener('click',()=>runAction(id));
    panel.style.setProperty('--card-color',color(card.color));
    panel.classList.add('cards-display');
    try{const payload=window.LogCode?.parse(card.value);if(payload){const button=document.createElement('button');button.type='button';button.className='btn full cards-scan-action';button.textContent='Gegevens en starters openen';button.onclick=()=>{try{window.LogCode.preview(payload)}catch(error){message(error.message)}};$('.cards-dialog-body',panel).appendChild(button);}}catch(error){message(error.message);}
    try{renderCode($('[data-code-display]',panel),card)}catch(error){message(error.message || 'Code kan niet worden weergegeven. De inhoud is nog beschikbaar.')}
    $('[data-card-copy]',panel).onclick=async()=>{try{await navigator.clipboard.writeText(card.value);if(dialog===panel)message('Inhoud gekopieerd.')}catch(_){if(dialog===panel)message('Kopiëren is niet gelukt. Selecteer de inhoud hierboven om deze te kopiëren.')}};
  }
  function reader() {
    const hints=new Map();hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS,Object.keys(SCAN_FORMATS).map(key=>window.ZXing.BarcodeFormat[key]));
    hints.set(window.ZXing.DecodeHintType.TRY_HARDER,true);
    hints.set(window.ZXing.DecodeHintType.RETURN_CODABAR_START_END,true);
    return new window.ZXing.BrowserMultiFormatReader(hints);
  }
  function accept(result) {
    const format=SCAN_FORMATS[window.ZXing.BarcodeFormat[result.getBarcodeFormat()]],value=result.getText();
    if(!format){message('Dit codetype wordt nog niet ondersteund.');return;}
    if(!value){message('De code bevat geen leesbare inhoud.');return;}
    try{const payload=window.LogCode?.parse(value);if(payload){window.LogCode.preview(payload);return;}}catch(error){sheet('Log-code niet geopend',`<p>${esc(error.message)}</p>`);return;}
    const matches=records().filter(card=>card.value===value);
    if(matches.length===1){show(matches[0].id,true);return;}
    if(matches.length>1){
      const panel=sheet('Code herkend',`<p>Deze inhoud hoort bij meerdere kaarten. Kies de juiste kaart.</p>${matches.map(card=>`<button type="button" class="btn secondary full cards-scan-choice" data-recognized-card="${esc(card.id)}">${esc(card.name)}<small>${esc(locationLabel(card.locationId))}</small></button>`).join('')}`);
      panel.querySelectorAll('[data-recognized-card]').forEach(button=>button.onclick=()=>show(button.dataset.recognizedCard,true));return;
    }
    edit(null,{value,format});
  }
  function decodeFrame(video, canvas, decoder) {
    // iOS may report playable video before dimensions arrive. Never cache a zero-sized frame.
    if(video.readyState<2 || !video.videoWidth || !video.videoHeight)return null;
    const scale=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
    const width=Math.round(video.videoWidth*scale),height=Math.round(video.videoHeight*scale);
    if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;}
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('Camera frame unavailable');
    context.drawImage(video,0,0,width,height);
    const source=new window.ZXing.HTMLCanvasElementLuminanceSource(canvas);
    return decoder.decodeBitmap(new window.ZXing.BinaryBitmap(new window.ZXing.HybridBinarizer(source)));
  }
  function scanner() {
    const panel=sheet('Code scannen',`<p>Richt de camera op een QR-code of barcode.</p><video class="cards-video" playsinline muted autoplay></video><button type="button" class="btn full" data-camera-start>Camera starten</button><label class="cards-photo btn secondary">Code uit foto lezen<input type="file" accept="image/*" data-card-photo></label><button type="button" class="cards-link" data-manual>Zelf inhoud invoeren</button>`);
    $('[data-manual]',panel).onclick=()=>edit();
    const start=$('[data-camera-start]',panel);
    start.onclick=async()=>{
      if(start.disabled)return;
      stopScanner();const token=session;start.disabled=true;message('Camera wordt geopend…');
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('camera-unavailable');
        const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
        if(token!==session || dialog!==panel){media.getTracks().forEach(track=>track.stop());return;}
        stream=media;const video=$('video',panel);video.muted=true;video.playsInline=true;video.srcObject=media;await video.play();
        if(token!==session || dialog!==panel)return;
        scanReader=reader();message('Houd de code rustig en volledig in beeld.');start.textContent='Camera actief';
        const canvas=document.createElement('canvas'),started=Date.now();let failures=0;
        const scan=()=>{
          if(token!==session || dialog!==panel)return;
          try{
            const result=decodeFrame(video,canvas,scanReader);
            if(result){accept(result);return;}
            if(Date.now()-started>10000 && (!video.videoWidth || !video.videoHeight || video.readyState<2))throw new Error('No camera frames');
          }catch(error){
            const expected=error instanceof window.ZXing.NotFoundException || error instanceof window.ZXing.ChecksumException || error instanceof window.ZXing.FormatException;
            if(!expected){
              failures++;
              if(failures>=3){console.warn('Kaarten: camera kon niet worden uitgelezen.',error);stopScanner();start.disabled=false;start.textContent='Camera opnieuw starten';message('Het camerabeeld kan niet worden gelezen. Start de camera opnieuw of kies een foto.');return;}
            }else failures=0;
            if(expected && Date.now()-started>8000)message('Nog geen code herkend. Houd de volledige code scherp in beeld, probeer iets meer afstand of kies een foto.');
          }
          scanTimer=setTimeout(scan,200);
        };scan();
      }catch(error){if(token!==session || dialog!==panel)return;stopScanner();start.disabled=false;start.textContent='Camera opnieuw starten';message(error.name==='NotAllowedError'?'Geef toestemming voor de camera, of kies een foto.':'De camera kan niet worden geopend. Probeer opnieuw of kies een foto.');}
    };
    $('[data-card-photo]',panel).onchange=async event=>{
      const file=event.target.files?.[0];if(!file)return;stopScanner();const token=session;start.disabled=false;start.textContent='Camera starten';message('Foto lezen…');
      const url=URL.createObjectURL(file),decoder=reader();
      try{const result=await decoder.decodeFromImageUrl(url);if(token===session && dialog===panel)accept(result)}catch(_){if(token===session && dialog===panel)message('Geen ondersteunde code gevonden. Kies een scherpe foto met de volledige code.')}finally{URL.revokeObjectURL(url);decoder.reset();event.target.value=''}
    };
    start.click();
  }
  function findNearby() {
    if(!navigator.geolocation){notice='Locatiebepaling is niet beschikbaar. Kies zelf een locatie.';renderList();return;}
    const target=root,button=$('[data-cards-near]',root);button.disabled=true;notice='Locatie bepalen…';renderList();
    navigator.geolocation.getCurrentPosition(position=>{
      if(root!==target)return;button.disabled=false;
      const radius=Math.max(25,Number(snapshot().settings.recognitionRadius)||500);
      nearby={ids:nearbyIds(position,locations(),radius),time:Date.now()};filter='';$('[data-cards-location]',root).value='';
      const count=records().filter(card=>nearby.ids.has(String(card.locationId))).length;
      notice=count?`${count} ${count===1?'kaart past':'kaarten passen'} bij locaties in de buurt · bovenaan gezet.`:'Geen gekoppelde kaarten in de buurt. Alle kaarten blijven beschikbaar.';renderList();
    },()=>{if(root!==target)return;button.disabled=false;notice='Locatie niet beschikbaar. Kies zelf een locatie.';renderList()}, {enableHighAccuracy:true,timeout:10000,maximumAge:30000});
  }
  window.LogCardsUI={sheet,close,edit};
  window.LogCardsModule={mount,closeSwipe:row=>setSwipe(row,false),unmount(){if(root){close();root=null;}},search(value){query=String(value||'').toLocaleLowerCase('nl');return renderList()},refresh};
  window.addEventListener('log-km-state-change',refresh);
  window.addEventListener('storage',event=>{if(event.key==='kmreg-test-v4-data')refresh()});
  window.addEventListener('pagehide',stopScanner);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopScanner();const button=dialog?.querySelector('[data-camera-start]');if(button){button.disabled=false;button.textContent='Camera hervatten';message('Camera gepauzeerd. Tik om verder te scannen.')}}});
})();
