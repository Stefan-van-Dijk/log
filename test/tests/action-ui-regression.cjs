const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),TIME='urenregistratie.test.pwa.v1',KM='kmreg-test-v4-data';
const dom=new JSDOM('<div class="shell"><main id="app"></main><main id="root"></main></div>',{url:'https://example.test/test/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document;
let now=new Date(2026,8,28,8,0).getTime(),rides=0,cards=0;
const RealDate=w.Date;w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
w.setInterval=()=>0;w.confirm=()=>true;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
const get=k=>JSON.parse(w.localStorage.getItem(k)||'{}'),set=(k,v)=>w.localStorage.setItem(k,JSON.stringify(v));
const loc={id:'l',name:'Kantoor',lat:52,lng:6},dest={id:'dest',name:'Thuis',lat:53,lng:7};
set(KM,{settings:{recognitionRadius:100},locations:[loc,dest],cards:[{id:'c',name:'Pas',value:'abc',format:'QR_CODE'}],trips:[]});set(TIME,{locationActions:[],themes:[{id:'t',name:'Werk'}],subthemes:[],entries:[{id:'keep'}],timer:{status:'inactive'}});
w.LogModuleVisibility={enabled:()=>true};w.LogTimeModule={reloadFromStorage(){},getView:()=> 'home',getState:()=>get(TIME)};w.LogRideStarter={async prepare(){rides++;}};
w.navigator.geolocation={watchPosition(){return 1},clearWatch(){},getCurrentPosition(){}};
for(const file of ['cards.js','swipe-policy.js','location-actions.js','shell-direct-actions.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));const api=w.LogLocationActions;
w.LogCardsModule.show=()=>{cards++;api.decorateCard(null,'c')};
const rule=(id='r')=>({id,name:id,enabled:true,locationId:'l',type:'card',targetId:'c',radius:100,days:[],start:'',end:''});
const put=rules=>{const raw=get(TIME);raw.locationActions=rules;set(TIME,raw);w.dispatchEvent(new w.Event('log-time-state-change'));};
const gps=(lat=52,lng=6,accuracy=5)=>api.assess({coords:{latitude:lat,longitude:lng,accuracy},timestamp:now},now);
const arrive=()=>{gps(53,7);now+=21000;gps(53,7);now+=1000;gps();};
const tick=()=>new Promise(r=>setTimeout(r,5));
(async()=>{
 for(const file of ['cards.css','people.css','location-actions.css']){const style=d.createElement('style');style.textContent=fs.readFileSync(path.join(base,file),'utf8');d.head.append(style);}
 api.mount(d.querySelector('#root'));gps();put([rule('card'),{...rule('ride'),type:'ride',targetId:'dest'},{...rule('task'),type:'task',targetId:'t'}]);
 const rows=[...d.querySelectorAll('[data-la-row]')];assert.equal(rows.length,3);assert.equal(new Set(rows.map(row=>row.style.getPropertyValue('--card-color'))).size,3);
 for(const row of rows){assert.ok(row.querySelector('.code-card-icon svg'));assert.equal(row.querySelectorAll('.code-card-copy strong').length,1);assert.equal(row.querySelectorAll('.code-card-copy small').length,2);assert.equal(row.querySelector('[data-la-reason]'),null);}
 assert.match(rows[0].textContent,/Toont Pas bij Kantoor/);assert.match(rows[1].textContent,/rit naar Thuis/);assert.match(rows[2].textContent,/taak Werk/);
 const hidden=sel=>assert.equal(w.getComputedStyle(d.querySelector(sel)).display,'none',sel+' must actually be hidden by CSS');
 api.edit('card');let f=d.querySelector('form');hidden('[data-selection]');hidden('[data-subfield]');hidden('[data-day-fields]');hidden('[data-time-fields]');assert.equal(f.elements.selection.disabled,true);assert.equal(f.elements.repeatMode.disabled,false);assert.equal(f.elements.subthemeId.disabled,true);assert.equal(f.elements.start.required,false);
 f.elements.type.value='ride';f.elements.type.onchange();hidden('[data-repeat-duration]');hidden('[data-subfield]');assert.equal(d.querySelector('[data-target-label]').textContent,'Bestemming');assert.equal(f.elements.repeatMode.disabled,false);
 f.elements.selection.value='smart';f.elements.selection.onchange();hidden('[data-target]');assert.equal(f.elements.targetId.disabled,true);assert.equal(f.elements.targetId.required,false);
 f.elements.type.value='task';f.elements.type.onchange();hidden('[data-subfield]');f.elements.selection.value='fixed';f.elements.selection.onchange();f.elements.targetId.value='t';f.elements.targetId.onchange();hidden('[data-subfield]');assert.equal(d.querySelector('[data-target-label]').textContent,'Thema');
 f.elements.dayMode.value='selected';f.elements.dayMode.onchange();assert.notEqual(w.getComputedStyle(d.querySelector('[data-day-fields]')).display,'none');
 f.elements.dayMode.value='all';f.elements.dayMode.onchange();f.elements.timeMode.value='window';f.elements.timeMode.onchange();assert.equal(f.elements.start.required,true);f.elements.start.value='10:00';f.elements.end.value='11:00';f.elements.timeMode.value='all';f.elements.timeMode.onchange();hidden('[data-time-fields]');
 f.elements.selection.value='smart';f.elements.selection.onchange();f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));const saved=get(TIME).locationActions.find(r=>r.id==='card');assert.equal(saved.type,'task');assert.equal(saved.targetId,'');assert.equal(saved.subthemeId,'');assert.equal(saved.start,'');assert.equal(saved.end,'');assert.deepEqual(saved.days,[]);assert.equal(saved.repeatMode,'visit');
 put([rule('r')]);api.snoozeCard('c','day',now);api.refresh();
 const touch=(type,surface,x,y=100,count=1)=>{const e=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{touches:type==='touchend'||type==='touchcancel'?[]:Array.from({length:count},()=>({clientX:x,clientY:y})),changedTouches:[{clientX:x,clientY:y}]});surface.dispatchEvent(e);};
 let surface=d.querySelector('.code-card-surface');touch('touchstart',surface,100);touch('touchmove',surface,120,180);touch('touchend',surface,120,180);assert.ok(get('log-test-action-snoozes-v1').r,'vertical scroll never resets');
 touch('touchstart',surface,100);touch('touchmove',surface,170);touch('touchcancel',surface,170);assert.ok(get('log-test-action-snoozes-v1').r,'cancel never resets');
 // Native pointer events plus touch events must perform just one reset.
 let resets=0;const original=api.reset;api.reset=id=>{resets++;return original(id)};
 const pe=new w.Event('pointerdown',{bubbles:true});Object.assign(pe,{pointerType:'touch',pointerId:2,button:0,clientX:100,clientY:100});surface.dispatchEvent(pe);
 touch('touchstart',surface,100);touch('touchmove',surface,180);assert.match(surface.style.transform,/80px/);now+=60000;gps();assert.equal(surface.isConnected,true,'GPS refresh must not replace a dragged row');touch('touchend',surface,180);
 assert.equal(resets,1);assert.equal(get('log-test-action-snoozes-v1').r,undefined);assert.equal(api.eligible().length,0);assert.equal(d.querySelector('#laResetNotice').hidden,false);
 d.querySelector('[data-la-open]').click();assert.equal(d.querySelector('dialog'),null,'touch release cannot open editor');assert.equal(cards+rides,0,'reset never runs an action');

 w.LogCardsUI.close();put([rule('detail')]);gps();api.mount(d.querySelector('#root'));
 api.details('detail');assert.ok(d.querySelector('[data-la-details]'));
 assert.match(d.querySelector('[data-la-details]').textContent,/Locatie herkend/);
 assert.match(d.querySelector('[data-la-details]').textContent,/nauwkeurig/);
 assert.match(d.querySelector('[data-la-details]').textContent,/Niet geregistreerd/);
 d.querySelector('[data-la-detail-edit]').click();assert.ok(d.querySelector('form'));w.LogCardsUI.close();
 assert.equal(api.compactStatus({...rule(),enabled:false}),'Uitgeschakeld');
 api.snoozeCard('c','halfHour',now,['detail']);assert.equal(api.compactStatus(rule('detail')),'Over 30 min');api.refresh();assert.equal(d.querySelector('[data-la-next]').textContent,'Over 30 min');
 console.log('Action UI passed: conditional fields including computed CSS, compact typed rows, irrelevant values cleared, native touch reset, cancellation, GPS refresh and click suppression.');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1});
