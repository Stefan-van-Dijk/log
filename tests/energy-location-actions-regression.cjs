'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,ResourceLoader,VirtualConsole}=require('jsdom');
const {indexedDB,IDBKeyRange}=require('fake-indexeddb');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),origin='https://example.test';
class LocalResources extends ResourceLoader{
  fetch(url){const parsed=new URL(url);if(parsed.origin!==origin)return null;const file=path.resolve(root,decodeURIComponent(parsed.pathname).replace(/^\/log\//,''));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return null;return Promise.resolve(fs.readFileSync(file))}
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(){
  const errors=[],consoleMessages=[],observers=[],vc=new VirtualConsole(); let reads=0, writes=0, mutations=0, hidden=false, gpsCalls=0;
  vc.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.detail?.stack||error.message)});
  vc.on('error',(...args)=>consoleMessages.push(args.map(String).join(' ')));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{
    url:origin+'/log/',runScripts:'dangerously',resources:new LocalResources(),pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      const get=w.Storage.prototype.getItem,set=w.Storage.prototype.setItem;w.Storage.prototype.getItem=function(...args){reads++;return get.apply(this,args)};w.Storage.prototype.setItem=function(...args){writes++;return set.apply(this,args)};Object.defineProperty(w.document,'hidden',{get:()=>hidden});Object.defineProperty(w.document,'visibilityState',{get:()=>hidden?'hidden':'visible'});const NativeObserver=w.MutationObserver;w.MutationObserver=class extends NativeObserver{constructor(callback){super((...args)=>{mutations++;callback(...args)});observers.push(this)}};
      w.CSS={escape:value=>String(value)};
      w.localStorage.setItem('kmreg-v4-data',JSON.stringify({settings:{},locations:[{id:'home',name:'Thuis',lat:52,lng:6}],cards:[{id:'fixture-card',name:'Pas',value:'fixture',format:'QR_CODE'}]}));
      w.localStorage.setItem('urenregistratie.pwa.v1',JSON.stringify({settings:{},locationActions:Array.from({length:12},(_,i)=>({id:'rule-'+i,name:'Locatieactie '+i,trigger:'location',type:'card',enabled:true,locationId:'home',targetId:'fixture-card',radius:500,repeatMode:'visit',start:'00:00',end:'23:59',days:[]}))}));
      w.navigator.geolocation={getCurrentPosition(ok){gpsCalls++;ok({coords:{latitude:52,longitude:6,accuracy:5},timestamp:Date.now()});}};
      w.indexedDB=indexedDB;w.IDBKeyRange=IDBKeyRange;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
      Object.defineProperty(w.crypto,'subtle',{value:webcrypto.subtle});
      w.confirm=()=>true;w.alert=message=>errors.push('Unexpected alert '+message);
      w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
      w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
      w.HTMLElement.prototype.scrollIntoView=function(){};
      w.scrollTo=function(){};
      w.URL.createObjectURL=()=> 'blob:fixture';w.URL.revokeObjectURL=()=>{};
      w.fetch=async url=>{const u=new URL(String(url),w.location.href);if(u.origin===origin){const file=path.resolve(root,u.pathname.replace(/^\/log\//,''));if(file.startsWith(root+path.sep)&&fs.existsSync(file))return new Response(fs.readFileSync(file),{status:200});}return new Response(JSON.stringify({error:'Network disabled by test'}),{status:503})};
    }
  });
  try{
    const w=dom.window;await sleep(900);
    w.dispatchEvent(new w.CustomEvent('kmreg-test-shell-select-section',{detail:{section:'time'}}));await sleep(1600);
    reads=writes=mutations=0;await sleep(12000);assert.equal(writes,0);assert.equal(mutations,0,'Idle home with twelve location actions must settle');assert.ok(reads<100,'Actions must not repeatedly process saved data every five seconds');assert.equal(gpsCalls,1,'Twelve actions share one initial GPS sample');
    w.dispatchEvent(new w.CustomEvent('kmreg-test-shell-select-section',{detail:{section:'locations'}}));await sleep(600);
    reads=writes=mutations=0;await sleep(2200);assert.equal(writes,0);assert.equal(mutations,0);assert.equal(gpsCalls,1,'Locations view reuses the central GPS sample');
    w.dispatchEvent(new w.CustomEvent('kmreg-test-shell-select-section',{detail:{section:'barcodes'}}));await sleep(200);
    const nearby=w.document.querySelector('[data-cards-near]');assert.ok(nearby);nearby.click();await sleep(200);assert.equal(gpsCalls,1,'Nearby cards also reuse the shared GPS sample');
    assert.deepEqual(errors,[]);console.log('GPS idle app passed: twelve location actions settle; home, locations and nearby cards share one measurement.');
  }finally{for(const observer of observers)observer.disconnect();await sleep(50);dom.window.close()}
}
run().catch(error=>{console.error(error);process.exitCode=1});
