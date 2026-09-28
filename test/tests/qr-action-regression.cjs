const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),TIME='urenregistratie.test.pwa.v1',KM='kmreg-test-v4-data';
const dom=new JSDOM('<body><main id="root"></main></body>',{url:'https://example.test/test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
w.TextEncoder=TextEncoder;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
const get=k=>JSON.parse(w.localStorage.getItem(k)||'{}'),set=(k,v)=>w.localStorage.setItem(k,JSON.stringify(v));
set(TIME,{themes:[{id:'t',name:'Thema'}],subthemes:[{id:'s',themeId:'t',name:'Subthema'}],entries:[{id:'keep',note:'Historie'}],timer:{status:'active',sessionId:'keep'},settings:{custom:true}});
set(KM,{locations:[{id:'dest',name:'Bestemming'}],cards:[{id:'card',name:'Pas',value:'012345678901',format:'UPC',color:'#123456'}],trips:[{id:'keep-trip'}]});
let prepared=null,ride=null,shown=null;
w.LogModuleVisibility={enabled:()=>true};w.LogTimeModule={reloadFromStorage(){},prepareFromCode(a){prepared=a},getView:()=> 'home',suggestForAction:()=>({themeId:'t',subthemeId:''})};w.LogRideStarter={async prepare(id){ride=id}};
w.LogCardData={snapshot:()=>get(KM),save(cards){const raw=get(KM);raw.cards=cards;set(KM,raw)}};
for(const file of ['vendor/qrcode-2.0.4.js','vendor/jsbarcode-3.12.1.min.js','vendor/zxing-0.21.3.min.js','log-code.js','cards.js','location-actions.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8').replace('window.LogCardsModule={','window.LogCardsModule={accept,'));
const api=w.LogLocationActions,code=w.LogCode,q=s=>d.querySelector(s),submit=()=>q('form').dispatchEvent(new w.Event('submit',{cancelable:true}));
const scan=(id,format=w.ZXing.BarcodeFormat.QR_CODE)=>w.LogCardsModule.accept({getText:()=>id,getBarcodeFormat:()=>format});
(async()=>{
 api.edit();let f=q('form');f.elements.name.value='Activiteit';f.elements.trigger.value='qr';f.elements.trigger.onchange();f.elements.type.value='task';f.elements.type.onchange();f.elements.targetId.value='t';f.elements.targetId.onchange();
 assert.equal(f.elements.locationId.disabled,true);assert.equal(f.elements.radius.required,false);assert.equal(f.elements.repeatMode.disabled,true);const id=f.elements.logCodeId.value;assert.match(id,/^[A-Za-z0-9_-]{12}$/);submit();
 let rule=get(TIME).locationActions[0];assert.equal(rule.logCodeId,id);assert.equal(rule.repeatMode,'scan');assert.equal(rule.locationId,null);assert.equal(get(TIME).timer.sessionId,'keep');
 api.assess({coords:{latitude:52,longitude:6,accuracy:1},timestamp:Date.now()});api.drain();assert.equal(api.eligible().length,0);assert.equal(prepared,null);assert.equal(api.compactStatus(rule),'Klaar voor een QR-scan');
 scan(id);assert.ok(q('[data-qr-run]'));assert.equal(prepared,null);q('[data-qr-run]').click();assert.equal(prepared.themeId,'t');assert.equal(prepared.subthemeId,'');assert.equal(prepared.note,'Activiteit');
 // Repeated scans work without arrival, reset, or GPS.
 prepared=null;scan(id);q('[data-qr-run]').click();assert.equal(prepared.themeId,'t');
 api.edit(rule.id);f=q('form');assert.equal(f.elements.logCodeId.value,id);assert.equal(f.elements.logCodeId.readOnly,true);f.elements.subthemeId.value='s';submit();scan(id);q('[data-qr-run]').click();assert.equal(prepared.subthemeId,'s');
 assert.throws(()=>api.validate({...get(TIME).locationActions[0],id:'duplicate'}),/al in gebruik/);
 assert.throws(()=>api.validate({...get(TIME).locationActions[0],logCodeId:'otherCode012'}),/identifier.*vast/);
 prepared=null;scan(id);api.toggle(rule.id);q('[data-qr-run]').click();assert.equal(prepared,null);assert.match(q('[data-qr-status]').textContent,/gewijzigd/);scan(id);assert.match(q('dialog').textContent,/Uitgeschakeld/);api.toggle(rule.id);
 const raw=get(TIME);raw.locationActions.push({id:'ride',name:'Rit',trigger:'qr',logCodeId:code.newCodeId(),type:'ride',selection:'fixed',targetId:'dest',repeatMode:'scan',enabled:true,days:[]},{id:'card-action',name:'Kaart',trigger:'qr',logCodeId:code.newCodeId(),type:'card',targetId:'card',repeatMode:'scan',enabled:true,days:[]});set(TIME,raw);
 scan(raw.locationActions[1].logCodeId);q('[data-qr-run]').click();await Promise.resolve();assert.equal(ride,'dest');
 w.LogCardsModule.show=id=>{shown=id;return true};scan(raw.locationActions[2].logCodeId);q('[data-qr-run]').click();assert.equal(shown,'card');
 scan('unknown_ID0');assert.ok(q('#cardForm'),'eleven characters remain ordinary content');w.LogCardsUI.close();
 scan('unknown_ID01');assert.match(q('dialog').textContent,/nog niet geconfigureerd/);assert.ok(q('[data-task-back]'));
 // Existing UPC barcodes still take the card recognition path.
 w.LogCardsModule.show=id=>{shown=id;return true};scan('012345678901',w.ZXing.BarcodeFormat.UPC_A);assert.equal(shown,'card');
 // Collision retry and all 64 symbols, with cryptographic generation restored afterwards.
 const random=w.crypto.getRandomValues.bind(w.crypto);let attempts=0;const state=get(TIME);state.locationActions.push({id:'reserved',logCodeId:'AAAAAAAAAAAA'});set(TIME,state);
 w.crypto.getRandomValues=bytes=>{bytes.fill(attempts++?63:0);return bytes};assert.equal(code.newCodeId(),'____________');assert.equal(attempts,2);
 w.crypto.getRandomValues=random;const samples=new Set(Array.from({length:500},()=>code.newCodeId()));assert.equal(samples.size,500);for(const c of samples)assert.match(c,/^[A-Za-z0-9_-]{12}$/);
 const qr=w.qrcode(0,'M');qr.addData(id,'Byte');qr.make();assert.equal(qr.getModuleCount(),21);
 // Export a theme including its existing, edited action; import on another device.
 code.configBuilder();f=q('form');f.elements.theme.value='local-0';f.elements.theme.onchange();f.elements.subs.value='Subthema';submit();let generated=null;const edit=w.LogCardsUI.edit;w.LogCardsUI.edit=(unused,c)=>{generated=c};q('[data-save-config]').click();assert.ok(generated);const payload=code.parse(generated.value);assert.ok(payload.actions.some(a=>a.logCodeId===id));
 const source=get(TIME);set(TIME,{entries:[{id:'other-history'}],timer:{status:'inactive'}});code.commit(payload);const copied=get(TIME).locationActions.find(a=>a.logCodeId===id);assert.equal(copied.subthemeId,get(TIME).subthemes[0].id);assert.equal(copied.name,'Activiteit');const once=w.localStorage.getItem(TIME);code.commit(payload);assert.equal(w.localStorage.getItem(TIME),once);assert.equal(get(TIME).entries[0].id,'other-history');
 // Legacy IDs migrate once; deletion or disabling must never be bypassed or undone by scanning.
 set(TIME,{themes:[{id:'legacy',name:'Legacy',logCodeId:'LegacyCode01'}],entries:[{id:'old'}]});code.migrateTasks();let legacy=get(TIME);assert.equal(legacy.locationActions.length,1);legacy.locationActions=[];set(TIME,legacy);code.preview(code.parse('LegacyCode01'));assert.equal(get(TIME).locationActions.length,0);assert.match(q('dialog').textContent,/nog niet geconfigureerd/);
 set(TIME,source);w.LogCardsUI.edit=edit;assert.equal(get(TIME).entries[0].id,'keep');assert.equal(get(KM).trips[0].id,'keep-trip');
 console.log('QR actions: random IDs/collision retry, raw scan dispatch, location independence, task/ride/card, stable edits, disabled/stale actions, portable configuration, legacy deletion, preserved data and 21x21 QR passed.');dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1});
