'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<body class="km-shell-settings-open"><div class="shell"><main id="app"></main></div></body>',{url:'https://example.test/log/',runScripts:'outside-only'}),w=dom.window;
let now=Date.UTC(2026,9,5,18,11,7),hidden=false,sequence=0,ticks=0;const timers=new Map();
const RealDate=w.Date;w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
Object.defineProperty(w.document,'hidden',{get:()=>hidden});
w.setTimeout=(fn,delay)=>{const id=++sequence;timers.set(id,{fn,at:now+delay});return id;};w.clearTimeout=id=>timers.delete(id);
w.setInterval=()=>{throw Error('Location actions must not use a recurring interval');};
w.LogModuleVisibility={enabled:()=>true};
const set=(key,value)=>w.localStorage.setItem(key,JSON.stringify(value));
set('kmreg-test-v4-data',{settings:{},locations:[{id:'home',name:'Thuis',lat:52,lng:6}],cards:[{id:'card',name:'Pas'}]});
set('urenregistratie.test.pwa.v1',{settings:{smartRideEnabled:false}});
function advance(ms){const end=now+ms;for(;;){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;now=next[1].at;timers.delete(next[0]);ticks++;next[1].fn();}now=end;}
try{
  w.eval(fs.readFileSync(path.join(__dirname,'..','location-actions.js'),'utf8'));const api=w.LogLocationActions;
  const sample=()=>api.assess({timestamp:now,coords:{latitude:52,longitude:6,accuracy:5}});
  sample();assert.equal(timers.size,0,'No recurring work when no location action needs it');
  const rules=Array.from({length:12},(_,i)=>({id:'rule-'+i,name:'Actie '+i,enabled:true,trigger:'location',type:'card',locationId:'home',targetId:'card',radius:500,repeatMode:'duration',repeatMinutes:1,days:[]}));
  set('urenregistratie.test.pwa.v1',{settings:{smartRideEnabled:false},locationActions:rules});
  w.dispatchEvent(new w.Event('log-time-state-change'));advance(50);
  const startTicks=ticks;advance(30000);assert.equal(ticks,startTicks,'Multiple actions do not cause five-second polling');
  api.snoozeCard('card','duration');const expiry=now+60000;advance(59999);
  assert.equal(api.eligible().length,0,'Wait remains in effect before its exact deadline');
  advance(1);assert.equal(now,expiry);assert.equal(api.eligible().length,12,'All actions re-arm at the deadline using the same GPS sample');
  assert.equal(timers.size,1,'Only one scheduler serves all location actions');
  hidden=true;w.document.dispatchEvent(new w.Event('visibilitychange'));assert.equal(timers.size,0,'Background clears scheduled action work');
  hidden=false;sample();advance(50);assert.equal(timers.size,1,'New foreground sample restores only one schedule');
  advance(125000);assert.ok([...timers.values()].every(timer=>timer.at-now>5000),'A stale GPS point must not keep a ready offer in the fast retry loop');
  console.log('Location scheduler passed: idle, twelve shared actions, exact wait expiry, one timer and background pause.');
}finally{w.close();}
