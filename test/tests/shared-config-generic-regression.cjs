'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');

class Storage{constructor(){this.m=new Map()}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}}
const listeners={};
const document={readyState:'loading',addEventListener(type,fn){(listeners[type]??=[]).push(fn)},querySelector(){return null},querySelectorAll(){return[]},body:{},hidden:false};
const window={localStorage:new Storage(),document,addEventListener(){},dispatchEvent(){},LogCardsUI:{validate(){}},LogTimeModule:{reloadFromStorage(){},getView(){return'home'}},LogLocationActions:{refresh(){}},LogCardsModule:{refresh(){}}};
window.window=window;
const context={window,document,localStorage:window.localStorage,console,URL,AbortController,TextEncoder,TextDecoder,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}},Event:class{constructor(type){this.type=type}},MutationObserver:class{observe(){}},requestAnimationFrame(){},setTimeout,clearTimeout,Intl,Date,JSON,Map,Set,Number,String,Array,Object,RegExp,Math,structuredClone};
vm.createContext(context);
const baseDir=path.resolve(__dirname,'..');
vm.runInContext(fs.readFileSync(path.join(baseDir,'shared-card-import.js'),'utf8'),context);

const localStorage=window.localStorage,KM='kmreg-test-v4-data',TIME='urenregistratie.test.pwa.v1';
localStorage.setItem(KM,JSON.stringify({locations:[],cards:[],trips:[{id:'keep'}],settings:{keep:true}}));
localStorage.setItem(TIME,JSON.stringify({themes:[],subthemes:[],locationActions:[],entries:[{id:'keep'}],timer:{status:'running'}}));
function bundle(id,type,sourceId,objects,title='Test'){return{schema:'https://sharon.life/log/config/v1',kind:'log-config',id,title,root:{type,sourceId},exportedAt:'2026-09-29T10:00:00Z',source:{app:'Log',build:'source'},objects:{locations:[],themes:[],subthemes:[],cards:[],actions:[],...objects}}}

let doc=bundle('LocRoot00001','location','srcLoc',{locations:[{id:'srcLoc',name:'Kantoor',address:'Straat 1',lat:52,lng:6}]});
let payload=window.LogSharedConfig.validate(doc,doc.id),root=window.LogSharedConfig.commit(payload);
assert.equal(root.id,doc.id);
assert.equal(JSON.parse(localStorage.getItem(KM)).locations.find(x=>x.id===doc.id).name,'Kantoor');

doc=bundle('ThemeRoot001','theme','srcTheme',{themes:[{id:'srcTheme',name:'Werk',color:'#112233'}],subthemes:[{id:'srcSub',themeId:'srcTheme',name:'Controle'}]});
payload=window.LogSharedConfig.validate(doc,doc.id);root=window.LogSharedConfig.commit(payload);
let time=JSON.parse(localStorage.getItem(TIME));
assert.equal(root.id,doc.id);
assert.equal(time.subthemes.find(x=>x.sharedSource?.configurationId===doc.id).themeId,doc.id);

doc=bundle('CardRoot0001','card','srcCard',{locations:[{id:'srcL',name:'Entree',lat:52,lng:6}],themes:[{id:'srcT',name:'Bezoek'}],subthemes:[{id:'srcS',themeId:'srcT',name:'Aanmelden'}],cards:[{id:'srcCard',name:'Pas',format:'QR_CODE',value:'ABC',locationId:'srcL',scanAction:{type:'task',themeId:'srcT',subthemeId:'srcS'}}]});
payload=window.LogSharedConfig.validate(doc,doc.id);root=window.LogSharedConfig.commit(payload);
let km=JSON.parse(localStorage.getItem(KM));time=JSON.parse(localStorage.getItem(TIME));
assert.equal(root.id,doc.id);
assert.ok(root.locationId.startsWith('shared:'+doc.id+':location:'));
assert.ok(root.scanAction.themeId.startsWith('shared:'+doc.id+':theme:'));
assert.equal(km.trips[0].id,'keep');assert.equal(time.entries[0].id,'keep');assert.equal(time.timer.status,'running');

doc=bundle('ActionRoot01','action','srcAction',{locations:[{id:'srcHome',name:'Thuis',lat:52,lng:6}],cards:[{id:'srcCard2',name:'Deur',format:'QR_CODE',value:'DOOR',locationId:'srcHome'}],actions:[{id:'srcAction',name:'Toon deurkaart',enabled:true,trigger:'location',locationId:'srcHome',radius:100,type:'card',selection:'fixed',targetId:'srcCard2',repeatMode:'visit',days:[],start:'',end:''}]});
payload=window.LogSharedConfig.validate(doc,doc.id);root=window.LogSharedConfig.commit(payload);
time=JSON.parse(localStorage.getItem(TIME));
assert.equal(root.id,doc.id);
assert.ok(root.targetId.startsWith('shared:'+doc.id+':card:'));
assert.ok(root.locationId.startsWith('shared:'+doc.id+':location:'));
const sharing=JSON.parse(localStorage.getItem('log-test-sharing-v1'));
assert.equal(sharing.roots['action:'+doc.id],doc.id);

const changed=structuredClone(doc);changed.objects.actions[0].name='Nieuwe naam';
context.fetch=window.fetch=async()=>({status:200,ok:true,json:async()=>changed});
(async()=>{
  const before=JSON.parse(localStorage.getItem(TIME)).locationActions.find(x=>x.id===doc.id).name;
  const check=await window.LogSharedConfig.checkAll({manual:true,force:true});
  assert.ok(check.updates>=1);
  assert.equal(JSON.parse(localStorage.getItem(TIME)).locationActions.find(x=>x.id===doc.id).name,before);
  window.LogSharedConfig.commit(window.LogSharedConfig.validate(changed,changed.id),{update:true});
  assert.equal(JSON.parse(localStorage.getItem(TIME)).locationActions.find(x=>x.id===doc.id).name,'Nieuwe naam');
  console.log('Shared configs: locations, themes, cards and actions keep the source identifier; dependencies remain linked; update checks do not overwrite before confirmation.');
})().catch(error=>{console.error(error);process.exitCode=1});