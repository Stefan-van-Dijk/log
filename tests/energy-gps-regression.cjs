const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function run(){
  const dom=new JSDOM('<button id="navigation">Menu</button>',{url:'https://example.test/log/',runScripts:'outside-only'}),w=dom.window;
  let now=1800000000000,hidden=false,calls=0,next=0;const timers=new Map(),options=[];
  Object.defineProperty(w.document,'readyState',{value:'complete'});
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  w.Date.now=()=>now;
  w.setTimeout=(fn,delay)=>{const id=++next;timers.set(id,{fn,at:now+delay});return id;};
  w.clearTimeout=id=>timers.delete(id);
  w.navigator.geolocation={getCurrentPosition(ok,bad,config){calls++;options.push(config);ok({timestamp:now,coords:{latitude:52,longitude:6,accuracy:5}});}};
  async function advance(ms){const end=now+ms;for(;;){const pair=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!pair||pair[1].at>end)break;now=pair[1].at;timers.delete(pair[0]);pair[1].fn();await flush();}now=end;await flush();}
  try{
    w.eval(fs.readFileSync(path.join(root,'location-polling.js'),'utf8'));await flush();
    assert.equal(calls,1);assert.equal(options[0].enableHighAccuracy,false);
    await advance(120000);assert.equal(calls,1,'Idle app does not periodically enable GPS');
    w.localStorage.setItem('kmreg-v4-data',JSON.stringify({activeTrip:{id:'fixture-trip'}}));
    w.dispatchEvent(new w.Event('log-km-state-change'));await flush();const rideStart=calls;
    assert.equal(options.at(-1).enableHighAccuracy,true,'Ride retains accurate GPS');
    for(let i=0;i<5;i++){await advance(10000);w.document.querySelector('button').click();await flush();}
    assert.equal(calls,rideStart,'Navigation during a ride reuses the minute sample');
    await advance(10000);assert.equal(calls,rideStart+1,'Periodic ride sample remains every minute');
    hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));const hiddenStart=calls;
    await advance(180000);assert.equal(calls,hiddenStart,'No background GPS checks');
    hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));await flush();assert.equal(calls,hiddenStart+1,'Foreground resumes with a fresh location');
    now+=7000;await w.LogLocationPolling.request({maxAge:6000});assert.equal(calls,hiddenStart+2,'Explicit location-dependent operations can request a fresh sample');
    console.log('Energy GPS checks passed: idle, ride navigation reuse, minute accuracy, background pause, foreground and explicit fresh requests.');
  }finally{w.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1});
