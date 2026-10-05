const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
async function run(){
  const dom=new JSDOM('<body></body>',{url:'https://example.test/log/',runScripts:'outside-only'}),w=dom.window;
  let requests=0,hidden=false,revoked=false;
  Object.defineProperty(w.document,'readyState',{value:'complete'});
  Object.defineProperty(w.document,'hidden',{get:()=>hidden});
  w.setTimeout=w.setInterval=()=>1;w.requestAnimationFrame=()=>1;
  const id='ABCDEFGHIJKL',key='log-test-person-connections-v1';
  const fixture={version:1,items:{[id]:{connectionId:id,role:'owner',ownerToken:'fixture-owner',revision:7,status:'connected',cache:{status:'connected'}}}};
  w.localStorage.setItem(key,JSON.stringify(fixture));
  w.fetch=async()=>{requests++;return new Response(JSON.stringify({ok:true,revision:7,revoked,payload:{ciphertext:'unchanged-fixture'}}),{status:200});};
  try{
    for(const file of ['person-connections.js','person-connections-one-qr.js'])w.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
    const before=w.localStorage.getItem(key);
    await w.LogOneQrConnections.syncOwners();assert.equal(requests,0,'Confirmed owners use the regular connection check, not the fast invitation loop');
    await w.LogPersonConnections.syncAll();assert.equal(requests,1);assert.equal(w.localStorage.getItem(key),before,'Same revision preserves cached data and timestamps');
    fixture.items[id].status='pending_out';w.localStorage.setItem(key,JSON.stringify(fixture));
    await w.LogOneQrConnections.syncOwners();assert.equal(requests,2,'Pending invitation still checks for confirmation');
    hidden=true;await w.LogOneQrConnections.syncOwners();assert.equal(requests,2,'Fast invitation loop pauses in background');
    hidden=false;revoked=true;await w.LogPersonConnections.syncAll();assert.equal(JSON.parse(w.localStorage.getItem(key)).items[id].status,'revoked','Revocation is processed even with an unchanged revision');
    console.log('Energy connection checks passed: no duplicate confirmed-owner polling, pending confirmation retained, unchanged cache and revocation.');
  }finally{w.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1});
