'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildOptions, matchesFilter, selectionMinutes } = require('../time/filter-model.js');

function activePeriodEntries(state) {
  if (state?.ui?.periodMode === 'all') return [...(state.entries || [])];
  const anchor = new Date(`${state?.ui?.anchorDate}T12:00:00`);
  let start = new Date(anchor);
  let end = new Date(anchor);
  const mode = state?.ui?.periodMode || 'week';
  if (mode === 'day') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (mode === 'week') {
    const day = (anchor.getDay() + 6) % 7;
    start.setDate(anchor.getDate() - day);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (mode === 'month') {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (mode === 'quarter') {
    const month = Math.floor(anchor.getMonth() / 3) * 3;
    start = new Date(anchor.getFullYear(), month, 1);
    end = new Date(anchor.getFullYear(), month + 3, 0, 23, 59, 59, 999);
  } else {
    start = new Date(anchor.getFullYear(), 0, 1);
    end = new Date(anchor.getFullYear(), 11, 31, 23, 59, 59, 999);
  }
  return (state.entries || []).filter(entry => {
    const date = new Date(entry.dateISO || entry.endISO || entry.startISO || entry.createdAt);
    return date >= start && date <= end;
  });
}

function runFixture(state, label) {
  const entries = activePeriodEntries(state);
  const model = buildOptions({ themes: state.themes, subthemes: state.subthemes, entries });
  const catalog = { themes: state.themes, subthemes: state.subthemes };
  assert.equal(model.records.every(record => record.minutes > 0), true, `${label}: thema zonder tijd gevonden`);
  assert.equal(model.records.flatMap(record => record.children).every(record => record.minutes > 0), true, `${label}: subthema zonder tijd gevonden`);
  assert.equal(selectionMinutes(entries, 'all'), model.allMinutes, `${label}: totaaltijd wijkt af`);

  for (const record of model.records) {
    const value = `theme:${record.theme.id}`;
    const selected = entries.filter(entry => matchesFilter(entry, value, catalog));
    assert.equal(selectionMinutes(entries, value, catalog), record.minutes, `${label}: thematijd wijkt af`);
    assert.equal(selected.every(entry => String(entry.themeId || '') === String(record.theme.id) || (!entry.themeId && entry.themeName === record.theme.name)), true, `${label}: verkeerd thema geselecteerd`);
    for (const child of record.children) {
      const childValue = `subtheme:${child.subtheme.id}`;
      assert.equal(selectionMinutes(entries, childValue, catalog), child.minutes, `${label}: subthematijd wijkt af`);
    }
  }

  assert.equal(matchesFilter(entries[0] || {}, 'all'), true, `${label}: wissen naar alle thema's faalt`);

  // Herhaald kiezen en wissen moet zuiver blijven: geen toestand wordt in het model vastgehouden.
  for (let pass = 0; pass < 100; pass += 1) {
    for (const record of model.records) {
      assert.equal(selectionMinutes(entries, `theme:${record.theme.id}`, catalog), record.minutes, `${label}: herhaalde themakeuze wijkt af`);
    }
    assert.equal(selectionMinutes(entries, 'all'), model.allMinutes, `${label}: herhaald wissen wijkt af`);
  }
  return { entries: entries.length, themes: model.records.length, minutes: model.allMinutes };
}

const synthetic = {
  ui: { periodMode: 'week', anchorDate: '2026-09-25' },
  themes: [
    { id: 'a', name: 'Actief' },
    { id: 'b', name: 'Geen tijd' }
  ],
  subthemes: [
    { id: 'a1', themeId: 'a', name: 'Onderdeel' },
    { id: 'b1', themeId: 'b', name: 'Leeg onderdeel' }
  ],
  entries: [
    { id: 'e1', themeId: 'a', subthemeId: 'a1', ownMinutes: 75, dateISO: '2026-09-23T12:00:00.000Z' },
    { id: 'e2', themeName: 'Geen tijd', subthemeName: 'Leeg onderdeel', ownMinutes: 30, dateISO: '2026-09-10T12:00:00.000Z' }
  ]
};

const results = [runFixture(synthetic, 'synthetische fixture')];
const allPeriods = { ...synthetic, ui: { ...synthetic.ui, periodMode: 'all' } };
const allResult = runFixture(allPeriods, 'periodewissel naar alles');
assert.deepEqual(allResult, { entries: 2, themes: 2, minutes: 105 }, 'periodewissel ververst het filtermodel niet correct');
const suppliedPath = process.argv[2];
if (suppliedPath) {
  const backup = JSON.parse(fs.readFileSync(path.resolve(suppliedPath), 'utf8'));
  const state = backup?.source_data?.tijdsregistratie?.data || backup;
  results.push(runFixture(state, 'aangeleverd voorbeeldbestand'));
}

console.log(`Tijdfilter regressie geslaagd: ${results.map(result => `${result.entries} registraties, ${result.themes} thema's, ${result.minutes} minuten`).join(' | ')}`);
