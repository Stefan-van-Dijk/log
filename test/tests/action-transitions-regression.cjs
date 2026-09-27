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
 api.mount(d.querySelector('#root'));gps();put([rule()]);api.drain();assert.equal(cards,0,'creating in matching situation waits');gps();api.drain();assert.equal(cards,0,'repeat GPS is not a change');
 arrive();api.drain();assert.equal(cards,1,'next observed arrival opens card');api.drain();assert.equal(cards,1,'shown only once');
 api.reset('r');assert.equal(api.eligible().length,0);api.drain();assert.equal(cards,1,'reset does not execute');assert.match(d.querySelector('#laResetNotice').textContent,/volgende verandering/);
 arrive();api.drain();assert.equal(cards,2,'reset rearms next arrival');
 api.snoozeCard('c','halfHour',now);api.reset('r');assert.equal(get('log-test-action-snoozes-v1').r,undefined);assert.equal(get('log-test-location-action-visits-v1').l.done.includes('r'),false);now+=1800001;gps();api.drain();assert.equal(cards,2,'reset clears timeout without later phantom event');
 api.edit('r');let f=d.querySelector('form');f.elements.name.value='Changed';f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));api.drain();assert.equal(cards,2,'saving edit does not execute');
 arrive();api.drain();assert.equal(cards,3);
 // Reset through the shared rightward gesture. Cancel/vertical/short swipes do nothing.
 api.snoozeCard('c','day',now);api.refresh();
 const swipe=(dx,dy=0,cancel=false)=>{const surface=d.querySelector('.code-card-surface');for(const [type,x,y] of [['pointerdown',100,100],['pointermove',100+dx,100+dy],[cancel?'pointercancel':'pointerup',100+dx,100+dy]]){const e=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(e,{pointerId:1,button:0,clientX:x,clientY:y});surface.dispatchEvent(e);}};
 swipe(12);await tick();assert.ok(get('log-test-action-snoozes-v1').r);swipe(70,100);await tick();assert.ok(get('log-test-action-snoozes-v1').r);swipe(70,0,true);await tick();assert.ok(get('log-test-action-snoozes-v1').r);
 swipe(70);await tick();assert.equal(get('log-test-action-snoozes-v1').r,undefined);api.drain();assert.equal(cards,3,'right swipe resets without running');assert.equal(d.querySelector('dialog'),null);
 // Short left swipe still edits; lifecycle-disabled setting does not disable reset.
 swipe(-60);await tick();assert.ok(d.querySelector('form'));w.LogCardsUI.close();
 put([{...rule(),start:'09:00',end:'10:00'}]);now=new RealDate(2026,8,28,8,59).getTime();gps();api.drain();const before=cards;now+=60000;gps();api.drain();assert.equal(cards,before+1,'time-window entry is a change');api.reset('r');api.drain();assert.equal(cards,before+1,'reset during time window waits');
 put([{...rule(),repeatMode:'halfHour'}]);arrive();api.drain();const repeated=cards;now+=1800001;gps();api.drain();assert.equal(cards,repeated+1,'configured half-hour expiry is a change');
 // Existing persisted state survives script reload; unknown initial GPS is only a baseline.
 api.reset('r');w.eval(fs.readFileSync(base+'/location-actions.js','utf8'));w.LogLocationActions.assess({coords:{latitude:52,longitude:6,accuracy:5},timestamp:now},now);assert.equal(w.LogLocationActions.eligible().length,0,'restart does not rearm reset');
 put([]);let km=get(KM);km.trips=[{id:'last',arrivalTime:new RealDate(now).toISOString(),destination:loc,endOdometer:100}];set(KM,km);w.localStorage.setItem('kmreg-test-shell-section-v1','rides');gps();await api.prepareSmartRide();assert.equal(rides,0,'parking does not open new ride');
 gps(53,7);await api.prepareSmartRide();assert.equal(rides,0,'departure must be confirmed');now+=21000;gps(53,7);await api.prepareSmartRide();assert.equal(rides,1,'confirmed departure prepares ride');await api.prepareSmartRide();assert.equal(rides,1,'departure only once');
 km=get(KM);km.activeTrip={id:'active'};set(KM,km);gps();delete km.activeTrip;km.trips.push({id:'new',arrivalTime:new RealDate(now+1).toISOString(),destination:loc,endOdometer:110});set(KM,km);gps();await api.prepareSmartRide();assert.equal(rides,1,'finishing next trip waits again');
 gps(53,7,500000);now+=21000;gps(53,7,500000);await api.prepareSmartRide();assert.equal(rides,1,'uncertain GPS cannot trigger departure');
 assert.deepEqual(get(TIME).entries,[{id:'keep'}]);assert.equal(get(KM).cards.length,1);
 console.log('Action transitions passed: create/edit/reset, swipe directions/cancel, arrival, time/repeat expiry, restart, parking, departure and data retention.');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1});
