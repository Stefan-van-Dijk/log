'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),KM='kmreg-test-v4-data',TIME='urenregistratie.test.pwa.v1';
const dom=new JSDOM('<body><main></main></body>',{url:'https://stefan-van-dijk.github.io/log/test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
const get=k=>JSON.parse(w.localStorage.getItem(k)||'{}'),set=(k,v)=>w.localStorage.setItem(k,JSON.stringify(v));
set(KM,{trips:[{id:'ride-keep'}],trackPoints:[{id:'gps-keep'}],settings:{name:'Keep me'},locations:[{id:'own-location',name:'Eigen locatie'}],cards:[]});
set(TIME,{entries:[{id:'entry-keep'}],timer:{status:'running'},themes:[{id:'own-theme',name:'Eigen thema'}],subthemes:[]});
let shown='';
w.LogCardsUI={
  validate(){},renderCode(){},close(){d.querySelector('[data-test-sheet]')?.remove();},
  sheet(title,html){const panel=d.createElement('section');panel.dataset.testSheet='1';panel.innerHTML=`<h2>${title}</h2>${html}`;d.body.appendChild(panel);return panel;}
};
w.LogCardsModule={show(id){shown=id;return true;}};
w.LogTimeModule={reloadFromStorage(){},getView:()=> 'home'};
w.LogModuleVisibility={enabled:()=>true};
w.eval(fs.readFileSync(path.join(base,'shared-card-import.js'),'utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));

const documentFor=(name='Bronkaart',value='ABC-001',locationName='Entree',themeName='Werk')=>({
  schema:'https://sharon.life/log/config/v1',kind:'log-config',id:'CardUpdate01',exportedAt:new Date().toISOString(),root:{type:'card',sourceId:'source-card'},source:{app:'Log',build:'source'},
  objects:{
    locations:[{id:'source-root',name:'Kantoor'},{id:'source-sub',name:locationName,parentId:'source-root'}],
    themes:[{id:'source-theme',name:themeName,color:'#123456',includeInTotals:true}],
    subthemes:[{id:'source-subtheme',themeId:'source-theme',name:'Controle'}],
    cards:[{id:'source-card',name,format:'QR_CODE',value,color:'#654321',locationId:'source-sub',scanAction:{type:'task',themeId:'source-theme',subthemeId:'source-subtheme'}}],
    actions:[]
  }
});
const response=doc=>({ok:true,status:200,json:async()=>doc});

(async()=>{
  assert.equal(w.LogSharedCard.updateMode(),'auto','automatisch controleren is de standaard');
  w.LogSharedCard.setUpdateMode('manual');

  const first=w.LogSharedCard.validate(documentFor(),'CardUpdate01');
  const card=w.LogSharedCard.commit(first);
  assert.equal(card.name,'Bronkaart');
  assert.equal(w.LogSharedCard.updateAvailable(card.id),false);

  const beforeKm=structuredClone(get(KM)),beforeTime=structuredClone(get(TIME));
  const changed=documentFor('Bronkaart vernieuwd','ABC-002','Nieuwe entree','Werk vernieuwd');
  let calls=0;w.fetch=async(url,options)=>{calls++;assert.equal(url,'https://sharon.life/log/config/CardUpdate01.json');assert.equal(options.cache,'no-store');return response(changed);};

  const result=await w.LogSharedCard.checkAll({manual:true,force:true});
  assert.equal(result.updates,1);assert.equal(calls,1);assert.equal(w.LogSharedCard.updateAvailable(card.id),true);
  assert.equal(get(KM).cards.find(x=>x.id===card.id).name,'Bronkaart','controle overschrijft lokaal nog niets');
  assert.deepEqual(get(KM).trips,beforeKm.trips);assert.deepEqual(get(KM).trackPoints,beforeKm.trackPoints);assert.deepEqual(get(TIME).timer,beforeTime.timer);

  await w.LogSharedCard.openUpdateForCard(card.id);
  const panel=d.querySelector('[data-test-sheet]');assert.ok(panel);assert.match(panel.textContent,/Kaartupdate beschikbaar/);assert.match(panel.textContent,/Kaart bijwerken/);
  panel.querySelector('[data-shared-import]').click();

  const afterKm=get(KM),afterTime=get(TIME),updated=afterKm.cards.find(x=>x.id===card.id);
  assert.equal(updated.id,card.id);assert.equal(updated.name,'Bronkaart vernieuwd');assert.equal(updated.value,'ABC-002');
  assert.equal(afterKm.locations.find(x=>x.id===updated.locationId).name,'Nieuwe entree');
  assert.equal(afterTime.themes.find(x=>x.id===updated.scanAction.themeId).name,'Werk vernieuwd');
  assert.deepEqual(afterKm.trips,beforeKm.trips);assert.deepEqual(afterKm.trackPoints,beforeKm.trackPoints);assert.deepEqual(afterKm.settings,beforeKm.settings);
  assert.deepEqual(afterTime.entries,beforeTime.entries);assert.deepEqual(afterTime.timer,beforeTime.timer);
  assert.equal(w.LogSharedCard.updateAvailable(card.id),false);

  w.LogSharedCard.setUpdateMode('off');
  const skipped=await w.LogSharedCard.checkAll();assert.equal(skipped.skipped,true);assert.equal(w.LogSharedCard.updateAvailable(card.id),false);
  console.log('Shared card updates: default auto policy, explicit update signal, no silent overwrite, confirmed source update and unrelated data preservation passed.');
  w.close();
})().catch(error=>{console.error(error);w.close();process.exitCode=1});
