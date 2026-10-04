const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),TIME='urenregistratie.test.pwa.v1',KM='kmreg-test-v4-data';
const dom=new JSDOM('<body></body>',{url:'https://stefan-van-dijk.github.io/log/test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
const get=k=>JSON.parse(w.localStorage.getItem(k)||'{}'),set=(k,v)=>w.localStorage.setItem(k,JSON.stringify(v)),q=s=>d.querySelector(s);
const fixture={type:'log-config-example',schemaVersion:1,version:1,logCodeId:'Bwv2g6f5g5vJ',title:'KIP – 1a – Procesanalyse',themes:[{logCodeId:'GG9b54QuWb46',name:'1a – Procesanalyse',subthemes:[{logCodeId:'77knQ72rQZJD',name:'Analyse gebruikersproces'}]}],actions:[{logCodeId:'OpjQSf3XP_K5',title:'Procesanalyse algemeen',trigger:'qr',action:'start-task',themeLogCodeId:'GG9b54QuWb46',subthemeLogCodeId:null,requireConfirmation:true},{logCodeId:'MYMn31HyZqcs',title:'Analyse gebruikersproces',trigger:'qr',action:'start-task',themeLogCodeId:'GG9b54QuWb46',subthemeLogCodeId:'77knQ72rQZJD',requireConfirmation:true}]};
const initial={themes:[{id:'existing',name:'Bestaand'}],entries:[{id:'keep'}],timer:{status:'active',sessionId:'keep'},settings:{custom:true}};
set(TIME,initial);set(KM,{trips:[{id:'keep-trip'}],cards:[]});let prepared=null,calls=0;
w.LogTimeModule={reloadFromStorage(){},getView:()=> 'home',prepareFromCode(a){prepared=a}};w.LogModuleVisibility={enabled:()=>true};
w.LogCardData={snapshot:()=>get(KM),save(cards){set(KM,{...get(KM),cards})}};
for(const file of ['log-code.js','cards.js','location-actions.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8'));
const api=w.LogCode,preview=id=>api.preview(api.parse(id)),response=(data=fixture,status=200,type='application/json')=>({ok:status===200,status,headers:{get:n=>n==='content-type'?type:null},text:async()=>typeof data==='string'?data:JSON.stringify(data)});
const respond=(data=fixture,status=200,type)=>w.fetch=async(url,options)=>{calls++;assert.equal(url,`https://sharon.life/log/config/${fixture.logCodeId}.json`);assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');return response(data,status,type)};
(async()=>{
 respond();const before=w.localStorage.getItem(TIME);await preview(fixture.logCodeId);
 assert.equal(w.localStorage.getItem(TIME),before,'fetch and preview do not write');assert.equal(prepared,null);
 assert.match(q('dialog').textContent,/Gedeelde configuratie/);assert.match(q('dialog').textContent,/Procesanalyse algemeen/);assert.match(q('dialog').textContent,/Zonder subthema/);
 q('[data-import-code]').click();let imported=get(TIME);assert.equal(imported.themes.length,2);assert.equal(imported.subthemes.length,1);assert.equal(imported.logConfigurations[0].id,fixture.logCodeId);assert.equal(imported.entries[0].id,'keep');assert.equal(imported.timer.sessionId,'keep');assert.equal(get(KM).trips[0].id,'keep-trip');assert.equal(prepared,null);
 const stored=w.localStorage.getItem(TIME);w.fetch=async()=>{throw Error('must remain offline')};await preview(fixture.logCodeId);q('[data-import-code]').click();assert.equal(w.localStorage.getItem(TIME),stored,'repeat import is idempotent');assert.equal(calls,1);
 await preview(fixture.actions[0].logCodeId);q('[data-qr-run]').click();assert.equal(prepared.themeId,imported.themes[1].id);assert.equal(prepared.subthemeId,'');
 await preview(fixture.actions[1].logCodeId);q('[data-qr-run]').click();assert.equal(prepared.subthemeId,imported.subthemes[0].id);
 // A local paused action must not cause an online fetch or bypass pause.
 imported=get(TIME);imported.locationActions.find(a=>a.logCodeId===fixture.actions[0].logCodeId).enabled=false;set(TIME,imported);prepared=null;await preview(fixture.actions[0].logCodeId);assert.match(q('dialog').textContent,/Uitgeschakeld/);assert.equal(prepared,null);
 // Retain local names and current records when using the cached config.
 imported.themes[1].name='Lokale naam';set(TIME,imported);await preview(fixture.logCodeId);q('[data-import-code]').click();assert.equal(get(TIME).themes[1].name,'Lokale naam');assert.equal(get(TIME).locationActions.find(a=>a.logCodeId===fixture.actions[0].logCodeId).enabled,false);
 // Errors leave storage untouched and always provide a way back.
 for(const [data,status,type,match] of [[{},404,undefined,/niet gevonden/],['bad json',200,undefined,/ongeldige JSON/],[fixture,200,'text/html',/geen JSON/],[{...fixture,logCodeId:'AnotherID001'},200,undefined,/identifier/],[{...fixture,schemaVersion:2},200,undefined,/versie/]]){
   set(TIME,initial);respond(data,status,type);await preview(fixture.logCodeId);assert.match(q('[data-online-status]').textContent,match);assert.ok(q('[data-task-back]'));assert.equal(w.localStorage.getItem(TIME),JSON.stringify(initial));
 }
 set(TIME,initial);w.fetch=async()=>{throw new w.TypeError('network')};await preview(fixture.logCodeId);assert.match(q('[data-online-status]').textContent,/Geen verbinding/);
 const invalid=structuredClone(fixture);invalid.actions[1].subthemeLogCodeId='MissingSub01';respond(invalid);await preview(fixture.logCodeId);assert.match(q('[data-online-status]').textContent,/Subthema/);
 const duplicate=structuredClone(fixture);duplicate.actions[0].logCodeId=duplicate.themes[0].logCodeId;respond(duplicate);await preview(fixture.logCodeId);assert.match(q('[data-online-status]').textContent,/uniek/);
 // Conflict during planning stays visible rather than leaving a loading dialog.
 set(TIME,{...initial,locationActions:[{id:'conflict',logCodeId:fixture.actions[0].logCodeId,type:'task',targetId:'existing'}]});respond();await preview(fixture.logCodeId);assert.match(q('[data-online-status]').textContent,/andere koppeling/);
 // Closing a pending request must never reopen the import or write storage.
 set(TIME,initial);let finish;w.fetch=()=>new Promise(resolve=>{finish=resolve});const pending=preview(fixture.logCodeId);q('[data-task-back]').click();finish(response());await pending;assert.equal(q('dialog'),null);assert.equal(w.localStorage.getItem(TIME),JSON.stringify(initial));
 // The canonical existing log-code format is also accepted with a config ID.
 respond({kind:'log-code',version:1,configVersion:2,logCodeId:fixture.logCodeId,title:'Configuratie',entities:[{type:'theme',id:'GG9b54QuWb46',name:'Thema'}],actions:[]});await preview(fixture.logCodeId);assert.ok(q('[data-import-code]'));q('[data-import-code]').click();assert.equal(get(TIME).logConfigurations[0].version,2);
 // Reload the implementation: no in-memory state is needed to find the config.
 w.eval(fs.readFileSync(path.join(base,'log-code.js'),'utf8'));w.fetch=()=>{throw Error('offline')};w.LogCode.preview(w.LogCode.parse(fixture.logCodeId));assert.ok(q('[data-import-code]'));
 console.log('Online configuration: confirmed imports, local-first/offline, repeat imports, main/subtheme actions, preservation, pause, errors, conflicts, cancellation and reload passed.');dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1});
