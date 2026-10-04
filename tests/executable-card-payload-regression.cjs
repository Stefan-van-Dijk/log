const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..');
const dom=new JSDOM('<body></body>',{runScripts:'outside-only',url:'https://example.test'}),w=dom.window,d=w.document;
let prepared=null,originalPreview=null,cards=[];
const TIME='urenregistratie.test.pwa.v1',KM='kmreg-test-v4-data';
const readTime=()=>JSON.parse(w.localStorage.getItem(TIME)||'{}');

w.LogCardsUI={
  sheet(title,body){d.body.innerHTML=`<dialog class="cards-dialog" open><div class="cards-dialog-body"><h2>${title}</h2>${body}<p class="cards-message"></p></div></dialog>`;return d.querySelector('.cards-dialog-body')},
  close(){d.body.innerHTML='';}
};
w.LogTimeModule={prepareFromCode(args){prepared=args;}};
w.LogSharedConfig={hasConfiguration(){return false;},openByIdentifier(){throw Error('unexpected shared config open');}};
w.LogCardData={snapshot(){return {cards};}};
w.LogCardsModule={show(id){const card=cards.find(item=>item.id===id);if(!card)return false;d.body.innerHTML=`<dialog class="cards-dialog" open><div class="cards-dialog-body"><div class="code-surface"></div><details class="cards-content-details"><summary>Inhoud bekijken</summary></details><p class="cards-message"></p></div></dialog>`;return true;}};
w.LogLocationActions={snapshot(){return {rules:[],km:JSON.parse(w.localStorage.getItem(KM)||'{}')}} ,validate(){},inTime(){return true;}};
w.LogModuleVisibility={enabled(){return true;}};
w.LogCode={
  parse(value){const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'?parsed:null;},
  preview(payload){originalPreview=payload;return payload;},
  resolveTask(id){
    if(!/^[A-Za-z0-9_-]{12}$/.test(id||''))throw Error('Ongeldige taakidentifier.');
    const time=readTime();
    const matches=[...(time.themes||[]).map(theme=>({theme})),...(time.subthemes||[]).map(sub=>({sub}))].filter(item=>[
      item.theme?.logCodeId,item.theme?.taskCodeId,item.theme?.id,item.sub?.logCodeId,item.sub?.taskCodeId,item.sub?.id
    ].includes(id));
    if(!matches.length)throw Error('Deze Log-code is nog niet geconfigureerd.');
    if(matches.length!==1)throw Error('Deze Log-code is niet eenduidig geconfigureerd.');
    const sub=matches[0].sub||null,theme=sub?(time.themes||[]).find(item=>item.id===sub.themeId):matches[0].theme;
    if(!theme)throw Error('Het hoofdthema van deze taak is niet beschikbaar.');
    return {theme,sub};
  }
};

w.localStorage.setItem(KM,JSON.stringify({cards:[]}));
w.eval(fs.readFileSync(path.join(base,'shared-config-bridge.js'),'utf8'));
w.eval(fs.readFileSync(path.join(base,'qr-action-direct.js'),'utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));

const validConfig=JSON.stringify({kind:'log-code',version:1,title:'KIP',entities:[
  {type:'theme',logCodeId:'KIP000000001',name:'KIP'},
  {type:'subtheme',logCodeId:'5smOhKCcmuEg',name:'API',themeId:'KIP000000001'}
],actions:[]});
const parsed=w.LogCode.parse(validConfig);
assert.equal(parsed.entities[0].id,'KIP000000001');
assert.equal(parsed.entities[1].id,'5smOhKCcmuEg');
assert.throws(()=>w.LogCode.parse(JSON.stringify({kind:'log-code',version:1,entities:[{type:'theme',id:'too-short',name:'X'}],actions:[]})),/exact 12 tekens/);

w.localStorage.setItem(TIME,JSON.stringify({
  themes:[{id:'local-theme',name:'KIP'}],
  subthemes:[{id:'local-sub',themeId:'local-theme',name:'API',logCodeId:'5smOhKCcmuEg'}]
}));
w.LogCode.preview({kind:'log-task',version:1,id:'5smOhKCcmuEg'});
assert.match(d.body.textContent,/Taak herkend/);
d.querySelector('[data-log-task-start]').click();
assert.equal(prepared.themeId,'local-theme');
assert.equal(prepared.subthemeId,'local-sub');
assert.equal(prepared.locationName,'');
assert.equal(prepared.note,'API');

prepared=null;
w.LogCode.preview({kind:'log-task',version:1,id:'ABCDEFGHIJKL'});
assert.match(d.body.textContent,/nog niet geconfigureerd/);
assert.equal(prepared,null);

w.localStorage.setItem(TIME,JSON.stringify({
  themes:[{id:'theme-only',name:'Alleen thema',logCodeId:'ABCDEFGHIJKL'}],
  subthemes:[]
}));
w.LogCode.preview({kind:'log-task',version:1,id:'ABCDEFGHIJKL'});
assert.match(d.body.textContent,/Taak herkend/,'theme and subtheme task codes use the same canonical resolver');
d.querySelector('[data-log-task-start]').click();
assert.equal(prepared.themeId,'theme-only');
assert.equal(prepared.subthemeId,'');

(async()=>{
  cards=[{id:'ordinary',name:'Gewoon',value:'hello'}];
  w.LogCardsModule.show('ordinary');await new Promise(r=>setTimeout(r,5));
  assert.equal(d.querySelector('[data-executable-card-action]'),null);

  cards=[{id:'config',name:'Configuratie',value:validConfig}];
  w.LogCardsModule.show('config');await new Promise(r=>setTimeout(r,5));
  const configButton=d.querySelector('[data-executable-card-action]');
  assert.equal(configButton.textContent,'Configuratie toepassen');
  assert.match(d.body.textContent,/alleen de informatiedrager/);
  configButton.click();
  assert.equal(originalPreview.kind,'log-code');

  w.localStorage.setItem(TIME,JSON.stringify({themes:[{id:'local-theme',name:'KIP'}],subthemes:[{id:'local-sub',themeId:'local-theme',name:'API',logCodeId:'5smOhKCcmuEg'}]}));
  cards=[{id:'task',name:'Taak',value:JSON.stringify({kind:'log-task',version:1,id:'5smOhKCcmuEg'})}];
  w.LogCardsModule.show('task');await new Promise(r=>setTimeout(r,5));
  const taskButton=d.querySelector('[data-executable-card-action]');
  assert.equal(taskButton.textContent,'Taak starten');
  taskButton.click();
  assert.match(d.body.textContent,/Taak herkend/);

  w.localStorage.setItem(TIME,JSON.stringify({themes:[{id:'t',name:'T'}],subthemes:[{id:'s1',themeId:'t',name:'1',logCodeId:'5smOhKCcmuEg'},{id:'s2',themeId:'t',name:'2',logCodeId:'5smOhKCcmuEg'}]}));
  w.LogCode.preview({kind:'log-task',version:1,id:'5smOhKCcmuEg'});
  assert.match(d.body.textContent,/niet eenduidig/);

  console.log('Executable card payloads: persistent IDs, canonical theme/subtheme task resolution, stored-card actions and ambiguity guard passed.');
  dom.window.close();
})().catch(error=>{console.error(error);process.exitCode=1;});