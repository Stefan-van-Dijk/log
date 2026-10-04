const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const dom=new JSDOM('<body><div id="modal" hidden><div id="modalPanel"></div></div><div id="cards"></div></body>',{url:'https://example.test/test/',runScripts:'outside-only'}),w=dom.window,d=w.document,key='urenregistratie.test.pwa.v1';
w.TextEncoder=TextEncoder;let generated=null,section=null;
const get=()=>JSON.parse(w.localStorage.getItem(key)),set=x=>w.localStorage.setItem(key,JSON.stringify(x));
const entry={id:'history',themeId:'old',themeName:'Bestaand',note:'Bewaren',dateISO:'2026-01-01T12:00:00.000Z',ownMinutes:60};
set({themes:[{id:'old',name:'Bestaand',logCodeId:'legacy-long-identifier',color:'#112233'}],subthemes:[],entries:[entry],timer:{status:'inactive'},settings:{custom:true},locationActions:[{id:'keep'}]});
w.eval(fs.readFileSync(path.join(__dirname,'../time/app.js'),'utf8')+'\nrender=()=>{};toast=message=>{window.lastToast=message;};');
w.LogCardsUI={sheet(title,body){d.querySelector('#cards').innerHTML=`<section><h2>${title}</h2>${body}</section>`;return d.querySelector('#cards section')},close(){d.querySelector('#cards').innerHTML=''},edit(id,card){generated=card}};
w.addEventListener('kmreg-test-shell-select-section',e=>section=e.detail.section);
w.eval(fs.readFileSync(path.join(__dirname,'../log-code.js'),'utf8'));const api=w.LogCode;
const config={kind:'log-code',version:1,title:'KIP',entities:[{type:'theme',id:'KIP1a0000000',name:'1a – Procesanalyse'},{type:'subtheme',id:'KIP1aSUB0001',themeId:'KIP1a0000000',name:'Analyse gebruikersproces'}],actions:[]};
w.eval(fs.readFileSync(path.join(__dirname,'../location-actions.js'),'utf8'));
const parsed=api.parse(JSON.stringify(config));api.preview(parsed);assert.equal(get().themes.length,1);d.querySelector('[data-import-code]').click();
const imported=w.localStorage.getItem(key);api.commit(parsed);assert.equal(w.localStorage.getItem(key),imported);assert.deepEqual(get().entries,[entry]);assert.equal(get().settings.custom,true);assert.equal(get().locationActions[0].id,'keep');
const theme=get().themes.find(t=>t.logCodeId==='KIP1a0000000'),sub=get().subthemes[0];
for(const [id,subId] of [['KIP1a0000000',''],['KIP1aSUB0001',sub.id]]){
  const code=api.parse(JSON.stringify({kind:'log-task',version:1,id}));assert.equal(api.parse('log-task:'+id).id,id);
  api.preview(code);assert.equal(get().timer.status,'inactive');d.querySelector('[data-qr-run]').click();
  assert.equal(section,'time');assert.equal(d.querySelector('#startTheme').value,theme.id);assert.equal(d.querySelector('#startSubtheme').value,subId);assert.equal(get().timer.status,'inactive','opening must not start');
  d.querySelector('#confirmStart').click();assert.equal(get().timer.status,'active');assert.equal(get().timer.subthemeId,subId||null);assert.equal(get().timer.note,subId?sub.name:'');
  const state=get();state.timer={status:'inactive'};set(state);
}
// An explicit theme with no subtheme must not inherit a previous suggestion.
let state=get();state.entries.push({...entry,id:'suggestion',themeId:theme.id,themeName:theme.name,subthemeId:sub.id,subthemeName:sub.name,dateISO:new Date().toISOString()});set(state);
w.LogTimeModule.prepareFromCode({themeId:theme.id,subthemeId:''});assert.equal(d.querySelector('#startSubtheme').value,'');
d.querySelector('#startTheme').value='old';d.querySelector('#startTheme').dispatchEvent(new w.Event('change'));assert.equal(d.querySelector('#startSubtheme').options.length,1);
const beforeUnknown=w.localStorage.getItem(key);api.preview(api.parse('log-task:UNKNOWN00000'));assert.match(d.querySelector('#cards').textContent,/Deze Log-code is nog niet geconfigureerd/);assert.ok(d.querySelector('[data-task-back]'));assert.equal(w.localStorage.getItem(key),beforeUnknown);
for(const id of ['short','1234567890123','!!!!!!!!!!!!'])assert.throws(()=>api.parse(JSON.stringify({kind:'log-task',version:1,id})));
// Build all four independent KIP configurations, preserving existing IDs.
for(const id of ['KIP000000000','KIP1a0000000','KIP2b0000000','KIP2d0000000']){
 api.configBuilder();const f=d.querySelector('#cards form');f.elements.theme.value=id;f.elements.theme.onchange();f.elements.subs.value+='\nExtra\nExtra';f.dispatchEvent(new w.Event('submit',{cancelable:true}));assert.ok(d.querySelector('[data-save-config]'));d.querySelector('[data-save-config]').click();const built=api.parse(generated.value);assert.equal(built.entities.filter(e=>e.name==='Extra').length,1);const snapshot=w.localStorage.getItem(key);api.commit(built);assert.equal(w.localStorage.getItem(key),snapshot);
}
api.configBuilder();let f=d.querySelector('#cards form');f.elements.theme.value='local-0';f.elements.theme.onchange();f.dispatchEvent(new w.Event('submit',{cancelable:true}));d.querySelector('[data-save-config]').click();assert.equal(get().themes[0].logCodeId,'legacy-long-identifier');assert.equal(get().themes[0].taskCodeId.length,12);assert.equal(api.resolveTask(get().themes[0].taskCodeId).theme.id,'old');
for(const subId of ['',sub.id]){api.taskBuilder();f=d.querySelector('#cards form');f.elements.theme.value=theme.id;f.elements.theme.onchange();f.elements.sub.value=subId;f.dispatchEvent(new w.Event('submit',{cancelable:true}));const code=api.parse(generated.value);assert.equal(code.kind,'log-action');assert.equal(code.id.length,12);assert.equal(api.resolveTask(code.id).sub?.id||'',subId);}
// Conflict: never move a subtheme to another theme or overwrite a local name.
const changed=structuredClone(config);changed.entities[0].name='Remote rename';api.commit(api.parse(JSON.stringify(changed)));assert.equal(get().themes.find(t=>t.id===theme.id).name,theme.name);
const wrong=structuredClone(config);wrong.entities[0].id='OTHER0000000';wrong.entities[0].name='Other';wrong.entities[1].themeId='OTHER0000000';const snapshot=w.localStorage.getItem(key);assert.throws(()=>api.commit(api.parse(JSON.stringify(wrong))),/ander hoofdthema/);assert.equal(w.localStorage.getItem(key),snapshot);
// A task started in another tab between preview and confirmation must survive.
w.LogTimeModule.prepareFromCode({themeId:theme.id});state=get();state.timer={status:'active',sessionId:'other-tab',themeId:'old',note:'Keep'};set(state);d.querySelector('#confirmStart').click();assert.equal(get().timer.sessionId,'other-tab');assert.match(w.lastToast,/loopt nog een taak/);assert.throws(()=>w.LogTimeModule.prepareFromCode({themeId:theme.id}),/loopt nog een taak/);
assert.equal(get().entries[0].id,'history');console.log('Task QR: configurations, 12-character IDs, optional subtheme, guarded confirmation, deduplication, legacy IDs, unknown codes and preserved history passed.');dom.window.close();


