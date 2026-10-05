'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
let failed=0;
for(const file of fs.readdirSync(__dirname).filter(name=>name.endsWith('-regression.cjs')).sort()){
  const result=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:15000});
  console.log(`${result.status===0?'PASS':'FAIL'} ${file}`);
  if(result.status!==0){failed++;console.log((result.stderr||result.stdout||result.error?.message||'Unknown failure').slice(-1600));}
}
console.log(`Unfiltered regression failures: ${failed}.`);process.exitCode=failed?1:0;
