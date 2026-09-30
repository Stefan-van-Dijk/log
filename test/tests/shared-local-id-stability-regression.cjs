const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..'),KM='kmreg-test-v4-data',TIME='urenregistratie.test.pwa.v1',UPDATES='log-test-shared-config-updates-v2',SHARING='log-test-sharing-v1',IDS='log-test-shared-local-ids-v1';
const dom=new JSDOM('<body></body>',{url:'https://example.test/test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
const set=(key,value)=>w.localStorage.setItem(key,JSON.stringify(value)),get=key=>JSON.parse(w.localStorage.getItem(key)||'{}');
const configurationId='AbC12_xYz890',sourceId='source-card';
set(KM,{cards:[{id:configurationId,name:'Gedeelde kaart',value:'ABC',format:'QR_CODE',sharedSource:{configurationId,sourceId,rootType:'card',isRoot:true}}]});
set(TIME,{locationActions:[{id:'a',type:'card',targetId:configurationId}]});
set(UPDATES,{configurations:{[configurationId]:{rootType:'card',rootSourceId:sourceId,localRootId:configurationId}}});
set(SHARING,{roots:{[`card:${configurationId}`]:configurationId},published:{}});
w.LogCardData={save(cards){const km=get(KM);km.cards=cards;set(KM,km);}};
w.LogSharing={buildBundle(type,id){return {root:{type,sourceId:id},objects:{locations:[],themes:[],subthemes:[],cards:[],actions:[]}};}};
w.LogCardsModule={refresh(){}};w.LogLocationActions={refresh(){}};

w.eval(fs.readFileSync(path.join(base,'shared-id-separation.js'),'utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));

let first=get(KM).cards[0].id;
assert.match(first,/^[A-Za-z0-9_-]{8}$/);assert.notEqual(first,configurationId);
assert.equal(get(TIME).locationActions[0].targetId,first);
assert.equal(get(UPDATES).configurations[configurationId].localRootId,first);
assert.equal(get(SHARING).roots[`card:${first}`],configurationId);
assert.equal(get(IDS).items[`card:${configurationId}:${sourceId}`],first);

// Simulate the legacy importer temporarily putting the root back on the public configuration ID during an update.
const km=get(KM);km.cards[0].id=configurationId;set(KM,km);
const time=get(TIME);time.locationActions[0].targetId=configurationId;set(TIME,time);
set(UPDATES,{configurations:{[configurationId]:{rootType:'card',rootSourceId:sourceId,localRootId:configurationId}}});
set(SHARING,{roots:{[`card:${configurationId}`]:configurationId},published:{}});
w.dispatchEvent(new w.CustomEvent('log-km-state-change',{detail:{key:KM,source:'shared-config-import'}}));

const second=get(KM).cards[0].id;
assert.equal(second,first,'the same shared source must recover the same local card ID after an update');
assert.equal(get(TIME).locationActions[0].targetId,first);
assert.equal(get(UPDATES).configurations[configurationId].localRootId,first);
assert.equal(get(SHARING).roots[`card:${first}`],configurationId);
console.log('Shared local ID stability: 8-character local ID survives source updates and references follow it.');
dom.window.close();
