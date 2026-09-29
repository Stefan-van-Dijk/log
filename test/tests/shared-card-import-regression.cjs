'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),KM='kmreg-test-v4-data',TIME='urenregistratie.test.pwa.v1';
const dom=new JSDOM('<body><main></main></body>',{url:'https://stefan-van-dijk.github.io/log/test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
const get=k=>JSON.parse(w.localStorage.getItem(k)||'{}'),set=(k,v)=>w.localStorage.setItem(k,JSON.stringify(v)),q=s=>d.querySelector(s);
const initialKm={trips:[{id:'ride'}],activeTrip:{id:'active'},trackPoints:[{id:'gps',tripId:'ride'}],locations:[{id:'l',name:'My own location'}],cards:[],settings:{name:'Keep me'}};
const initialTime={entries:[{id:'entry'}],timer:{status:'running'},themes:[{id:'t',name:'My own theme'}]};
const reset=()=>{set(KM,initialKm);set(TIME,initialTime);};reset();set('kmreg-v4-data',{untouched:true});
w.LogCardData={snapshot:()=>get(KM),save:cards=>set(KM,{...get(KM),cards})};let starts=0;w.LogTimeModule={reloadFromStorage(){},getView:()=> 'home',prepareFromCode(){starts++}};
for(const file of ['vendor/qrcode-2.0.4.js','vendor/jsbarcode-3.12.1.min.js','shared-card-import.js','log-code.js','cards.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8'));
const fixture={schema:'https://sharon.life/log/config/v1',kind:'log-config',id:'CardTest0001',title:'Toegang',root:{type:'card',sourceId:'card1'},objects:{locations:[{id:'l',name:'Office'},{id:'sub',name:'Entrance',parentId:'l'}],themes:[{id:'t',name:'Work'}],subthemes:[{id:'st',themeId:'t',name:'Check'}],cards:[{id:'card1',name:'My shared card',format:'QR_CODE',value:'001234567890',color:'#123456',locationId:'sub',scanAction:{type:'task',themeId:'t',subthemeId:'st'}}],actions:[]}};
// ID is exactly 12 characters, including case.
fixture.id='CardTest0001';
let calls=0;
const response=(doc=fixture,status=200)=>({ok:status===200,status,headers:{get:n=>n==='content-type'?'application/json':null},text:async()=>JSON.stringify(doc)});
const respond=(doc=fixture,status=200)=>w.fetch=async(url,options)=>{calls++;assert.equal(url,'https://sharon.life/log/config/'+fixture.id+'.json');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return response(doc,status)};
const lookup=()=>w.LogCode.preview(w.LogCode.parse(fixture.id));
(async()=>{
 respond();await lookup();assert.ok(q('[data-shared-preview] svg'));assert.deepEqual(get(KM),initialKm);assert.deepEqual(get(TIME),initialTime);q('[data-shared-cancel]').click();assert.equal(q('dialog'),null);
 await lookup();q('[data-shared-import]').click();let km=get(KM),time=get(TIME),card=km.cards[0];assert.equal(card.value,'001234567890');assert.equal(card.color,'#123456');assert.equal(km.locations[0].name,'My own location');assert.equal(time.themes[0].name,'My own theme');assert.equal(km.locations.find(l=>l.id===card.locationId).parentId,km.locations[1].id);assert.equal(time.subthemes[0].themeId,card.scanAction.themeId);assert.equal(starts,0);assert.deepEqual(km.trips,initialKm.trips);assert.deepEqual(km.activeTrip,initialKm.activeTrip);assert.deepEqual(km.trackPoints,initialKm.trackPoints);assert.deepEqual(time.entries,initialTime.entries);assert.deepEqual(time.timer,initialTime.timer);assert.deepEqual(get('kmreg-v4-data'),{untouched:true});
 card.name='Local name';km.cards[0]=card;set(KM,km);const before=w.localStorage.getItem(KM),beforeCalls=calls;w.fetch=()=>{throw Error('offline')};await lookup();assert.match(q('dialog').textContent,/Local name/);assert.equal(w.localStorage.getItem(KM),before);assert.equal(calls,beforeCalls);assert.equal(get(KM).cards.length,1);
 // Reload retains offline mapping and local edits.
 w.eval(fs.readFileSync(path.join(base,'shared-card-import.js'),'utf8'));await lookup();assert.match(q('dialog').textContent,/Local name/);
 // Malformed relationships, schema, identifiers, and barcodes never mutate storage.
 for(const mutate of [x=>x.id='WrongCode001',x=>x.schema+='x',x=>x.objects.locations[0].parentId='sub',x=>x.objects.themes=[],x=>x.objects.cards[0].format='INVALID',x=>x.objects.cards[0].format='EAN13',x=>x.objects.cards.push(x.objects.cards[0])]){reset();const doc=structuredClone(fixture);mutate(doc);respond(doc);await lookup();assert.ok(q('[data-online-retry]'));assert.equal(q('[data-shared-import]'),null);assert.deepEqual(get(KM),initialKm);assert.deepEqual(get(TIME),initialTime);}
 reset();respond(fixture,404);await lookup();assert.match(q('[data-online-status]').textContent,/niet gevonden/);
 // Closing during fetch must not open a preview later.
 let finish;w.fetch=()=>new Promise(resolve=>finish=resolve);const pending=lookup();q('[data-task-back]').click();finish(response());await pending;assert.equal(q('dialog'),null);assert.deepEqual(get(KM),initialKm);
 // A failed KM write rolls back the preceding theme write.
 respond();await lookup();const proto=w.Storage.prototype,old=proto.setItem;proto.setItem=function(k,v){if(k===KM)throw Error('quota');return old.call(this,k,v)};q('[data-shared-import]').click();proto.setItem=old;assert.match(q('[data-shared-status]').textContent,/Opslaan is niet gelukt/);assert.deepEqual(get(TIME),initialTime);assert.deepEqual(get(KM),initialKm);
 // Manual input rejects other origins; valid public links use the same preview.
 w.LogSharedCard.prompt();q('input').value='https://evil.example/log/config/'+fixture.id+'.json';q('form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.match(q('[data-shared-error]').textContent,/12 tekens/);
 q('input').value='https://sharon.life/log/config/'+fixture.id+'.json';q('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await new Promise(r=>setTimeout(r,10));assert.ok(q('[data-shared-import]'));
 // Normal app save/normalize keeps the card's import identity.
 reset();respond();await lookup();q('[data-shared-import]').click();
 const normalizeSource=fs.readFileSync(path.join(base,'index.html'),'utf8').match(/function normalize\(x\)\{[^\n]+/)[0];
 const normalize=new Function('DEFAULT',normalizeSource+';return normalize;')({settings:{}});
 set(KM,normalize(get(KM)));w.fetch=()=>{throw Error('offline after normal save')};await lookup();assert.equal(get(KM).cards.length,1);assert.ok(q('.cards-display'));
 // The explicit retrieve button opens a manual identifier form.
 w.LogCardsUI.close();w.LogCardsModule.mount(q('main'));q('[data-cards-fetch]').click();assert.ok(q('#sharedCardIdentifier'));w.LogCardsModule.unmount();
 // Rendering remote titles treats markup as text.
 reset();const xss=structuredClone(fixture);xss.objects.cards[0].name='<img src=x onerror=alert(1)>';respond(xss);await lookup();assert.equal(q('[data-shared-preview]').parentNode.querySelector('img'),null);
 console.log('Shared cards: preview, cancellation, import/dependency remapping, local preservation, offline repeat/reload, malformed data, 404, close-during-fetch, storage rollback, manual link and escaping passed.');w.close();
})().catch(error=>{console.error(error);w.close();process.exitCode=1});
