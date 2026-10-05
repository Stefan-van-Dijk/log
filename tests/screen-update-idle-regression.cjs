'use strict';

// Exercise real MutationObservers: unchanged settings must stop scheduling work.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..');
const sources=process.env.LOG_SCREEN_SOURCE_DIR||base;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function main(){
  const dom=new JSDOM(`<body>
    <div class="km-shell-version"><span class="km-shell-version-number">0.40.1</span></div>
    <div id="kmShellSettingsContent" data-mode="general">
      <section class="km-shell-settings-group"><h2 id="kmShellRegistrationSettingsTitle">Registratie</h2></section>
    </div>
  </body>`,{url:'https://example.test/log/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,errors=[];
  w.addEventListener('error',event=>errors.push(event.message));
  let callbacks=0;
  const observers=[];
  const NativeObserver=w.MutationObserver;
  w.MutationObserver=class extends NativeObserver{
    constructor(callback){super((...args)=>{callbacks++;callback(...args);});observers.push(this);}
  };
  const updateKey='log-test-shared-config-updates-v2';
  w.localStorage.setItem(updateKey,JSON.stringify({mode:'manual',configurations:{}}));
  w.buildCompleteRegistrationExport=()=>({recovery:{sources:{kilometerregistratie:{data:{}}}},counts:{}});
  w.restoreKilometerPayload=async()=>{};
  const beforeStorage=w.localStorage.getItem(updateKey);
  try{
    for(const file of ['shared-card-import.js','shared-settings-ui.js'])w.eval(fs.readFileSync(path.join(sources,file),'utf8'));
    await wait(180);
    async function assertIdle(label){
      const count=callbacks;
      await wait(100);
      assert.equal(callbacks,count,`${label}: observers keep firing without a change`);
    }
    await assertIdle('Initial settings');
    const doc=w.document,panel=doc.querySelector('#kmShellSharedCardSettings');
    assert.ok(panel);
    assert.equal(panel.parentElement.id,'kmShellSharedDataSettingsGroup');
    assert.equal(doc.querySelectorAll('#kmShellSharedCardSettings').length,1);
    assert.equal(panel.querySelector('strong').textContent,'Updates');
    assert.equal(panel.hidden,false);
    assert.equal(panel.querySelector('[data-shared-check-now]').hidden,false);
    assert.equal(w.localStorage.getItem(updateKey),beforeStorage);

    for(const mode of ['off','manual','auto','manual']){
      w.LogSharedConfig.setUpdateMode(mode);
      await wait(100);
      assert.equal(panel.querySelector('[data-shared-update-mode]').value,mode);
      assert.equal(panel.querySelector('[data-shared-check-now]').hidden,mode==='off');
      await assertIdle(`Mode ${mode}`);
    }
    panel.hidden=true;panel.style.display='none';panel.dataset.settingsTarget='legacy';
    doc.body.appendChild(doc.createElement('aside'));
    await wait(100);
    assert.equal(panel.hidden,false);
    assert.equal(panel.style.display,'');
    assert.equal(panel.hasAttribute('data-settings-target'),false);
    await assertIdle('Corrected visibility');

    panel.remove();
    await wait(120);
    assert.equal(doc.querySelectorAll('#kmShellSharedCardSettings').length,1);
    await assertIdle('Recreated settings');

    // Loading the archive bridge must neither rewrite the live version nor observe it.
    const observerCount=callbacks;
    w.eval(fs.readFileSync(path.join(sources,'shell-backup-archive.js'),'utf8'));
    w.dispatchEvent(new w.Event('pageshow'));
    w.dispatchEvent(new w.CustomEvent('log-shell-view-refresh'));
    await wait(120);
    assert.equal(doc.querySelector('.km-shell-version-number').textContent,'0.40.1');
    assert.equal(doc.querySelector('.km-shell-version-label'),null);
    await assertIdle('Archive bridge and view refresh');
    w.localStorage.setItem('log-test-archive-v1',JSON.stringify({version:1,records:[{id:'retained'}]}));
    const backup=w.buildCompleteRegistrationExport();
    assert.equal(backup.counts.archived_items,1);
    assert.equal(backup.recovery.sources.kilometerregistratie.data._log_archive_v1.records[0].id,'retained');
    assert.deepEqual(errors,[]);
    console.log(`Screen updates settle after mount, policy changes, visibility correction, recreation and resume (${callbacks} observer batches; archive start ${observerCount}). Archive export retained.`);
  }finally{
    for(const observer of observers)observer.disconnect();
    await wait(50);
    w.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
