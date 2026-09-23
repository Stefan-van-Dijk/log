const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(new URL('../index.html', `file://${__filename}`), 'utf8');
const start = source.indexOf('let detourSaving=false;');
const end = source.indexOf('\nfunction openManual()', start);
assert.ok(start >= 0 && end > start, 'one-tap handler exists');
assert.match(source, /a==='detour'\)await recordDetour\(el\)/);
assert.doesNotMatch(source, /id=['"]detourForm['"]/);

function setup(getPosition) {
  const data = {activeTrip: {id: 'ride-1'}, events: []};
  let writes = 0;
  let renders = 0;
  let message = '';
  const context = {
    data,
    getPosition,
    gpsLatest: null,
    matches: () => [],
    currentLoc: g => ({name: 'Huidige locatie', lat: g.lat, lng: g.lng}),
    snap: value => value,
    uid: () => 'point-1',
    save: () => { writes++; },
    render: () => { renders++; },
    toast: value => { message = value; },
    Date,
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return {context, data, record: button => context.recordDetour(button), get writes() {return writes}, get renders() {return renders}, get message() {return message}};
}

(async () => {
  let resolvePosition;
  const pending = setup(() => new Promise(resolve => {resolvePosition = resolve}));
  const button = {disabled: false, isConnected: true};
  const first = pending.record(button);
  await pending.record(button);
  assert.equal(button.disabled, true);
  assert.equal(pending.data.events.length, 0, 'wait for GPS without opening a form');
  resolvePosition({lat: 52, lng: 6});
  await first;
  assert.equal(pending.writes, 1, 'a rapid second tap cannot save twice');
  assert.equal(pending.renders, 1);
  assert.equal(button.disabled, false);
  assert.equal(pending.data.events[0].tripId, 'ride-1');
  assert.equal(pending.data.events[0].type, 'detour');
  assert.equal(pending.data.events[0].location.lat, 52);
  assert.ok(Number.isFinite(Date.parse(pending.data.events[0].time)));

  const offline = setup(() => Promise.reject(new Error('No GPS')));
  await offline.record({disabled: false, isConnected: true});
  assert.equal(offline.data.events.length, 1);
  assert.equal(offline.data.events[0].location, null);
  assert.match(offline.message, /zonder GPS-locatie/);

  const switched = setup(async () => {switched.data.activeTrip = {id: 'ride-2'}; return {lat: 52, lng: 6}});
  await assert.rejects(switched.record({disabled: false, isConnected: true}), /actieve rit is intussen gewijzigd/);
  assert.equal(switched.writes, 0);
  console.log('Omrijpunt: één tik, geen dubbel punt, GPS-fallback en ritkoppeling gecontroleerd.');
})().catch(error => {console.error(error); process.exitCode = 1});
