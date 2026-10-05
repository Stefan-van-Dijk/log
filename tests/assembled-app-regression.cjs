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
  const errors=[],consoleMessages=[],observers=[],vc=new VirtualConsole();
  vc.on('jsdomError',error=>{if(!/Could not parse CSS stylesheet/.test(error.message))errors.push(error.detail?.stack||error.message)});
  vc.on('error',(...args)=>consoleMessages.push(args.map(String).join(' ')));
  const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{
    url:origin+'/log/',runScripts:'dangerously',resources:new LocalResources(),pretendToBeVisual:true,virtualConsole:vc,
    beforeParse(w){
      const NativeObserver=w.MutationObserver;w.MutationObserver=class extends NativeObserver{constructor(callback){super(callback);observers.push(this)}};
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
    assert.equal(typeof w.buildCompleteRegistrationExport,'function');assert.equal(typeof w.LogBackupHost?.restore,'function');
    assert.ok(w.LogIdentitySync,'Actual identity bridge initialized');assert.ok(w.LogVehicles,'Actual vehicle module initialized');
    assert.ok(w.document.querySelector('[data-guide-start="time"]'),'New user sees skippable first goal');
    w.document.querySelector('[data-guide-start="time"]').click();await sleep(120);
    assert.equal(w.LogModuleHost.getMode(),'time');assert.equal(w.localStorage.getItem('kmreg-test-shell-section-v1'),'time');
    w.dispatchEvent(new w.CustomEvent('kmreg-test-shell-select-section',{detail:{section:'rides'}}));await sleep(100);
    w.document.querySelector('[data-action="start"]').click();await sleep(80);
    const form=w.document.querySelector('#firstRideSetupForm');assert.ok(form);
    form.elements.initialOdometer.value='700';form.elements.originName.value='Thuis';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await sleep(150);
    assert.ok(w.document.querySelector('#startInlinePanel'));
    const vehicle=w.LogVehicles.active();assert.equal(Number(vehicle.initialOdometer),700,'Setup updates the real active vehicle');
    w.localStorage.setItem('log-test-archive-v1',JSON.stringify({version:1,records:[{id:'archive-fixture'}]}));
    const backup=w.buildCompleteRegistrationExport();assert.equal(backup.app.build,'0.40.4');assert.equal(backup.counts.archived_items,1);
    assert.ok(backup.recovery.sources.app_local.data.entries.some(item=>item.key==='log-test-vehicles-v1'));
    backup.recovery.sources.kilometerregistratie.data.trackPoints=[{id:'gps-fixture',tripId:'test-trip',lat:52,lng:6,time:'2026-10-05T12:00:00Z'}];
    await w.LogBackupHost.restore(backup);await sleep(100);
    const restored=w.buildCompleteRegistrationExport();assert.equal(restored.recovery.sources.kilometerregistratie.data.trackPoints.length,1,'Hydrated IndexedDB GPS survives complete restore');
    const online=w.LogIdentitySync.buildBackup();assert.ok(online.recovery.sources.identity_sync);assert.ok(online.recovery.sources.app_local);
    w.dispatchEvent(new w.CustomEvent('kmreg-test-shell-select-section',{detail:{section:'barcodes'}}));await sleep(100);
    w.LogCardData.save([{id:'Card0001',name:'Pas',value:'fixture',format:'QR_CODE'}]);
    assert.equal(w.LogCardData.snapshot().cards.length,1);
    const card=w.LogCardsModule.show('Card0001');assert.ok(card);
    const actions=[...card.querySelectorAll('.log-card-visible-actions button')];assert.ok(actions.length>=1);
    assert.equal(actions[0].textContent,'Kaart bewerken');actions[0].click();assert.ok(w.document.querySelector('#cardForm'));w.LogCardsUI.close();
    assert.ok(!consoleMessages.some(text=>text.includes('Archief-back-up kon niet')));
    assert.deepEqual(errors,[]);
    console.log('Assembled app passed: actual script loader, welcome → time → rides, real active vehicle, offline/online export bridge, archive and IndexedDB restore. No external writes.');
  }finally{for(const observer of observers)observer.disconnect();await sleep(50);dom.window.close()}
}
run().catch(error=>{console.error(error);process.exitCode=1});
