const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),KEY='urenregistratie.test.pwa.v1';
const dom=new JSDOM('<main id="root"></main><div id="toast"></div>',{url:'https://example.test/test/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,d=w.document,q=s=>d.querySelector(s),tick=()=>new Promise(r=>setTimeout(r,25));
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
const initial={colleagues:[{id:'old',name:'Bestaande collega',usageCount:4,logCodeId:'portable-1',email:'old@example.test'}],entries:[{id:'entry',allocations:[{colleagueId:'old',colleagueName:'Bestaande collega',minutes:30}]}],timer:{status:'active',startISO:'2026-09-25T09:00:00Z'},settings:{roundingUnitMinutes:15},themes:[],subthemes:[]};
w.localStorage.setItem(KEY,JSON.stringify(initial));w.localStorage.setItem('kmreg-test-shell-section-v1','people');
let reloads=0;w.LogTimeModule={reloadFromStorage(){reloads++}};
w.LogCardData={snapshot:()=>({cards:[],locations:[],settings:{}})};
for(const f of ['swipe-policy.js','removal-policy.js','time/removal-policy-ui.js','cards.js','people.js','shell-direct-actions.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
const api=w.LogPeopleModule,read=()=>JSON.parse(w.localStorage.getItem(KEY));
function submit(values){const form=q('form');for(const [key,value]of Object.entries(values))form.elements[key].value=value;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
async function swipe(id,dx){const target=q(`[data-person-open="${id}"]`);for(const [type,x]of [['pointerdown',250],['pointermove',250+dx],['pointerup',250+dx]]){const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:40,button:0});Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e)}await tick();}
(async()=>{
 api.mount(q('#root'));assert.equal(q('[data-person-self]')!==null,true);assert.ok(q('[data-person-open="old"]'));
 await swipe('old',-65);assert.ok(q('form'),'short swipe opens edit despite click suppression');
 submit({name:'Nieuwe naam',relationship:'Klant',organization:'Bedrijf',phone:'0612345678'});
 assert.equal(read().colleagues[0].logCodeId,'portable-1');assert.equal(read().colleagues[0].usageCount,4);assert.deepEqual(read().entries,initial.entries);assert.deepEqual(read().timer,initial.timer);assert.ok(reloads);
 q('[data-person-add]').click();submit({name:'<b>Nieuw</b>',relationship:'Familie',email:'new@example.test'});assert.equal(read().colleagues.length,2);assert.equal(q('.people-list b'),null,'names escaped');
 api.search('familie');assert.equal(d.querySelectorAll('.people-list [data-person-row]').length,1);api.search('');
 q('[data-person-open=""]').click();const select=q('[data-person-existing]');select.value='old';select.dispatchEvent(new w.Event('change'));submit({name:'Eigen naam',phone:'0600000000'});
 assert.equal(read().settings.selfPersonId,'old');assert.equal(read().colleagues.length,2,'existing self reused');assert.equal(q('.people-self [data-delete-colleague]'),null);assert.equal(q('.people-list [data-person-open="old"]'),null);
 assert.deepEqual(read().entries,initial.entries);
 const used=api.save('',{name:'Gebruikte persoon'});let raw=read();raw.entries.push({id:'e2',people:[{id:used.id,name:used.name}]});w.localStorage.setItem(KEY,JSON.stringify(raw));w.dispatchEvent(new w.Event('log-time-state-change'));
 assert.equal(w.LogTimeRemovalPolicy.colleaguePlan(used.id).action,'archive');await swipe(used.id,-160);assert.ok(!read().colleagues.some(p=>p.id===used.id));assert.equal(read().entries.length,2);assert.ok(q('[data-log-time-restore]'));
 q('[data-log-time-restore]').click();assert.ok(read().colleagues.some(p=>p.id===used.id));assert.equal(read().entries.length,2);
 raw=read();raw.settings.swipeDeleteEnabled=false;w.localStorage.setItem(KEY,JSON.stringify(raw));w.dispatchEvent(new w.Event('log-time-state-change'));assert.equal(q('[data-delete-colleague]'),null);await swipe(used.id,-160);assert.ok(q('form'),'far swipe edits when removal disabled');w.LogCardsUI.close();
 const original=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(){throw Error('Opslag vol')};assert.throws(()=>api.save(used.id,{name:'Verloren wijziging'}),/Opslag vol/);w.Storage.prototype.setItem=original;assert.equal(read().colleagues.find(p=>p.id===used.id).name,'Gebruikte persoon');
 api.unmount();assert.equal(q('dialog'),null);
 // Execute the actual settings renderer to catch obsolete event bindings.
 const time=fs.readFileSync(path.join(base,'time/app.js'),'utf8');const fn=time.slice(time.indexOf('function renderSettingsPage()'),time.indexOf('\nfunction exportBackup()'));
 w.eval(`const state={settings:{roundingUnitMinutes:15},colleagues:[]};const ROUNDING_UNITS=[15];const $=s=>document.querySelector(s);const displayMinutes=String,decimalHours=String;const settingsAccordion=(a,b,c)=>'<h2>'+a+'</h2>'+c;function resetAll(){};document.body.innerHTML='<main id="main"></main>';${fn};renderSettingsPage();`);
 assert.equal(q('#settingsAddColleague'),null);assert.doesNotMatch(q('#main').textContent,/Collega/);
 console.log('People: legacy IDs/history/timer preserved, profile reuse, editing, search, archive/restore, swipe policy, storage failure and settings passed.');
 await tick();dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
