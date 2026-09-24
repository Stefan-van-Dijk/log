const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');const base=path.resolve(__dirname,'..');
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.TextEncoder=TextEncoder;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
let data={cards:[{id:'a',name:'Werkplek',value:'00123',format:'QR_CODE',color:'#123456',locationId:'l'}],locations:[{id:'l',name:'Kantoor'}]},starts=0,opened=null;
const catalog={themes:[{id:'t',name:'Montage'}],subthemes:[{id:'s',themeId:'t',name:'Gevel'}]};
w.LogCardData={snapshot:()=>structuredClone(data),save:cards=>{data.cards=structuredClone(cards)}};
w.LogTimeModule={getThemeCatalog:()=>catalog,startFromCard:a=>{assert.equal(a.subthemeId,'s');assert.equal(a.locationName,'Kantoor');starts++}};
w.LogCardActions={openLocation:id=>{opened=id;w.LogCardsModule.unmount();return true}};
for(const f of ['vendor/qrcode-2.0.4.js','vendor/jsbarcode-3.12.1.min.js','vendor/zxing-0.21.3.min.js'])w.eval(fs.readFileSync(path.join(base,f),'utf8'));
w.eval(fs.readFileSync(path.join(base,'cards.js'),'utf8').replace('window.LogCardsModule={','window.LogCardsModule={accept,edit,'));
const q=s=>d.querySelector(s),click=s=>q(s).click(),scan=value=>w.LogCardsModule.accept({getText:()=>value,getBarcodeFormat:()=>w.ZXing.BarcodeFormat.QR_CODE});
w.LogCardsModule.mount(q('#root'));
scan('00123');assert.match(q('.cards-recognized').textContent,/Code herkend/);assert.equal(q('#cardForm'),null);assert.equal(data.cards.length,1);click('[data-card-close]');
scan('123');assert.ok(q('#cardForm'),'leading zeros remain significant');click('[data-card-close]');
w.LogCardsModule.edit('a');q('[name=actionType]').value='task';q('[name=actionType]').dispatchEvent(new w.Event('change'));q('[name=actionTheme]').value='t';q('[name=actionTheme]').dispatchEvent(new w.Event('change'));q('[name=actionSubtheme]').value='s';q('form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.deepEqual(data.cards[0].scanAction,{type:'task',themeId:'t',subthemeId:'s'});click('[data-card-close]');
scan('00123');assert.equal(starts,0,'scan never starts a task without confirmation');assert.match(q('[data-run-card-action]').textContent,/Start Gevel bij Kantoor/);click('[data-run-card-action]');assert.equal(starts,1);assert.equal(q('dialog'),null);
catalog.subthemes=[];scan('00123');click('[data-run-card-action]');assert.equal(starts,1);assert.match(q('[data-card-message]').textContent,/subthema/);click('[data-card-close]');
data.cards[0].scanAction={type:'location'};scan('00123');assert.equal(opened,null);click('[data-run-card-action]');assert.equal(opened,'l');
w.LogCardsModule.mount(q('#root'));data.locations=[];scan('00123');click('[data-run-card-action]');assert.match(q('[data-card-message]').textContent,/locatie/);click('[data-card-close]');
data.cards.push({...data.cards[0],id:'b',name:'Tweede kaart'});scan('00123');assert.equal(d.querySelectorAll('[data-recognized-card]').length,2);assert.equal(q('[data-run-card-action]'),null);click('[data-recognized-card="b"]');assert.equal(q('h2').textContent,'Tweede kaart');click('[data-card-close]');
scan('<img onerror=alert(1)>');assert.ok(q('#cardForm'));assert.equal(q('[name=value]').value,'<img onerror=alert(1)>');assert.equal(d.querySelector('img'),null);
// Exercise the real time bridge against persisted active/pending state and failed writes.
const source=fs.readFileSync(path.join(base,'time/app.js'),'utf8');
let persisted={timer:{status:'inactive'},themes:[{id:'t'}],subthemes:[{id:'s',themeId:'t'}]},fail=false;
const context={state:null,loadState:()=>structuredClone(persisted),startTimer:()=>{if(fail)throw Error('quota');persisted.timer.status='active'}};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function startFromCard('),source.indexOf('window.LogTimeModule =')),context);
for(const status of ['active','pending']){persisted.timer.status=status;assert.throws(()=>context.startFromCard({themeId:'t',subthemeId:'s'}),/Rond die eerst af/);assert.equal(persisted.timer.status,status)}
persisted.timer.status='inactive';assert.throws(()=>context.startFromCard({themeId:'missing'}),/niet meer beschikbaar/);fail=true;assert.throws(()=>context.startFromCard({themeId:'t'}),/quota/);assert.equal(context.state.timer.status,'inactive');fail=false;context.startFromCard({themeId:'t',subthemeId:'s'});assert.equal(persisted.timer.status,'active');assert.throws(()=>context.startFromCard({themeId:'t'}),/Rond die eerst af/);
console.log('Scan actions: recognition, unknown/ambiguous codes, exact values, saved configuration, confirmation, missing targets, active-task protection and storage failure passed.');dom.window.close();
