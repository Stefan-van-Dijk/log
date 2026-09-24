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
 assert.equal(q('.cards-content-details').open,false,'raw value collapsed initially');
 assert.equal(q('.cards-display .cards-format-label'),null,'no code type in opened card');
 assert.equal(q('.cards-display [data-card-edit]'),null);
 assert.equal(q('.cards-display [data-card-delete]'),null);
 assert.ok(q('.cards-content-details [data-card-copy]'),'copy stays inside disclosure');
 const qrFrame=await sharp(Buffer.from(q('[data-code-display] svg').outerHTML)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 click('[data-card-close]');assert.match(q('[data-cards-list]').textContent,/Kantoor › Entree/);
 const row=q('.code-card-swipe'),surface=q('.code-card-surface');
 const pointer=(type,x,y)=>q('#root')['on'+type]({target:surface,pointerId:1,clientX:x,clientY:y,button:0,preventDefault(){}});
 pointer('pointerdown',200,20);pointer('pointermove',110,22);pointer('pointerup',110,22);
 assert.equal(row.classList.contains('actions-open'),true,'left swipe reveals actions');
 assert.equal(q('.code-card-actions').hasAttribute('inert'),false);
 click('[data-card-open]');assert.equal(q('dialog'),null,'swipe release cannot open card');
 row.dataset.suppressUntil='0';click('[data-card-edit]');assert.ok(q('#cardForm'),'edit without opening code');click('[data-card-close]');
 pointer('pointerdown',200,20);pointer('pointermove',195,100);pointer('pointerup',195,100);
 assert.equal(row.classList.contains('actions-open'),false,'vertical scrolling does not reveal actions');
 click('[data-card-actions]');assert.equal(row.classList.contains('actions-open'),true,'keyboard-accessible action toggle');
 w.confirm=()=>false;click('[data-card-delete]');assert.equal(state.cards.length,1,'cancel deletion preserves card');
 failSave=true;w.confirm=()=>true;click('[data-card-delete]');assert.equal(state.cards.length,1,'failed deletion preserves card');failSave=false;click('[data-card-actions]');
 openNew();set('value','000123456789');set('format','CODE128');set('locationId','parent');submit();
 assert.equal(state.cards.length,2);assert.equal(await decoded(q('[data-code-display] svg')),'000123456789','Code128 round-trip');
 const barcodeFrame=await sharp(Buffer.from(q('[data-code-display] svg').outerHTML)).ensureAlpha().raw().toBuffer({resolveWithObject:true});click('[data-card-close]');
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
 // Exercise the actual camera-frame decoder and handoff into the form, not just generation.
 w.LogCardsModule.mount(q('#root'));
 const originalTimeout=w.setTimeout,originalClear=w.clearTimeout;
 let nextScan=null,frame=null,draws=0,broken=false;
 w.setTimeout=callback=>{nextScan=callback;return 1};w.clearTimeout=()=>{nextScan=null};
 w.HTMLCanvasElement.prototype.getContext=function(){return {
   drawImage(){if(broken)throw Error('frame failure');draws++},
   getImageData(){return {data:new w.Uint8ClampedArray(frame.data)}}
 }};
 for(const [fixture,value,format] of [[qrFrame,unicode,'QR_CODE'],[barcodeFrame,'000123456789','CODE128']]){
   frame=fixture;click('[data-cards-scan]');const video=q('video');
   Object.defineProperties(video,{readyState:{value:2},videoWidth:{value:0,configurable:true},videoHeight:{value:0,configurable:true}});
   const previousDraws=draws;await tick();assert.equal(draws,previousDraws,'do not decode zero-size iOS frames');
   Object.defineProperties(video,{videoWidth:{value:frame.info.width},videoHeight:{value:frame.info.height}});
   assert.equal(typeof nextScan,'function');nextScan();
   assert.ok(q('#cardForm'),'decoded camera result opens editor');
   assert.equal(q('[name=value]').value,value);assert.equal(q('[name=format]').value,format);
   assert.equal(q('video'),null,'camera closes once a code is recognized');click('[data-card-close]');
 }
 broken=true;click('[data-cards-scan]');const badVideo=q('video');
 Object.defineProperties(badVideo,{readyState:{value:2},videoWidth:{value:640},videoHeight:{value:480}});
 await tick();nextScan();nextScan();assert.match(q('[data-card-message]').textContent,/camerabeeld kan niet worden gelezen/);assert.equal(q('[data-camera-start]').disabled,false);click('[data-card-close]');
 w.setTimeout=originalTimeout;w.clearTimeout=originalClear;
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
 const countBeforeDelete=state.cards.length;click('[data-card-actions]');w.confirm=()=>true;click('[data-card-delete]');
 assert.equal(state.cards.length,countBeforeDelete-1,'confirmed row deletion removes only selected card');
 console.log('Cards: QR/Code128/EAN13 decoding, colors, title, location filters, nearby, duplicates, save failure, camera cleanup, denial, backup recovery and legacy data passed.');
 dom.window.close();
})().catch(error=>{console.error(error);dom.window.close();process.exitCode=1});
