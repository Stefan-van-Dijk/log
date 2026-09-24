'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const base=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(base,'index.html'),'utf8');
const build=html.match(/const APP_BUILD='([^']+)'/)[1];
const scripts=[...html.matchAll(/<script src="\.\/([^"?]+)(?:\?[^" ]*)?"/g)].map(match=>match[1]);
for(const file of scripts){
  const source=fs.readFileSync(path.join(base,file),'utf8');
  assert.doesNotMatch(source,/window\.LOG_TEST_BUILD\s*=/,`${file} must not override the main app build`);
}
for(const file of ['shell-gestures.js','shell-direct-actions.js']){
  const source=fs.readFileSync(path.join(base,file),'utf8');
  assert.doesNotMatch(source,/km-shell-version-number|function updateVersion|scheduleVersion/,'gesture scripts must not control the version label');
}
const stable=fs.readFileSync(path.join(base,'shell-ui-stable.js'),'utf8');
const update=stable.slice(stable.indexOf('  function updateVersion(){'),stable.indexOf('\n  function byId('));
const badge={setAttribute(name,value){this[name]=value}},version={textContent:'0.31.10-test.106'},today={textContent:''};
const context={BUILD:build,Date,Intl,$:selector=>({'#today':today,'.km-shell-version-number':version,'.km-shell-version':badge})[selector]};
vm.createContext(context);vm.runInContext(update+';updateVersion();updateVersion();',context);
assert.equal(version.textContent,build);
assert.equal(badge['aria-label'],`Geladen testversie ${build}`);
assert.ok(today.textContent.endsWith(build));
assert.match(stable,/return window\.LOG_TEST_BUILD\|\|/);
assert.match(fs.readFileSync(path.join(base,'shell-ui.js'),'utf8'),/const BUILD = window\.LOG_TEST_BUILD \|\|/);
console.log(`Versielabel: ${build}, hoofdapp is enige bron; geen overschrijving door swipe-scripts.`);
