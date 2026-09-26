const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const base=path.resolve(__dirname,'..'),TIME='urenregistratie.test.pwa.v1';
class Local extends ResourceLoader{fetch(url){return Promise.resolve(fs.readFileSync(path.join(base,new URL(url).pathname.replace(/^\/test\//,''))));}}
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(e.type!=='css parsing')errors.push(e.message)});let callback;
const dom=new JSDOM(fs.readFileSync(base+'/index.html','utf8'),{url:'https://example.test/test/',resources:new Local(),runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.scrollTo=()=>{};w.matchMedia=()=>({matches:false,addEventListener(){},addListener(){}});w.fetch=async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(base+'/config/modules.json','utf8'))});w.TextEncoder=TextEncoder;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.navigator.geolocation={watchPosition(cb){callback=cb;return 1},clearWatch(){},getCurrentPosition(){}};
  w.localStorage.setItem('kmreg-test-shell-section-v1','locationactions');w.localStorage.setItem('kmreg-test-v4-data',JSON.stringify({locations:[{id:'l',name:'Kantoor',lat:52,lng:6}],cards:[{id:'c',name:'Pas',value:'abc',format:'QR_CODE'}]}));
  w.localStorage.setItem(TIME,JSON.stringify({settings:{locationActionsEnabled:true},themes:[{id:'t',name:'Werk'}],locationActions:[{id:'r',name:'Pas tonen',locationId:'l',targetId:'c',radius:100,type:'card',days:[],start:'',end:'',enabled:true}]}));
}});
const tick=()=>new Promise(r=>setTimeout(r,100));
dom.window.addEventListener('load',async()=>{try{
 const w=dom.window,d=w.document;await tick();assert.equal(d.querySelector('#kmShellTitle').textContent,'Acties');assert.ok(d.querySelector('[data-la-new]'));w.dispatchEvent(new w.Event('pageshow'));callback({coords:{latitude:52,longitude:6,accuracy:5},timestamp:Date.now()});
 w.LogLocationActions.drain();await tick();assert.ok(d.querySelector('[data-code-display] svg'),'real QR displayed automatically');assert.ok(d.querySelector('[data-la-snooze="day"]'));d.querySelector('[data-la-snooze="day"]').click();assert.equal(d.querySelector('dialog'),null);
 const raw=JSON.parse(w.localStorage.getItem(TIME));raw.locationActions=[{...raw.locationActions[0],id:'task',type:'task',targetId:'t'}];w.localStorage.setItem(TIME,JSON.stringify(raw));w.LogLocationActions.drain();await tick();assert.ok(d.querySelector('[data-la-start="start"]'));assert.equal(w.LogTimeModule.getState().timer.status,'inactive');d.querySelector('[data-la-start="start"]').click();await tick();assert.equal(w.LogTimeModule.getState().timer.status,'active');assert.equal(d.querySelector('#kmShellTitle').textContent,'Tijd en taken');
 const next=JSON.parse(w.localStorage.getItem(TIME));next.locationActions[0].id='task2';w.localStorage.setItem(TIME,JSON.stringify(next));w.LogLocationActions.drain();await tick();assert.ok(d.querySelector('[data-la-start="interrupt"]'));assert.ok(d.querySelector('[data-la-start="replace"]'));w.LogCardsUI.close();assert.equal(w.LogTimeModule.getState().entries.length,0,'dismissing never stops task');
 for(const section of ['people','barcodes','locationactions']){w.dispatchEvent(new w.CustomEvent('kmreg-test-shell-select-section',{detail:{section}}));await tick();}assert.ok(d.querySelector('[data-la-new]'));assert.deepEqual(errors,[]);
 console.log('Full shell: Acties label, automatic QR with snooze, real task preparation/start, active choices, dismissal and module switching passed.');process.exit(0);
}catch(e){console.error(e);process.exit(1)}},{once:true});
