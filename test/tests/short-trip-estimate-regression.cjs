const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const ctx={data:{settings:{},trips:[],events:[],locations:[],trackPoints:[]},Number,Math,Date,
 distance:(a,b)=>Math.abs(a.lat-b.lat)*1000,sameLoc:(a,b)=>a?.id===b?.id,
 arrivalEstimateContext:()=>({gpsKm:null,zeroLikely:false,confidence:'low'}),inferLast:()=>null};
vm.createContext(ctx);vm.runInContext(extract('function tripRouteFactor(','function trackedDistanceKm('),ctx);
const a={id:'a',lat:0,lng:0},b={id:'b',lat:.5/1.3,lng:0};
const factor=ctx.learnedRouteFactor(a,b);assert.equal(factor.scope,'standaard');assert.equal(factor.factor,1.3);assert.ok(Math.abs(factor.estimate-.5)<1e-9);
assert.equal(ctx.learnedRouteFactor({id:'x'},b).estimate,null,'no invented distance without coordinates');
assert.equal(ctx.learnedRouteFactor(a,a).estimate,null,'zero displacement is not scaled');
assert.ok(Math.abs(ctx.routeDistanceSuggestion(a,b).distance-.5)<1e-9);
let active={id:'1',startOdometer:100,estimatedStartOdometer:100,origin:a,expectedDestination:b};
const proposal=ctx.endOdometerProposals(active,null)[0];assert.equal(proposal.precise,100.5);assert.equal(proposal.value,101);
// Use the real arrival-save function, then serialize/reload as on a PWA restart.
Object.assign(ctx,{num:v=>v==null||v===''?null:Number(v),snap:x=>x,split:(v)=>({private:0,business:v,commute:0}),save(){},stopTracking(){},closeModal(){},render(){},toast(){},km:String,arrivalDraft:null});
vm.runInContext(extract('function saveArrival(','async function reopenLastTrip('),ctx);
ctx.data.activeTrip=active;ctx.data.locations=[a,b];
ctx.saveArrival(new Map([['endOdometer','101'],['estimatedEndOdometer','100.5'],['destinationChoice','known:b']]));
assert.equal(ctx.data.lastEndpoint.estimatedOdometer,100.5);assert.equal(ctx.data.trips[0].estimatedDistanceKm,.5);
ctx.data=JSON.parse(JSON.stringify(ctx.data));assert.equal(ctx.carryStart(101),100.5);
active={id:'2',startOdometer:101,estimatedStartOdometer:ctx.carryStart(101),origin:b,expectedDestination:a};ctx.data.activeTrip=active;
const next=ctx.endOdometerProposals(active,null)[0];assert.equal(next.precise,101);assert.equal(next.value,101);
ctx.saveArrival(new Map([['endOdometer','101'],['estimatedEndOdometer','101'],['destinationChoice','known:a']]));
assert.equal(ctx.data.trips.reduce((n,t)=>n+t.estimatedDistanceKm,0),1,'two halves retain one estimated kilometre');
assert.equal(ctx.data.trips.reduce((n,t)=>n+t.actualKm,0),1,'dashboard difference totals one kilometre, not two');
assert.equal(ctx.learnedRouteFactor(a,b).scope,'standaard','estimates never teach their own factor');
// Manual correction resets the hidden fraction, even when the displayed integer is unchanged.
ctx.data.activeTrip={...active,id:'3',estimatedStartOdometer:100.5};ctx.saveArrival(new Map([['endOdometer','101'],['estimatedEndOdometer',''],['destinationChoice','known:a']]));
assert.equal(ctx.data.lastEndpoint.estimatedOdometer,101);assert.equal(ctx.data.trips[2].odometerSource,'manual');
assert.equal(ctx.carryStart(200),200,'changed dashboard baseline ignores stale carry');
assert.equal(ctx.estimateStart({startOdometer:100,estimatedStartOdometer:null}),100);
assert.equal(ctx.estimateStart({startOdometer:100,estimatedStartOdometer:98}),100);
// Old 0 km short trips must not suppress the fallback; measured history teaches a factor.
ctx.data.trips=[{origin:a,destination:b,actualKm:0}];assert.ok(Math.abs(ctx.routeDistanceSuggestion(a,b).distance-.5)<1e-9);
ctx.data.trips=[{origin:a,destination:{id:'far',lat:10,lng:0},actualKm:15}];assert.equal(ctx.learnedRouteFactor(a,b).factor,1.5);
assert.match(source,/estimatedStartOdometer:estimateStart\(trip\)/,'reopening preserves original fractional baseline');
assert.match(source,/estimatedOdometer:t\.estimatedEndOdometer\?\?t\.endOdometer/,'rebuild preserves last fractional endpoint');
assert.match(source,/delete updated\.estimatedEndOdometer/,'edited odometers clear stale estimates');
assert.match(source,/estimate\.value=precise==null\?'':String\(precise\)/,'manual input clears precise proposal');
console.log('Short trips: distance × factor, two halves, reload, manual correction, measured learning and legacy zero-distance history passed.');
