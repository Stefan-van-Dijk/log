const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),TIME='urenregistratie.test.pwa.v1',KM='kmreg-test-v4-data';
const dom=new JSDOM('<body></body>',{url:'https://example.test/test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
const set=(key,value)=>w.localStorage.setItem(key,JSON.stringify(value)),get=key=>JSON.parse(w.localStorage.getItem(key)||'{}');
const code='ActionCode01',taskCode='TaskCode0001';
let started=null,previewed=null,sharedPreviewCalls=0;
set(KM,{cards:[{id:'AbCd123_',name:'Zelfde inhoud',value:code,format:'QR_CODE'}]});
set(TIME,{themes:[{id:'theme-local',name:'Thema'}],subthemes:[{id:'sub-local',themeId:'theme-local',name:'Sub',logCodeId:taskCode}],locationActions:[{id:'rule',name:'Start taak',trigger:'qr',logCodeId:code,type:'task',selection:'fixed',targetId:'theme-local',subthemeId:'sub-local',repeatMode:'scan',enabled:true,days:[]}]});

function sheet(title,html){const dialog=d.createElement('dialog');dialog.innerHTML=`<h2>${title}</h2>${html}`;d.body.appendChild(dialog);return dialog;}
w.LogCardsUI={sheet,close(){d.querySelector('dialog')?.remove();}};
w.LogCardsModule={show(){return true;}};
w.LogLocationActions={snapshot(){const time=get(TIME);return {rules:time.locationActions||[],km:get(KM)};},validate(){},inTime(){return true;}};
w.LogTimeModule={startFromCard(value){started=value;},suggestForAction(){return null;}};
w.LogModuleVisibility={enabled(){return true;}};
w.LogSharedConfig={hasConfiguration(){return false;},preview(){sharedPreviewCalls++;}};
w.LogSharedCard={preview(){sharedPreviewCalls++;}};
w.LogCode={
  parse(value){
    if(/^[A-Za-z0-9_-]{12}$/.test(value))return {kind:'log-action',version:1,id:value};
    try{const parsed=JSON.parse(value);return parsed&&['log-code','log-task','log-action'].includes(parsed.kind)?parsed:null;}catch(_){return null;}
  },
  preview(payload){previewed=payload;return payload;},
  resolveTask(id){
    const time=get(TIME),sub=(time.subthemes||[]).find(item=>[item.logCodeId,item.taskCodeId,item.id].includes(id));
    if(!sub)throw Error('niet bekend');
    const theme=(time.themes||[]).find(item=>item.id===sub.themeId);if(!theme)throw Error('thema ontbreekt');
    return {theme,sub};
  }
};

w.eval(fs.readFileSync(path.join(base,'qr-action-direct.js'),'utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));

(async()=>{
  let time=get(TIME);
  assert.equal(time.locationActions[0].actionCodeId,code,'legacy action code is migrated to the explicit actionCodeId field');
  assert.equal(w.LogScanDispatcher.classify(code).kind,'action','executable meaning wins even when a stored card has the same value');
  assert.deepEqual(w.LogCode.parse(code),{kind:'log-action',version:1,id:code});
  w.LogCode.preview({kind:'log-action',version:1,id:code});
  await new Promise(resolve=>setTimeout(resolve,0));
  let panel=d.querySelector('dialog');
  assert.ok(panel.querySelector('[data-log-task-go-button]'),'action scan opens one compact Go confirmation');
  assert.equal(panel.querySelector('[data-log-task-go] strong').textContent,'Thema');
  assert.equal(panel.querySelector('[data-log-task-go] span').textContent,'Sub');
  panel.querySelector('[data-log-task-go-button]').click();
  assert.equal(started.themeId,'theme-local');assert.equal(started.subthemeId,'sub-local');

  time=get(TIME);time.locationActions=[];set(TIME,time);started=null;
  assert.equal(w.LogScanDispatcher.classify(code).kind,'card','without executable meaning the stored card is the fallback');
  assert.equal(w.LogCode.parse(code),null,'plain stored card content falls through to card recognition');

  set(KM,{cards:[]});
  assert.equal(w.LogScanDispatcher.classify(taskCode).kind,'task','a task code is resolved by the canonical LogCode resolver');
  w.LogCode.preview({kind:'log-task',version:1,id:taskCode});
  panel=d.querySelector('dialog');
  assert.ok(panel.querySelector('[data-log-task-go-button]'),'task code uses the same compact Go confirmation');
  panel.querySelector('[data-log-task-go-button]').click();
  assert.equal(started.themeId,'theme-local');assert.equal(started.subthemeId,'sub-local');

  const config=JSON.stringify({kind:'log-code',version:1,title:'Configuratie',entities:[{type:'theme',id:'ThemeCode001',name:'Nieuw'}],actions:[]});
  const sharedConfig={kind:'shared-card',id:'ShareCode001',rootType:'card',rootSourceId:'source-card',objects:{cards:[{id:'source-card',value:config}]}};
  previewed=null;sharedPreviewCalls=0;
  w.LogSharedCard.preview(sharedConfig);
  assert.equal(previewed.kind,'log-code','a shared card carrying configuration opens the import confirmation directly');
  assert.equal(sharedPreviewCalls,0,'the configuration carrier card itself is not offered for storage');

  time=get(TIME);time.locationActions=[{id:'rule',name:'Start taak',trigger:'qr',logCodeId:code,actionCodeId:code,type:'task',selection:'fixed',targetId:'theme-local',subthemeId:'sub-local',repeatMode:'scan',enabled:true,days:[]}];set(TIME,time);started=null;sharedPreviewCalls=0;
  const sharedAction={kind:'shared-card',id:'ShareCode002',rootType:'card',rootSourceId:'action-card',objects:{cards:[{id:'action-card',value:code}]}};
  w.LogSharedCard.preview(sharedAction);
  await new Promise(resolve=>setTimeout(resolve,0));
  panel=d.querySelector('dialog');
  assert.ok(panel.querySelector('[data-log-task-go-button]'),'shared action carrier also uses compact Go confirmation');
  assert.equal(sharedPreviewCalls,0,'an executable action carrier is not stored as a card');

  console.log('Central scan dispatcher: executable-first priority, compact Go task confirmation and shared carrier unwrapping passed.');
  dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1});
