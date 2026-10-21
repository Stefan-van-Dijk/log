const {execFileSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
assert.equal(readFileSync('server/connections.php','utf8'),readFileSync('test/server/connections.php','utf8'));
execFileSync('php',['-l','server/connections.php']);
const result=JSON.parse(execFileSync('php',['tests/shared-json-server.php'],{encoding:'utf8'}));
assert.equal(result.ok,true);assert.ok(result.checks>=140);
console.log('Shared JSON server: access graph, recipient binding, replay, first 100, chat isolation, rollback and corruption passed.');
