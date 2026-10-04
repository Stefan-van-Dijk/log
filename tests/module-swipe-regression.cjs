const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..');
const dom=new JSDOM('<body></body>',{url:'https://example.test/test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
Object.defineProperty(w,'innerWidth',{value:390});
const queue=[];w.setTimeout=callback=>{queue.push(callback);return queue.length};
for(const file of ['swipe-policy.js','shell-direct-actions.js'])w.eval(fs.readFileSync(path.join(base,file),'utf8'));
d.dispatchEvent(new w.Event('DOMContentLoaded'));
const fixtures=[
 ['rides','swipe-row','swipe-surface','trip-swipe-actions','data-action="edit-trip"','data-action="delete-trip"'],
 ['events','swipe-row','swipe-surface','trip-swipe-actions','data-action="edit-event"','data-action="delete-event"'],
 ['time','activity-swipe-row','activity-swipe-surface','activity-swipe-actions','data-swipe-action="edit"','data-swipe-action="delete"'],
 ['locations','km-shell-location-swipe-row','km-shell-location-swipe-surface','km-shell-location-swipe-actions','data-shell-location-swipe-action="edit"','data-shell-location-swipe-action="delete"'],
 ['themes','km-shell-theme-swipe-row','km-shell-theme-swipe-surface','km-shell-theme-swipe-actions','data-shell-theme-edit="t"','data-log-delete-theme="t"'],
 ['subthemes','km-shell-theme-swipe-row','km-shell-theme-swipe-surface','km-shell-theme-swipe-actions','data-shell-theme-edit="s"','data-del-sub="s"'],
 ['cards','code-card-swipe','code-card-surface','code-card-actions','data-card-edit="c"','data-card-delete="c"']
];
function setting(km={},time={}){w.localStorage.setItem('kmreg-test-v4-data',JSON.stringify({settings:km}));w.localStorage.setItem('urenregistratie.test.pwa.v1',JSON.stringify({settings:time}));w.dispatchEvent(new w.Event('log-km-state-change'));}
function testFixture(f){
 const [module,row,surface,actions,edit,remove]=f;
 d.body.innerHTML=`<div class="${row}"><div class="${actions}"><button ${remove}>Verwijder</button><button ${edit}>Bewerk</button></div><div class="${surface}">${module==='cards'?'<button data-card-open="c">Kaart</button>':'<span>Regel</span>'}</div></div>`;
 const buttons=d.querySelectorAll('button'),del=buttons[0],edt=buttons[1],target=d.querySelector('.'+surface).firstElementChild;
 let edits=0,deletes=0;edt.onclick=()=>edits++;del.onclick=()=>deletes++;
 const fire=(name,x,y)=>{const event=new w.MouseEvent(name,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(event,'pointerId',{value:1});target.dispatchEvent(event)};
 const swipe=(dx,dy=0,cancel=false)=>{fire('pointerdown',250,40);fire('pointermove',250+dx,40+dy);fire(cancel?'pointercancel':'pointerup',250+dx,40+dy);while(queue.length)queue.shift()();};
 setting();swipe(-65);assert.equal(edits,1,module+' short swipe edits');assert.equal(deletes,0);
 swipe(-155);assert.equal(deletes,1,module+' further swipe invokes lifecycle');
 swipe(-10,100);assert.equal(edits,1);assert.equal(deletes,1,module+' vertical scroll safe');
 swipe(-155,0,true);assert.equal(deletes,1,module+' cancelled swipe safe');
 setting({swipeLifecycleEnabled:false});swipe(-155);assert.equal(edits,2,module+' disabled lifecycle leaves edit');assert.equal(deletes,1);
 del.click();assert.equal(deletes,1,module+' stale controls guarded');
 setting();del.click();assert.equal(deletes,2,module+' restored setting works');
 if(['time','themes','subthemes'].includes(module)){setting({}, {swipeDeleteEnabled:false});swipe(-155);assert.equal(deletes,2,module+' module flag respected');}
 if(module==='locations'){setting({locationDeleteEnabled:false});swipe(-155);assert.equal(deletes,2,'location-specific flag respected');}
}
for(const fixture of fixtures)testFixture(fixture);
// The real theme action renderer must omit lifecycle controls when disabled.
const shell=fs.readFileSync(path.join(base,'shell-ui.js'),'utf8');
const themeRenderer=shell.slice(shell.indexOf('  function themeSwipeActions('),shell.indexOf('\n  function resetThemeSwipeRow('));
w.eval('const esc=String;function themeLifecycle(){return {plan:{action:"archive"},action:"Archiveer"}};'+themeRenderer+';window.testThemeActions=themeSwipeActions;');
setting({swipeLifecycleEnabled:false});assert.doesNotMatch(w.testThemeActions('t','theme'),/data-log-delete-theme/);assert.match(w.testThemeActions('t','theme'),/data-shell-theme-edit/);
setting();const markup=w.testThemeActions('t','theme');assert.ok(markup.indexOf('data-log-delete-theme')<markup.indexOf('data-shell-theme-edit'),'edit is rightmost and revealed first');assert.match(markup,/swipe-archive/);
console.log('All modules: edit/further lifecycle, cancellation, vertical scroll, global and local disabling, stale controls and theme action order passed.');
dom.window.close();
