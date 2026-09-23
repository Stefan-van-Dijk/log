const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
const cooldownStart = source.indexOf('function detourCooldownRemaining(');
const cooldownEnd = source.indexOf('\nfunction renderHome()', cooldownStart);
const recordStart = source.indexOf('async function recordDetour(');
const recordEnd = source.indexOf('\nfunction openManual()', recordStart);
assert.ok(cooldownStart >= 0 && cooldownEnd > cooldownStart && recordStart >= 0 && recordEnd > recordStart);
assert.match(source, /a==='detour'\)await recordDetour\(el\)/);
assert.match(source, /class="detour-action" data-action="detour"/);
assert.doesNotMatch(source, /id=['"]detourForm['"]/);
const panelSource = source.slice(source.indexOf('function renderDetourPanel('), source.indexOf('\nfunction renderHome('));
assert.match(vm.runInNewContext(panelSource+';renderDetourPanel(1)'), /1 tussenpunt vastgelegd/);
assert.match(vm.runInNewContext(panelSource+';renderDetourPanel(3)'), /<svg[^>]*>[\s\S]*3 tussenpunten vastgelegd/);
assert.match(source, /renderDetourPanel\(activePoints\.length\)/);
assert.match(source, /class="active-primary"[\s\S]*?renderDetourPanel\(activePoints\.length\)\}<\/div>\$\{arrivalDraft/);

function setup(getPosition, events = []) {
  const data = {activeTrip: {id: 'ride-1'}, events};
  let writes = 0, renders = 0, message = '', nextId = 0;
  const copy = {textContent: ''}, countdown = {textContent: ''}, bar = {style: {width: ''}};
  const panel = {
    classList: {toggle() {}},
    querySelector: selector => ({'.detour-countdown': countdown, '.detour-progress': bar})[selector],
  };
  const button = {
    disabled: false,
    closest: () => panel,
    querySelector: selector => ({'.detour-copy': copy})[selector],
    setAttribute() {},
  };
  const context = {
    data, getPosition, gpsLatest: null,
    app: {querySelector: () => button},
    matches: () => [],
    currentLoc: g => ({name: 'Huidige locatie', lat: g.lat, lng: g.lng}),
    snap: value => value,
    uid: () => `point-${++nextId}`,
    save: () => {writes++}, render: () => {renders++}, toast: value => {message = value},
    setInterval: () => 1, clearInterval: () => {}, Date,
  };
  vm.createContext(context);
  vm.runInContext('const DETOUR_COOLDOWN_MS=60000; let detourSaving=false,detourCountdownTimer=null;\n'+source.slice(cooldownStart, cooldownEnd)+'\n'+source.slice(recordStart, recordEnd), context);
  return {context, data, button, copy, countdown, bar,
    record: () => context.recordDetour(button), sync: () => context.syncDetourCooldown(),
    remaining: () => context.detourCooldownRemaining(data.activeTrip.id),
    get writes() {return writes}, get renders() {return renders}, get message() {return message}};
}

(async () => {
  let resolvePosition;
  const pending = setup(() => new Promise(resolve => {resolvePosition = resolve}));
  const first = pending.record();
  await pending.record();
  assert.equal(pending.button.disabled, true);
  assert.equal(pending.data.events.length, 0, 'wait for GPS without opening a form');
  resolvePosition({lat: 52, lng: 6});
  await first;
  assert.equal(pending.writes, 1, 'a rapid second tap cannot save twice');
  assert.equal(pending.renders, 1);
  assert.equal(pending.button.disabled, true, 'button stays disabled for one minute');
  assert.match(pending.countdown.textContent, /\d+ s/);
  assert.ok(parseFloat(pending.bar.style.width) > 0, 'countdown bar starts filled');
  assert.equal(pending.data.events[0].tripId, 'ride-1');
  assert.equal(pending.data.events[0].location.lat, 52);
  await pending.record();
  assert.equal(pending.writes, 1, 'repeat taps during cooldown do not save');

  const restored = setup(async () => ({lat: 52, lng: 6}), pending.data.events);
  restored.sync();
  assert.equal(restored.button.disabled, true, 'cooldown survives reopening from saved events');
  restored.data.events[0].time = new Date(Date.now()-61000).toISOString();
  restored.sync();
  assert.equal(restored.remaining(), 0);
  assert.equal(restored.button.disabled, false, 'button becomes available after one minute');
  assert.equal(restored.bar.style.width, '0%');
  await restored.record();
  assert.equal(restored.writes, 1);

  const offline = setup(() => Promise.reject(new Error('No GPS')));
  await offline.record();
  assert.equal(offline.data.events.length, 1);
  assert.equal(offline.data.events[0].location, null);
  assert.match(offline.message, /zonder GPS-locatie/);

  const switched = setup(async () => {switched.data.activeTrip = {id: 'ride-2'}; return {lat: 52, lng: 6}});
  await assert.rejects(switched.record(), /actieve rit is intussen gewijzigd/);
  assert.equal(switched.writes, 0);
  console.log('Omrijpunt: één tik, 60 seconden blokkering en balk, herstart, GPS-fallback en ritkoppeling gecontroleerd.');
})().catch(error => {console.error(error); process.exitCode = 1});
