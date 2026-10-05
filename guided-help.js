(()=>{
'use strict';
const KEY='log-test-learning-v1';
const KM='kmreg-test-v4-data',TIME='urenregistratie.test.pwa.v1';
const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(_){return {}}};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const topics={
  rides:['Een rit bijhouden','Vertrek opent de voorbereiding. Je kiest het vertrekpunt en het type rit; bij aankomst controleer je de kilometerstand. GPS is een hulpmiddel, geen vereiste.','rides'],
  time:['Tijd en taken','Een thema is een soort werk, bijvoorbeeld Administratie. Voeg je eerste thema direct toe bij Taak registreren en start daarna je tijd.','time'],
  barcodes:['Kaarten bewaren','Bewaar bijvoorbeeld een klantenkaart: geef de kaart een herkenbare titel en vul de code in. Je kunt codes ook handmatig invoeren zonder camera.','barcodes'],
  locations:['Locaties gebruiken','Een naam zoals Thuis is genoeg om een vertrekplek te bewaren. Adres en GPS zijn optioneel. Adreszoeken stuurt je zoekvraag naar OpenStreetMap Nominatim.','locations'],
  themes:['Werk ordenen','Thema’s groeperen je werk. Een subthema maakt dat specifieker: bijvoorbeeld Project A → Overleg. Begin met één thema.','themes'],
  locationactions:['Acties ontdekken','Een actie is een voorstel bij een locatie, bijvoorbeeld een taak starten op kantoor. Controleer eerst de locatie, het doel en wanneer het voorstel mag verschijnen.','locationactions'],
  people:['Veilig delen','Een contact toevoegen deelt nog niet automatisch je registraties. Controleer vóór delen de ontvanger, inhoud en rechten. Deel verbindingscodes alleen privé; gebruik deze verbindingen nog niet voor gevoelige gegevens.','people'],
  backup:['Je gegevens bewaren','Registraties worden lokaal op dit apparaat bewaard. Maak via Instellingen → Gegevens een complete back-up. Een download is pas veilig als je het bestand echt hebt bewaard. De export bevat ook persoonlijke gegevens en toegangssleutels.',''],
  privacy:['Gegevens en privacy','Lokale gegevens kunnen verdwijnen als je browseropslag wist. GPS kan bij openen en handelingen worden gecontroleerd; handmatige invoer blijft mogelijk. Adreszoeken gebruikt Nominatim en navigatie opent een externe kaartenapp. Online back-up, publiceren en samenwerking gebruiken sharon.life. Een JSON-export is niet versleuteld; een online back-up wordt met je wachtwoord versleuteld. Intrekken kan een eerder opgeslagen kopie niet wissen.','']
};
let panel=null,dialog=null,returnFocus=null;
function state(){return read(KEY)}
function save(patch){try{localStorage.setItem(KEY,JSON.stringify({...state(),...patch}));}catch(_){/* Guidance must never block registration on full storage. */}}
function closeDialog(){if(!dialog)return;const current=dialog;dialog=null;if(current.open)current.close();current.remove();if(returnFocus?.isConnected)returnFocus.focus();}
function show(title,body){
  closeDialog();returnFocus=document.activeElement;
  dialog=document.createElement('dialog');dialog.className='log-guide-dialog';dialog.setAttribute('aria-labelledby','logGuideTitle');
  dialog.innerHTML=`<header><h2 id="logGuideTitle">${esc(title)}</h2><button type="button" data-guide-close aria-label="Hulp sluiten">×</button></header>${body}`;
  document.body.appendChild(dialog);dialog.querySelector('[data-guide-close]').onclick=closeDialog;
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});dialog.showModal();return dialog;
}
function go(section){closeDialog();panel?.remove();panel=null;if(section)window.dispatchEvent(new CustomEvent('kmreg-test-shell-select-section',{detail:{section}}));else window.dispatchEvent(new CustomEvent('kmreg-test-shell-open-settings'));}
function open(){
  const current=show('Hulp & ontdekken',`<p>Begin bij één doel. Andere mogelijkheden blijven bereikbaar via het menu.</p><div class="log-guide-list">${Object.entries(topics).map(([key,[title,text,section]])=>`<details><summary>${esc(title)}</summary><p>${esc(text)}</p>${key==='privacy'?'':`<button type="button" class="btn secondary" data-guide-go="${section}">Probeer</button>`}</details>`).join('')}</div><label class="log-guide-switch"><input type="checkbox" data-guide-enabled${state().enabled?' checked':''}> Geef mij tips tijdens het gebruik</label><p>Tips worden alleen op dit apparaat bewaard. Er wordt geen gebruiksanalyse verstuurd.</p><button type="button" class="btn secondary full" data-guide-reset>Tips opnieuw bekijken</button>`);
  current.querySelectorAll('[data-guide-go]').forEach(button=>button.onclick=()=>go(button.dataset.guideGo));
  current.querySelector('[data-guide-enabled]').onchange=event=>{save({enabled:event.target.checked});if(!event.target.checked){panel?.remove();panel=null;}};
  current.querySelector('[data-guide-reset]').onclick=()=>{save({seen:{},enabled:true});closeDialog();tip(localStorage.getItem('kmreg-test-shell-section-v1')||'rides');};
}
function tip(key){
  const s=state();if(!s.enabled||s.seen?.[key]||!topics[key]||dialog||document.body.classList.contains('editor-view'))return;
  panel?.remove();const [title,text,section]=topics[key];
  panel=document.createElement('aside');panel.className='log-guide-tip';panel.setAttribute('aria-label','Tip tijdens het gebruik');
  panel.innerHTML=`<strong>${esc(title)}</strong><p>${esc(text)}</p><div><button type="button" data-guide-try>Probeer</button><button type="button" data-guide-later>Later</button><button type="button" data-guide-never>Geen tips meer</button></div>`;
  const host=document.querySelector('.shell');if(!host)return;host.appendChild(panel);
  const dismiss=()=>{save({seen:{...(state().seen||{}),[key]:true}});panel?.remove();panel=null;};
  panel.querySelector('[data-guide-try]').onclick=()=>{dismiss();go(section);};
  panel.querySelector('[data-guide-later]').onclick=dismiss;
  panel.querySelector('[data-guide-never]').onclick=()=>{save({enabled:false});panel?.remove();panel=null;};
}
function welcome(){
  const current=show('Wat wil je met Log doen?',`<p>Begin klein. Je hoeft geen account of persoonsgegevens in te vullen om lokaal te registreren.</p><div class="log-guide-list"><button type="button" class="btn full" data-guide-start="rides">Ritten bijhouden</button><button type="button" class="btn full" data-guide-start="time">Tijd registreren</button><button type="button" class="btn full" data-guide-start="barcodes">Kaarten bewaren</button><button type="button" class="btn secondary full" data-guide-skip>Zelf ontdekken</button></div><p>Je gegevens staan op dit apparaat. Maak een back-up zodra je iets wilt bewaren. Hulp vind je later in het menu.</p>`);
  current.querySelectorAll('[data-guide-start]').forEach(button=>button.onclick=()=>{save({introduced:true,enabled:true});const section=button.dataset.guideStart;go(section);tip(section);});
  const skip=()=>{save({introduced:true,enabled:false});closeDialog();};current.querySelector('[data-guide-skip]').onclick=skip;
  current.querySelector('[data-guide-close]').onclick=skip;current.addEventListener('cancel',skip);
}
function afterRestore(){const current=show('Back-up hersteld','<p>Heropen Log om alle herstelde onderdelen opnieuw in te laden. Online rechten kunnen sinds deze back-up zijn veranderd.</p><button type="button" class="btn full" data-guide-reload>Log opnieuw openen</button>');current.querySelector('[data-guide-reload]').onclick=()=>location.reload();}
function init(){
  const style=document.createElement('style');style.textContent=`.log-guide-dialog{color:var(--text);background:var(--card,#fff);border:1px solid var(--line);border-radius:18px;width:min(92vw,520px);max-height:85dvh;overflow:auto;padding:20px}.log-guide-dialog::backdrop{background:#0007}.log-guide-dialog header{display:flex;align-items:center;justify-content:space-between;gap:12px}.log-guide-dialog h2{font-size:20px;margin:0}.log-guide-dialog header button{min-width:44px;min-height:44px;border:0;border-radius:10px;background:transparent;color:inherit;font-size:26px}.log-guide-list{display:grid;gap:12px;margin:16px 0}.log-guide-list details{border-bottom:1px solid var(--line);padding:10px 0}.log-guide-list summary{cursor:pointer;font-weight:650;min-height:32px}.log-guide-dialog p,.log-guide-tip p{font-size:14px;line-height:1.5}.log-guide-switch{display:flex;gap:10px;align-items:center}.log-guide-switch input{width:22px;height:22px}.log-guide-tip{padding:16px;margin:16px 12px;border:1px solid var(--line);border-radius:14px;background:var(--card)}.log-guide-tip div{display:flex;flex-wrap:wrap;gap:8px}.log-guide-tip button{min-height:44px;border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:var(--card);color:var(--text)}.log-guide-dialog button:focus-visible,.log-guide-tip button:focus-visible{outline:2px solid var(--accent);outline-offset:3px}`;document.head.appendChild(style);
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-log-help]'))open();});
  window.addEventListener('log-shell-view-refresh',event=>tip(event.detail?.section));
  const offerBackup=()=>{const km=read(KM),time=read(TIME);if((km.trips?.length||time.entries?.length)&&!km.settings?.lastBackupAt)tip('backup');};
  ['log-time-state-change','log-km-state-change'].forEach(name=>window.addEventListener(name,offerBackup));
  const km=read(KM),time=read(TIME);
  if(!state().introduced&&!km.trips?.length&&!km.locations?.length&&!km.cards?.length&&!km.activeTrip&&!time.entries?.length&&!time.themes?.length&&!time.colleagues?.length&&!km.settings?.lastBackupAt&&!km.settings?.name)welcome();
}
window.LogGuidedHelp={open,tip,afterRestore};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
