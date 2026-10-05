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
  const errors=[],consoleMessages=[],observers=[],vc=new VirtualConsole(); let reads=0, writes=0, mutations=0, hidden=false;
  vc.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.detail?.stack||error.message)});
  vc.on('error',(...args)=>consoleMessages.push(args.map(String).join(' ')));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{
    url:origin+'/log/',runScripts:'dangerously',resources:new LocalResources(),pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      const get=w.Storage.prototype.getItem,set=w.Storage.prototype.setItem;w.Storage.prototype.getItem=function(...args){reads++;return get.apply(this,args)};w.Storage.prototype.setItem=function(...args){writes++;return set.apply(this,args)};Object.defineProperty(w.document,'hidden',{get:()=>hidden});Object.defineProperty(w.document,'visibilityState',{get:()=>hidden?'hidden':'visible'});const NativeObserver=w.MutationObserver;w.MutationObserver=class extends NativeObserver{constructor(callback){super((...args)=>{mutations++;callback(...args)});observers.push(this)}};
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
    reads=writes=mutations=0;await sleep(2200);assert.equal(writes,0);assert.equal(mutations,0,'Idle screen must settle');
    w.document.querySelector('[data-guide-start="time"]').click();await sleep(200);
    const time=JSON.parse(w.localStorage.getItem('urenregistratie.pwa.v1'))||{};
    time.timer={...time.timer,status:'active',startISO:new Date(Date.now()-30000).toISOString(),themeName:'Fixture task'};
    w.localStorage.setItem('urenregistratie.pwa.v1',JSON.stringify(time));
    w.LogTimeModule.reloadFromStorage({view:'home'});await sleep(150);
    const clock=w.document.querySelector('#timerClock');assert.ok(clock,'Actual running task clock is mounted');
    const beforeClock=clock.textContent;
    hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));await sleep(100);
    reads=writes=mutations=0;await sleep(2200);assert.equal(reads,0,'Background must not process stored action data');assert.equal(writes,0);assert.equal(mutations,0);
    assert.equal(clock.textContent,beforeClock,'Running task clock does not mutate the background');
    hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));await sleep(1200);
    assert.notEqual(w.document.querySelector('#timerClock')?.textContent,beforeClock,'Task elapsed time catches up after resume');
    assert.deepEqual(errors,[]);console.log('Assembled energy checks passed: idle screen settles, background performs no storage/screen processing, and running task time catches up after resume.');
  }finally{for(const observer of observers)observer.disconnect();await sleep(50);dom.window.close()}
}
run().catch(error=>{console.error(error);process.exitCode=1});
