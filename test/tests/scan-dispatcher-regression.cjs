const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),TIME='urenregistratie.test.pwa.v1',KM='kmreg-test-v4-data';
const dom=new JSDOM('<body></body>',{url:'https://example.test/test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
const set=(key,value)=>w.localStorage.setItem(key,JSON.stringify(value)),get=key=>JSON.parse(w.localStorage.getItem(key)||'{}');
const code='ActionCode01',taskCode='TaskCode0001';
let prepared=null;
set(KM,{cards:[{id:'AbCd123_',name:'Zelfde inhoud',value:code,format:'QR_CODE'}]});
set(TIME,{themes:[{id:'theme-local',name:'Thema'}],subthemes:[{id:'sub-local',themeId:'theme-local',name:'Sub',logCodeId:taskCode}],locationActions:[{id:'rule',name:'Start taak',trigger:'qr',logCodeId:code,type:'task',selection:'fixed',targetId:'theme-local',subthemeId:'sub-local',repeatMode:'scan',enabled:true,days:[]}]});

function sheet(title,html){const dialog=d.createElement('dialog');dialog.innerHTML=`<h2>${title}</h2>${html}`;d.body.appendChild(dialog);return dialog;}
w.LogCardsUI={sheet,close(){d.querySelector('dialog')?.remove();}};
w.LogCardsModule={show(){return true;}};
w.LogLocationActions={snapshot(){const time=get(TIME);return {rules:time.locationActions||[],km:get(KM)};},validate(){},inTime(){return true;}};
w.LogTimeModule={prepareFromCode(value){prepared=value;}};
w.LogModuleVisibility={enabled(){return true;}};
w.LogSharedConfig={hasConfiguration(){return false;}};
w.LogCode={
  parse(value){if(/^[A-Za-z0-9_-]{12}$/.test(value))return {kind:'log-action',version:1,id:value};return null;},
  preview(){return null;},
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
  assert.equal(w.LogScanDispatcher.classify(code).kind,'action','executable action code wins even when a card stores the same content');
  assert.deepEqual(w.LogCode.parse(code),{kind:'log-action',version:1,id:code});
  await w.LogLocationActions.scanCode(code);
  assert.equal(prepared.themeId,'theme-local');assert.equal(prepared.subthemeId,'sub-local');

  time=get(TIME);time.locationActions=[];set(TIME,time);prepared=null;
  assert.equal(w.LogScanDispatcher.classify(code).kind,'card','without executable meaning the stored card is the fallback');
  assert.equal(w.LogCode.parse(code),null,'plain stored card content falls through to card recognition');

  set(KM,{cards:[]});
  assert.equal(w.LogScanDispatcher.classify(taskCode).kind,'task','a task code is resolved by the canonical LogCode resolver');
  const panel=w.LogCode.preview({kind:'log-task',version:1,id:taskCode});
  panel.querySelector('[data-log-task-start]').click();
  assert.equal(prepared.themeId,'theme-local');assert.equal(prepared.subthemeId,'sub-local');

  console.log('Central scan dispatcher: executable precedence, card fallback, actionCodeId migration, direct action dispatch and canonical task resolution passed.');
  dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1});
