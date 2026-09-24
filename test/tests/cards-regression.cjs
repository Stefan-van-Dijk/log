// Run with jsdom and sharp on NODE_PATH; uses synthetic local data only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const sharp=require('sharp');
const base=path.resolve(__dirname,'..');
const ZXing=require(path.join(base,'vendor/zxing-0.21.3.min.js'));
const dom=new JSDOM('<div id="root"></div>',{runScripts:'outside-only',url:'https://example.test/test/'});
const w=dom.window,d=w.document;
w.TextEncoder=TextEncoder;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
w.HTMLDialogElement.prototype.close=function(){this.open=false};
w.HTMLMediaElement.prototype.pause=function(){};
w.HTMLMediaElement.prototype.play=async function(){};
let state={cards:[],settings:{recognitionRadius:500},locations:[{id:'parent',name:'Kantoor',lat:52,lng:6},{id:'child',name:'Entree',parentId:'parent'},{id:'other',name:'Magazijn',lat:53,lng:7}]};
let failSave=false,stopped=0;
w.LogCardData={snapshot:()=>JSON.parse(JSON.stringify(state)),save(cards){if(failSave)throw Error('Opslag vol');state.cards=JSON.parse(JSON.stringify(cards))}};
for(const file of ['vendor/qrcode-2.0.4.js','vendor/jsbarcode-3.12.1.min.js','vendor/zxing-0.21.3.min.js','cards.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8'));
const q=s=>d.querySelector(s),click=s=>q(s).click(),set=(name,value)=>{q(`[name="${name}"]`).value=value};
const submit=()=>q('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const tick=()=>new Promise(r=>setImmediate(r));
function openNew(){click('[data-cards-new]');set('name','Proefkaart');set('color','#c04d92')}
async function decoded(svg){
 const {data,info}=await sharp(Buffer.from(svg.outerHTML)).flatten({background:'#fff'}).greyscale().raw().toBuffer({resolveWithObject:true});
 return new ZXing.MultiFormatReader().decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.RGBLuminanceSource(new Uint8ClampedArray(data),info.width,info.height)))).getText();
}
(async()=>{
 w.LogCardsModule.mount(q('#root'));
 openNew();const unicode='00123 – café 🏠\nhttps://example.test/?a=1&b=2';set('value',unicode);set('locationId','child');submit();
 assert.equal(state.cards.length,1);assert.equal(state.cards[0].color,'#c04d92');assert.equal(state.cards[0].locationId,'child');
 assert.equal(await decoded(q('[data-code-display] svg')),unicode,'QR SVG round-trips exact Unicode and leading zeros');
 click('[data-card-close]');assert.match(q('[data-cards-list]').textContent,/Kantoor › Entree/);
 openNew();set('value','000123456789');set('format','CODE128');set('locationId','parent');submit();
 assert.equal(state.cards.length,2);assert.equal(await decoded(q('[data-code-display] svg')),'000123456789','Code128 round-trip');click('[data-card-close]');
 openNew();set('value','5901234123457');set('format','EAN13');submit();assert.equal(state.cards.length,3);assert.equal(await decoded(q('[data-code-display] svg')),'5901234123457');click('[data-card-close]');
 openNew();set('value','5901234123458');set('format','EAN13');submit();assert.equal(state.cards.length,3);assert.match(q('[data-card-message]').textContent,/controlecijfer/);click('[data-card-close]');
 openNew();set('value',unicode);set('locationId','child');submit();assert.equal(state.cards.length,3);assert.match(q('[data-card-message]').textContent,/al opgeslagen/);click('[data-card-close]');
 openNew();set('value','new');failSave=true;submit();assert.equal(state.cards.length,3);assert.equal(q('[name=value]').value,'new');assert.match(q('[data-card-message]').textContent,/Opslag vol/);failSave=false;click('[data-card-close]');
 q('[data-cards-location]').value='parent';q('[data-cards-location]').dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('[data-card-open]').length,2);
 q('[data-cards-location]').value='child';q('[data-cards-location]').dispatchEvent(new w.Event('change'));assert.equal(d.querySelectorAll('[data-card-open]').length,2,'sublocation includes parent cards');
 assert.equal(w.LogCardsModule.search('café'),1);assert.equal(w.LogCardsModule.search(''),2);
 const before=q('[data-cards-list]').firstElementChild;w.LogCardsModule.search('');assert.equal(q('[data-cards-list]').firstElementChild,before,'repeat search does not rebuild DOM');
 w.LogCardsModule.unmount();w.LogCardsModule.mount(q('#root'));assert.equal(d.querySelectorAll('[data-card-open]').length,2,'cards remain after remount');
 Object.defineProperty(w.navigator,'geolocation',{value:{getCurrentPosition(success){success({coords:{latitude:52,longitude:6}})}}});click('[data-cards-near]');assert.match(q('[data-cards-notice]').textContent,/2 kaarten/);
 // Camera race: closing while getUserMedia is pending must stop the late stream.
 let resolveMedia;Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>new Promise(r=>resolveMedia=r)}});
 click('[data-cards-scan]');click('[data-camera-start]');click('[data-card-close]');resolveMedia({getTracks:()=>[{stop(){stopped++}}]});await tick();assert.equal(stopped,1);
 // Permission denial leaves a retry and photo input.
 w.navigator.mediaDevices.getUserMedia=async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'})};click('[data-cards-scan]');click('[data-camera-start]');await tick();assert.match(q('[data-card-message]').textContent,/toestemming/);assert.equal(q('[data-camera-start]').disabled,false);assert.ok(q('[data-card-photo]'));click('[data-card-close]');
 // A successfully opened camera also stops on module navigation.
 w.navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop(){stopped++}}]});click('[data-cards-scan]');click('[data-camera-start]');await tick();w.LogCardsModule.unmount();assert.equal(stopped,2);assert.equal(d.querySelector('dialog'),null);
 // Existing main data normalization and persistence retain the new additive field.
 const source=fs.readFileSync(path.join(base,'index.html'),'utf8');
 const normalize=source.slice(source.indexOf('function normalize(x)'),source.indexOf('\nfunction load()'));
 const context={DEFAULT:{settings:{}},payload:JSON.parse(JSON.stringify(state))};vm.createContext(context);vm.runInContext(normalize+'; result=normalize(payload)',context);assert.equal(JSON.stringify(context.result.cards),JSON.stringify(state.cards));
 const older=vm.runInContext('normalize({locations:[]})',context);assert.equal(older.cards.length,0);
 // Complete backup stores the original mobility payload in recovery, including cards.
 const jsonContext={window:{}};vm.createContext(jsonContext);vm.runInContext(fs.readFileSync(path.join(base,'log-json-v2.js'),'utf8'),jsonContext);
 const bundle=jsonContext.window.LogJsonV2.build({appBuild:'test',km:context.result,time:{},model:{cards:[],edges:[]},identities:{},storageKeys:{}});
 assert.equal(JSON.stringify(bundle.recovery.sources.kilometerregistratie.data.cards),JSON.stringify(state.cards));
 vm.runInContext('restored=normalize('+JSON.stringify(bundle.recovery.sources.kilometerregistratie.data)+')',context);
 assert.equal(JSON.stringify(context.restored.cards),JSON.stringify(state.cards));
 // The real main-app bridge rolls back memory when local storage rejects a write.
 const bridge=source.slice(source.indexOf('window.LogCardData='),source.indexOf("function notifyKmStateChange(reason='save')"));
 const bridgeContext={window:{},data:structuredClone(state),clone:structuredClone,reloadKilometerData(){},save(){throw Error('quota')}};
 vm.createContext(bridgeContext);vm.runInContext(bridge,bridgeContext);
 assert.throws(()=>bridgeContext.window.LogCardData.save([]),/quota/);
 assert.equal(bridgeContext.data.cards.length,state.cards.length);
 console.log('Cards: QR/Code128/EAN13 decoding, colors, title, location filters, nearby, duplicates, save failure, camera cleanup, denial, backup recovery and legacy data passed.');
 dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1});
