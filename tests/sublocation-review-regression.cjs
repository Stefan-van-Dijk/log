const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const base=require('node:path').resolve(__dirname,'..'),html=fs.readFileSync(base+'/index.html','utf8'),shell=fs.readFileSync(base+'/shell-location-status.js','utf8');
const dom=new JSDOM('<form id="locationForm"><input name="id"><input name="name" value="Entree"><input name="address"><input name="lat"><input name="lng"><select name="parentId"><option value="">Geen</option><option value="p">Parent</option></select></form>',{url:'https://example.test',runScripts:'outside-only'}),w=dom.window,f=w.document.querySelector('form');
w.data={locations:[{id:'p',name:'Kantoor',address:'Hoofdstraat',lat:52,lng:6}]};
w.parseNum=v=>v==null||String(v).trim()===''?null:Number(v);w.uid=()=> 'child';w.KEY='kmreg-test-v4-data';
w.save=()=>w.localStorage.setItem(w.KEY,JSON.stringify(w.data));w.finishEditorReturn=w.toast=w.setLocationStatus=()=>{};
let requests=0;w.coordinatesForAddress=async()=>{requests++;return {lat:52,lng:6}};w.addressForCoordinates=async()=>{requests++;return 'Adres'};
for(const name of ['locationFormIsSub','locationFormGps','autoFillLocationFromAddress','autoFillLocationFromGps','autoCompleteLocationForm','saveLocation']){
 const line=html.split('\n').find(l=>l.startsWith('function '+name+'(')||l.startsWith('async function '+name+'('));assert.ok(line,name);w.eval(line);
}
const related=shell.match(/  function actionLocationRelated\([\s\S]*?\n  }/)[0];w.eval(related);
(async()=>{
 f.elements.parentId.value='p';f.elements.address.value='Hidden parent address';
 await w.saveLocation();let child=JSON.parse(w.localStorage.getItem(w.KEY)).locations.find(l=>l.id==='child');
 assert.equal(requests,0);assert.equal(child.address,'');assert.equal(child.lat,null);assert.equal(child.lng,null);assert.equal(child.parentId,'p');
 f.elements.id.value='child';await w.saveLocation();assert.equal(requests,0,'existing child remains inherited');
 f.elements.lat.value='52.001';f.elements.lng.value='6.002';await w.saveLocation();
 child=JSON.parse(w.localStorage.getItem(w.KEY)).locations.find(l=>l.id==='child');assert.equal(child.lat,52.001);assert.equal(child.lng,6.002);assert.equal(child.address,'');assert.equal(requests,0);
 f.elements.parentId.value='';f.elements.lat.value='';f.elements.lng.value='';f.elements.address.value='New address';await w.autoCompleteLocationForm();assert.equal(requests,1,'root address still geocodes');
 f.elements.lat.value='';f.elements.lng.value='';let resolve;w.coordinatesForAddress=()=>new Promise(r=>resolve=r);
 const pending=w.autoCompleteLocationForm();f.elements.parentId.value='p';resolve({lat:1,lng:2});await pending;assert.equal(f.elements.lat.value,'','late geocode cannot populate child');
 const locations=[{id:'p'},{id:'a',parentId:'p'},{id:'b',parentId:'p'},{id:'other'}];
 for(const [rule,filter,expected] of [['a','p',true],['p','a',true],['a','a',true],['b','a',false],['other','p',false]])assert.equal(w.actionLocationRelated(rule,filter,locations),expected);
 assert.equal(w.data.locations[0].address,'Hoofdstraat');
 console.log('Sublocation save, inherited/own GPS, geocode race and hierarchy checks passed.');w.close();
})().catch(e=>{console.error(e);w.close();process.exitCode=1});
