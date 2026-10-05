'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');let checked=0;
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','test','tests','vendor'].includes(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.name.endsWith('.js')){new vm.Script(fs.readFileSync(full,'utf8'),{filename:full});checked++}}}
walk(root);
for(const match of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim()){new vm.Script(match[1],{filename:'index.html:inline'});checked++}
console.log(`Production syntax passed (${checked} scripts).`);
