'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const builds = [
  ['live', path.join(repositoryRoot, 'index.html')],
  ['test', path.join(repositoryRoot, 'test', 'index.html')]
];

for (const [label, filename] of builds) {
  const source = fs.readFileSync(filename, 'utf8');
  const handler = source.match(/window\.addEventListener\('pageshow',\(\)=>\{([^}]*)\}\)/);
  assert.ok(handler, `${label}: pageshow-handler ontbreekt`);
  assert.match(handler[1], /reloadKilometerData\(\)/, `${label}: hervatten gebruikt niet de veilige herlaadroute`);
  assert.doesNotMatch(handler[1], /data=load\(\)/, `${label}: hervatten overschrijft GPS-punten nog rechtstreeks vanuit localStorage`);

  const reloadFunction = source.match(/function reloadKilometerData\(\)\{[^}]*\}/)?.[0];
  assert.ok(reloadFunction, `${label}: reloadKilometerData ontbreekt`);
  assert.match(source, /data\.trackPoints=await allTrackPoints\(\);trackStoreReady=true/, `${label}: IndexedDB wordt niet als GPS-bron geladen`);

  const currentPoints = [1, 2, 3, 4].map(number => ({
    id: `punt-${number}`,
    tripId: 'rit-met-vier-punten',
    time: `2026-09-22T08:0${number}:00.000Z`,
    lat: 52 + number / 1000,
    lng: 6 + number / 1000
  }));
  const context = {
    data: { trips: [{ id: 'rit-met-vier-punten' }], trackPoints: currentPoints },
    trackStoreReady: true,
    load: () => ({ trips: [{ id: 'rit-met-vier-punten' }], trackPoints: [] })
  };
  vm.createContext(context);
  vm.runInContext(`${reloadFunction}; reloadKilometerData();`, context);

  const linked = context.data.trackPoints.filter(point => point.tripId === 'rit-met-vier-punten');
  assert.equal(linked.length, 4, `${label}: vier gekoppelde GPS-punten gaan bij hervatten verloren`);
  assert.deepEqual(linked.map(point => point.id), ['punt-1', 'punt-2', 'punt-3', 'punt-4'], `${label}: GPS-koppelingen wijzigen bij hervatten`);
}

console.log('GPS resume regression: 4 GPS-punten blijven in test en live aan dezelfde rit gekoppeld.');
