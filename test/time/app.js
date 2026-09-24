'use strict';

const STORAGE_KEY = 'urenregistratie.test.pwa.v1';
const ROUNDING_UNITS = [3, 6, 12, 15, 30, 60];
const THEME_COLORS = ['#a875ff', '#4da3ff', '#49d17d', '#ff9f0a', '#ff6767', '#4da3ff', '#ffbd4a', '#8e8e93'];

const defaultTimer = () => ({
  status: 'inactive',
  sessionId: null,
  startISO: null,
  stopISO: null,
  themeId: null,
  themeName: '',
  subthemeId: null,
  subthemeName: '',
  locationName: '',
  note: '',
  startNewAfterSave: false,
  interruption: null
});

const defaultState = () => ({
  version: 2,
  settings: {
    roundingUnitMinutes: 15,
    roundingMode: 'up',
    roundingThreshold: 0.25,
    timeDisplay: 'decimal',
    interruptionUnitMinutes: 15,
    interruptionDeductAfterMinutes: 30,
    employerMode: 'single',
    swipeDeleteEnabled: true,
    themeSortMode: 'smart',
    themeOrder: []
  },
  ui: {
    periodMode: 'week',
    anchorDate: dateInputValue(new Date())
  },
  timer: defaultTimer(),
  themes: [],
  subthemes: [],
  colleagues: [],
  employers: [],
  workspaces: [],
  departments: [],
  entries: [],
  lastCompletion: null
});

let state = loadState();
let timerTick = null;
let currentView = new URLSearchParams(window.location.search).get('settings') === '1' ? 'settings' : 'home';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    const oldRounding = Number(parsed.settings?.roundingMinutes);
    const settings = {
      ...base.settings,
      ...(parsed.settings || {}),
      roundingUnitMinutes: Number(parsed.settings?.roundingUnitMinutes || oldRounding || base.settings.roundingUnitMinutes)
    };
    const ui = { ...base.ui, ...(parsed.ui || {}) };
    const timer = { ...base.timer, ...(parsed.timer || {}) };
    if (timer.status === 'active' && !timer.sessionId) timer.sessionId = uid();
    return {
      ...base,
      ...parsed,
      version: 2,
      settings,
      ui,
      timer,
      themes: Array.isArray(parsed.themes) ? parsed.themes.map(theme => ({
        ...theme,
        color: validThemeColor(theme.color) ? theme.color : fallbackThemeColor(theme.id || theme.name),
        includeInTotals: theme.includeInTotals !== false
      })) : [],
      subthemes: Array.isArray(parsed.subthemes) ? parsed.subthemes : [],
      colleagues: Array.isArray(parsed.colleagues) ? parsed.colleagues : [],
      employers: Array.isArray(parsed.employers) ? parsed.employers : [],
      workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
      departments: Array.isArray(parsed.departments) ? parsed.departments : [],
      entries: Array.isArray(parsed.entries) ? parsed.entries.map(normalizeEntry) : []
    };
  } catch (error) {
    console.error('Kan opslag niet lezen', error);
    return defaultState();
  }
}

function normalizeEntry(entry) {
  const own = Number(entry.ownMinutes ?? entry.roundedMinutes ?? 0) || 0;
  const colleague = Number(entry.colleagueMinutes || 0) || 0;
  return {
    activityType: entry.activityType || (entry.kind === 'Tussenstop' ? 'interruption' : 'normal'),
    parentActivityId: entry.parentActivityId || null,
    locationName: entry.locationName || '',
    departmentName: entry.departmentName || '',
    note: entry.note || '',
    people: Array.isArray(entry.people) ? entry.people : [],
    contexts: Array.isArray(entry.contexts) ? entry.contexts : [],
    attributions: Array.isArray(entry.attributions) ? entry.attributions : [],
    netActualMinutes: Number(entry.netActualMinutes ?? entry.actualMinutes ?? 0) || 0,
    deductedInterruptionMinutes: Number(entry.deductedInterruptionMinutes || 0) || 0,
    deductMinutes: Number(entry.deductMinutes || 0) || 0,
    roundingSnapshot: entry.roundingSnapshot || null,
    ...entry,
    ownMinutes: own,
    colleagueMinutes: colleague,
    totalMinutes: Number(entry.totalMinutes ?? own + colleague) || 0
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent('log-time-state-change', {
    detail: {
      view: currentView,
      count: state.entries.filter(entry => entry.activityType !== 'interruption').length,
      timerStatus: state.timer?.status || 'inactive'
    }
  }));
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function themeColor(value) {
  const theme = typeof value === 'object'
    ? value
    : state.themes.find(item => String(item.id) === String(value)) || state.themes.find(item => item.name === value);
  if (validThemeColor(theme?.color)) return theme.color;
  return fallbackThemeColor(theme?.id || theme?.name || value);
}

function validThemeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function fallbackThemeColor(value) {
  let hash = 0;
  for (const char of String(value || 'theme')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return THEME_COLORS[Math.abs(hash) % THEME_COLORS.length];
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function sortedByUsage(items) {
  return [...items].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }));
}

function themeLastUsedAt(theme) {
  const entryLatest = state.entries.reduce((latest, entry) => {
    const matches = String(entry.themeId || '') === String(theme.id || '') || (!entry.themeId && entry.themeName === theme.name);
    if (!matches) return latest;
    const time = new Date(entry.endISO || entry.dateISO || entry.startISO || entry.createdAt || 0).getTime();
    return Number.isFinite(time) ? Math.max(latest, time) : latest;
  }, 0);
  const timerMatches = String(state.timer?.themeId || '') === String(theme.id || '') || (!state.timer?.themeId && state.timer?.themeName === theme.name);
  const timerTime = timerMatches ? new Date(state.timer?.startISO || 0).getTime() : 0;
  return Number.isFinite(timerTime) ? Math.max(entryLatest, timerTime) : entryLatest;
}

function themeSortMode() {
  return ['smart', 'alpha', 'custom'].includes(state.settings.themeSortMode) ? state.settings.themeSortMode : 'smart';
}

function normalizedThemeOrder(order = state.settings.themeOrder) {
  const available = new Set(state.themes.map(theme => String(theme.id)));
  const result = [...new Set((Array.isArray(order) ? order : []).map(String))].filter(id => available.has(id));
  state.themes.forEach(theme => { if (!result.includes(String(theme.id))) result.push(String(theme.id)); });
  return result;
}

function dateInputValue(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function localDateTimeInput(value) {
  if (!value) return '';
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function dateText(value) {
  return new Intl.DateTimeFormat('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function timeText(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function durationText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function clockMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function decimalHours(minutes) {
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(minutes) || 0) / 60);
}

function displayMinutes(minutes, withUnit = true) {
  if (state.settings.timeDisplay === 'clock') return `${clockMinutes(minutes)}${withUnit ? ' uur' : ''}`;
  return `${decimalHours(minutes)}${withUnit ? ' uur' : ''}`;
}

function periodHours(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  const label = `${hours} uur${remainder ? ` en ${remainder} minuten` : ''}`;
  const hourPart = hours || !remainder ? `<span class="period-hours-part"><strong>${hours}</strong><small>u</small></span>` : '';
  const minutePart = remainder ? `<span class="period-hours-part"><strong>${remainder}</strong><small>m</small></span>` : '';
  return `<span class="period-hours" aria-label="${label}">${hourPart}${minutePart}</span>`;
}

function actualMinutes(startISO, stopISO) {
  const start = new Date(startISO).getTime();
  const stop = new Date(stopISO).getTime();
  return Math.max(1, Math.ceil(Math.max(0, stop - start) / 60000));
}

function roundByRule(minutes, { unit = state.settings.roundingUnitMinutes, mode = state.settings.roundingMode, threshold = state.settings.roundingThreshold } = {}) {
  const value = Math.max(0, Number(minutes) || 0);
  const block = Math.max(1, Number(unit) || 15);
  if (mode === 'none') return Math.round(value);
  if (mode === 'up') return value <= 0 ? 0 : Math.ceil(value / block) * block;
  const lower = Math.floor(value / block) * block;
  const remainder = value - lower;
  return remainder >= block * Number(threshold || 0.5) ? lower + block : lower;
}

function roundDown(minutes, unit) {
  const block = Math.max(1, Number(unit) || 15);
  return Math.floor(Math.max(0, Number(minutes) || 0) / block) * block;
}

function interruptionBooking(actual) {
  return roundByRule(actual, { unit: state.settings.interruptionUnitMinutes, mode: 'up', threshold: 0 });
}

function interruptionDeduction(actual) {
  if (actual < Number(state.settings.interruptionDeductAfterMinutes || 0)) return 0;
  return roundDown(actual, state.settings.interruptionUnitMinutes);
}

function roundingSnapshot() {
  return {
    unitMinutes: Number(state.settings.roundingUnitMinutes),
    mode: state.settings.roundingMode,
    threshold: Number(state.settings.roundingThreshold)
  };
}

function toast(message) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => {
    el.classList.remove('show');
  }, 2400);
}

function openModal(html) {
  const backdrop = $('#modal');
  const panel = $('#modalPanel');
  if (!backdrop || !panel) return;
  panel.innerHTML = html;
  backdrop.hidden = false;
  backdrop.classList.remove('hidden');
  backdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  $('.close', panel)?.addEventListener('click', closeModal);
}

function closeModal() {
  const backdrop = $('#modal');
  const panel = $('#modalPanel');
  if (!backdrop || !panel) return;
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  panel.innerHTML = '';
  document.body.style.overflow = document.body.classList.contains('km-shell-settings-open') ? 'hidden' : '';
}

function periodBounds(mode = state.ui.periodMode, anchorValue = state.ui.anchorDate) {
  const anchor = new Date(`${anchorValue}T12:00:00`);
  let start = new Date(anchor);
  let end = new Date(anchor);
  if (mode === 'day') {
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
  } else if (mode === 'week') {
    const day = (anchor.getDay() + 6) % 7;
    start.setDate(anchor.getDate() - day); start.setHours(0, 0, 0, 0);
    end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  } else if (mode === 'month') {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (mode === 'quarter') {
    const month = Math.floor(anchor.getMonth() / 3) * 3;
    start = new Date(anchor.getFullYear(), month, 1);
    end = new Date(anchor.getFullYear(), month + 3, 0, 23, 59, 59, 999);
  } else if (mode === 'all') {
    start = new Date(2000, 0, 1);
    end = new Date(2999, 11, 31, 23, 59, 59, 999);
  } else {
    start = new Date(anchor.getFullYear(), 0, 1);
    end = new Date(anchor.getFullYear(), 11, 31, 23, 59, 59, 999);
  }
  return { start, end };
}

function periodLabel() {
  const { start } = periodBounds();
  if (state.ui.periodMode === 'day') return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(start);
  if (state.ui.periodMode === 'week') return `Week ${isoWeekNumber(start)}`;
  if (state.ui.periodMode === 'month') return new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(start);
  if (state.ui.periodMode === 'quarter') return `Kwartaal ${Math.floor(start.getMonth() / 3) + 1}`;
  if (state.ui.periodMode === 'all') return 'Alle tijden';
  return String(start.getFullYear());
}

function periodSubLabel() {
  const { start, end } = periodBounds();
  if (state.ui.periodMode === 'day' || state.ui.periodMode === 'year') return '';
  if (state.ui.periodMode === 'all') return 'Volledige historie';
  return `${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(start)} – ${new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)}`;
}

function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function movePeriod(direction) {
  const d = new Date(`${state.ui.anchorDate}T12:00:00`);
  if (state.ui.periodMode === 'day') d.setDate(d.getDate() + direction);
  if (state.ui.periodMode === 'week') d.setDate(d.getDate() + 7 * direction);
  if (state.ui.periodMode === 'month') d.setMonth(d.getMonth() + direction);
  if (state.ui.periodMode === 'quarter') d.setMonth(d.getMonth() + 3 * direction);
  if (state.ui.periodMode === 'year') d.setFullYear(d.getFullYear() + direction);
  if (state.ui.periodMode === 'all') return;
  state.ui.anchorDate = dateInputValue(d);
  saveState(); render();
}

function entriesForPeriod() {
  if (state.ui.periodMode === 'all') return [...state.entries];
  const { start, end } = periodBounds();
  return state.entries.filter(e => {
    const d = new Date(e.dateISO || e.endISO || e.startISO || e.createdAt);
    return d >= start && d <= end;
  });
}

function entryIncludedInTotals(entry) {
  const theme = state.themes.find(item => String(item.id) === String(entry.themeId))
    || state.themes.find(item => item.name === entry.themeName);
  return theme?.includeInTotals !== false;
}

function totals(entries = state.entries) {
  const includedEntries = entries.filter(entryIncludedInTotals);
  return includedEntries.reduce((acc, e) => {
    acc.own += Number(e.ownMinutes) || 0;
    acc.colleague += Number(e.colleagueMinutes) || 0;
    acc.total += Number(e.totalMinutes) || 0;
    if (e.activityType === 'interruption') acc.interruptions += 1;
    return acc;
  }, { own: 0, colleague: 0, total: 0, interruptions: 0 });
}

function suggestion() {
  if (!state.themes.length) return null;
  const now = new Date();
  const weekday = now.getDay();
  const hour = now.getHours();
  const scores = new Map();
  for (const entry of state.entries.filter(e => e.activityType !== 'interruption')) {
    const key = `${entry.themeId || entry.themeName}|${entry.subthemeId || entry.subthemeName || ''}`;
    const d = new Date(entry.startISO || entry.dateISO || entry.createdAt);
    const daysAgo = Math.max(0, (Date.now() - d.getTime()) / 86400000);
    let score = Math.max(1, 14 - Math.min(13, daysAgo));
    if (d.getDay() === weekday) score += 4;
    if (Math.abs(d.getHours() - hour) <= 2) score += 3;
    const current = scores.get(key) || { score: 0, entry };
    current.score += score;
    current.entry = entry;
    scores.set(key, current);
  }
  if (scores.size) {
    const best = [...scores.values()].sort((a, b) => b.score - a.score)[0].entry;
    const theme = state.themes.find(t => t.id === best.themeId) || state.themes.find(t => t.name === best.themeName);
    if (theme) {
      const sub = state.subthemes.find(s => s.id === best.subthemeId) || state.subthemes.find(s => s.themeId === theme.id && s.name === best.subthemeName);
      return { theme, sub: sub || null, locationName: best.locationName || '' };
    }
  }
  const theme = sortedByUsage(state.themes)[0];
  const sub = sortedByUsage(state.subthemes.filter(s => s.themeId === theme.id))[0] || null;
  return { theme, sub, locationName: '' };
}

function render() {
  clearInterval(timerTick);
  timerTick = null;
  if (currentView === 'settings') {
    renderSettingsPage();
    syncNavigationChrome();
    return;
  }
  const main = $('#main');
  const periodEntries = entriesForPeriod();
  const t = totals(periodEntries);
  main.innerHTML = `${renderPeriodNav()}${renderSummary(t)}${renderActionCard()}${renderUndoCompletion()}${renderPeriodList(periodEntries)}`;
  wireHome();
  syncNavigationChrome();
  window.dispatchEvent(new CustomEvent('log-time-rendered', {
    detail: {
      view: currentView,
      periodMode: state.ui.periodMode,
      anchorDate: state.ui.anchorDate,
      entryCount: periodEntries.length
    }
  }));
}

function renderUndoCompletion() {
  return '';
}

function restoreTimerFromEntry(entry) {
  return {
    ...defaultTimer(),
    status: 'active',
    sessionId: entry.id,
    startISO: entry.startISO,
    themeId: entry.themeId || null,
    themeName: entry.themeName || '',
    subthemeId: entry.subthemeId || null,
    subthemeName: entry.subthemeName || '',
    locationName: entry.locationName || '',
    note: entry.note || ''
  };
}

function reopenLastTask(id = state.lastCompletion?.entryId) {
  if (state.timer.status !== 'inactive') return toast('Er is al een actieve taak');
  const completion = state.lastCompletion;
  if (completion?.type !== 'task' || completion.entryId !== id) return toast('Alleen de laatst afgeronde taak kan opnieuw worden geactiveerd');
  const entry = state.entries.find(item => item.id === id && item.activityType !== 'interruption');
  if (!entry?.startISO) return toast('Deze taak kan niet opnieuw worden geactiveerd');
  for (const allocation of entry.allocations || []) {
    const colleague = state.colleagues.find(item => item.id === allocation.colleagueId);
    if (colleague) colleague.usageCount = Math.max(0, Number(colleague.usageCount || 0) - 1);
  }
  state.entries = state.entries.filter(item => item.id !== entry.id);
  state.timer = restoreTimerFromEntry(entry);
  state.lastCompletion = null;
  saveState();
  render();
  toast('Taak opnieuw geactiveerd');
}

function renderPeriodNav() {
  const all = state.ui.periodMode === 'all';
  const subLabel = periodSubLabel();
  return `<section class="period-nav"><div class="period-head"><button id="periodPrev" class="period-arrow" aria-label="Vorige periode" ${all ? 'disabled' : ''}>‹</button><div class="period-center${subLabel ? '' : ' period-center-single'}"><strong>${safeText(periodLabel())}</strong>${subLabel ? `<small>${safeText(subLabel)}</small>` : ''}</div><button id="periodNext" class="period-arrow" aria-label="Volgende periode" ${all ? 'disabled' : ''}>›</button></div></section>`;
}

function renderSummary(t) {
  return `<section class="summary"><div class="summary-main"><div class="summary-label">Geboekte eigen tijd</div><div class="summary-value">${periodHours(t.own)}</div></div><div class="summary-parts"><div class="summary-part"><span>Collega's</span><strong>${periodHours(t.colleague)}</strong></div><div class="summary-part"><span>Totale inzet</span><strong>${periodHours(t.total)}</strong></div><div class="summary-part"><span>Tussenstops</span><strong>${t.interruptions}</strong></div></div></section>`;
}

function renderActionCard() {
  const timer = state.timer;
  if (timer.status === 'active') {
    const interruption = timer.interruption;
    return `<section class="active-card"><div class="kicker">${interruption ? 'Tussenstop actief' : 'Actieve activiteit'}</div><h2>${safeText(interruption?.themeName || timer.themeName || 'Activiteit')}</h2>${(interruption?.subthemeName || timer.subthemeName) ? `<p class="suggestion-sub">${safeText(interruption?.subthemeName || timer.subthemeName)}</p>` : ''}<div class="active-meta">${(interruption?.locationName || timer.locationName) ? `<span class="chip">⌖ ${safeText(interruption?.locationName || timer.locationName)}</span>` : ''}${interruption?.people?.length ? `<span class="chip">👥 ${safeText(interruption.people.map(p => p.name).join(', '))}</span>` : ''}${interruption?.departmentName ? `<span class="chip">${safeText(interruption.departmentName)}</span>` : ''}</div><div id="timerClock" class="timer-clock">00:00:00</div>${interruption ? `<div class="interrupt-card"><strong>${safeText(timer.themeName)} loopt op de achtergrond door</strong><small>Bij een korte onderbreking wordt niets afgetrokken; langere onderbrekingen worden omlaag afgerond van de hoofdactiviteit.</small></div><button id="stopInterruption" class="btn primary full">Tussenstop beëindigen</button>` : `<div class="row"><button id="stopTimer" class="btn primary">Stop</button><button id="startInterruption" class="btn">Tussenstop</button></div><button id="editActive" class="btn ghost full" style="margin-top:8px">Context wijzigen</button>`}</section>`;
  }
  if (timer.status === 'pending') {
    const calc = calculateParentTimer(timer);
    return `<section class="active-card"><div class="kicker warning">Nog af te ronden</div><h2>${safeText(timer.themeName)}</h2><p class="suggestion-sub">Werkelijk ${clockMinutes(calc.span)} · aftrek ${clockMinutes(calc.deducted)} · te boeken ${displayMinutes(calc.booked)}</p><button id="finishPending" class="btn primary full">Boeking afronden</button></section>`;
  }
  const s = suggestion();
  if (!s) return `<section class="suggestion"><div class="kicker">Start hier</div><h2>Eerste activiteit</h2><p class="suggestion-sub">Voeg tijdens het starten meteen je eerste thema toe.</p><button id="startOther" class="btn primary full">Start activiteit</button></section>`;
  return `<section class="suggestion"><div class="kicker">Waarschijnlijk nu</div><h2>${safeText(s.theme.name)}</h2>${s.sub ? `<p class="suggestion-sub">${safeText(s.sub.name)}</p>` : ''}<div class="suggestion-meta">${s.locationName ? `<span class="chip">⌖ ${safeText(s.locationName)}</span>` : ''}<span class="chip">Gebaseerd op eerder gebruik</span></div><button id="quickStart" class="btn primary full">Start</button><button id="startOther" class="btn ghost full" style="margin-top:7px">Anders kiezen</button></section>`;
}

function renderPeriodList(entries) {
  const mains = entries.filter(e => e.activityType !== 'interruption').sort((a,b) => new Date(b.dateISO || b.endISO || b.createdAt) - new Date(a.dateISO || a.endISO || a.createdAt));
  const interruptions = entries.filter(e => e.activityType === 'interruption');
  if (!entries.length) return `<section class="section"><div class="section-title"><h2>Registraties</h2><button id="manualEntry" class="btn small">+ Toevoegen</button></div><div class="empty">Nog geen registraties in deze periode.</div></section>`;
  const groups = [];
  const addRows = (entry, rows) => {
    const day = entryDayKey(entry);
    let group = groups[groups.length - 1];
    if (!group || group.day !== day) {
      group = { day, label: entryDayLabel(entry), rows: [] };
      groups.push(group);
    }
    group.rows.push(...rows);
  };
  for (const e of mains) {
    const rows = [entryRow(e)];
    interruptions.filter(x => x.parentActivityId === e.id).sort((a,b)=>new Date(a.startISO)-new Date(b.startISO)).forEach(child => rows.push(entryRow(child, true)));
    addRows(e, rows);
  }
  interruptions.filter(x => !mains.some(e => e.id === x.parentActivityId)).sort((a,b) => new Date(b.dateISO || b.endISO || b.createdAt) - new Date(a.dateISO || a.endISO || a.createdAt)).forEach(x => {
    addRows(x, [entryRow(x, true)]);
  });
  const html = groups.map(group => `<div class="activity-group"><div class="activity-group-title">${safeText(group.label)}</div><div class="list">${group.rows.join('')}</div></div>`).join('');
  return `<section class="section"><div class="section-title"><h2>Registraties</h2><button id="manualEntry" class="btn small">+ Toevoegen</button></div>${html}</section>`;
}

function entryMoment(entry) {
  return new Date(entry.dateISO || entry.endISO || entry.startISO || entry.createdAt);
}

function entryDayKey(entry) {
  return dateInputValue(entryMoment(entry));
}

function entryDayLabel(entry) {
  const date = entryMoment(entry);
  const today = dateInputValue(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const dayBeforeYesterdayDate = new Date();
  dayBeforeYesterdayDate.setDate(dayBeforeYesterdayDate.getDate() - 2);
  const key = dateInputValue(date);
  if (key === today) return 'Vandaag';
  if (key === dateInputValue(yesterdayDate)) return 'Gisteren';
  if (key === dateInputValue(dayBeforeYesterdayDate)) return 'Eergisteren';
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

function entryRow(e, interruption = false) {
  const start = e.startISO ? timeText(e.startISO) : '—';
  const total = Number(e.totalMinutes) !== Number(e.ownMinutes) ? `<small>Totaal ${displayMinutes(e.totalMinutes)}</small>` : '';
  const excluded = entryIncludedInTotals(e) ? '' : ' excluded-from-totals';
  return `<div class="entry ${interruption ? 'interruption' : ''}${excluded}" data-entry="${e.id}" data-theme-id="${safeText(e.themeId || '')}" data-subtheme-id="${safeText(e.subthemeId || '')}" style="--item-accent:${themeColor(e.themeId || e.themeName)}"><div class="entry-time">${safeText(start)}</div><div class="entry-main"><strong>${safeText(e.themeName || (interruption ? 'Tussenstop' : 'Activiteit'))}</strong>${e.subthemeName ? `<small class="entry-subtheme">${safeText(e.subthemeName)}</small>` : ''}</div><div class="entry-value-stack"><strong>${displayMinutes(e.ownMinutes)}</strong>${total}</div><div class="chev">›</div></div>`;
}

function wireHome() {
  $('#reopenLastTask')?.addEventListener('click', reopenLastTask);
  $('#periodPrev')?.addEventListener('click', () => movePeriod(-1));
  $('#periodNext')?.addEventListener('click', () => movePeriod(1));
  $$('[data-period]').forEach(btn => btn.addEventListener('click', () => { state.ui.periodMode = btn.dataset.period; saveState(); render(); }));
  $('#manualEntry')?.addEventListener('click', openManualModal);
  $('#startOther')?.addEventListener('click', () => openStartModal());
  $('#quickStart')?.addEventListener('click', () => { const s = suggestion(); if (s) startTimer(s.theme, s.sub, s.locationName || '', ''); });
  $('#stopTimer')?.addEventListener('click', beginStop);
  $('#finishPending')?.addEventListener('click', openStopModal);
  $('#startInterruption')?.addEventListener('click', openInterruptionStart);
  $('#stopInterruption')?.addEventListener('click', stopInterruption);
  $('#editActive')?.addEventListener('click', openActiveEdit);
  $$('[data-entry]').forEach(el => el.addEventListener('click', () => openEntryDetail(el.dataset.entry)));
  if (state.timer.status === 'active') {
    const update = () => { const el = $('#timerClock'); if (!el) return; const start = state.timer.interruption?.startISO || state.timer.startISO; el.textContent = durationText(Date.now() - new Date(start).getTime()); };
    update(); timerTick = setInterval(update, 1000);
  }
}

function themeOptions(selectedId = '', allowBlank = false) {
  const items = sortedByUsage(state.themes);
  return `${allowBlank ? '<option value="">Geen thema</option>' : '<option value="">Kies thema</option>'}${items.map(t => `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${safeText(t.name)}</option>`).join('')}`;
}

function subthemeOptions(themeId, selectedId = '') {
  return `<option value="">Geen subthema</option>${sortedByUsage(state.subthemes.filter(s => s.themeId === themeId)).map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${safeText(s.name)}</option>`).join('')}`;
}

function addTheme(rawName) {
  const name = cleanName(rawName); if (!name) return null;
  const existing = state.themes.find(t => t.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0); if (existing) return existing;
  const id = uid();
  const item = { id, name, color: fallbackThemeColor(id), includeInTotals: true, usageCount: 0, createdAt: new Date().toISOString() };
  state.themes.push(item);
  state.settings.themeOrder = normalizedThemeOrder([...(state.settings.themeOrder || []), id]);
  saveState();
  return item;
}

function addSubtheme(themeId, rawName) {
  const theme = state.themes.find(t => t.id === themeId); const name = cleanName(rawName); if (!theme || !name) return null;
  const existing = state.subthemes.find(s => s.themeId === themeId && s.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0); if (existing) return existing;
  const item = { id: uid(), themeId, themeName: theme.name, name, usageCount: 0, createdAt: new Date().toISOString() }; state.subthemes.push(item); saveState(); return item;
}

function renameTheme(themeId, rawName) {
  const theme = state.themes.find(item => String(item.id) === String(themeId));
  const name = cleanName(rawName);
  if (!theme || !name) return null;
  const duplicate = state.themes.find(item => String(item.id) !== String(theme.id) && item.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0);
  if (duplicate) return null;
  const oldName = theme.name;
  theme.name = name;
  state.subthemes.filter(item => String(item.themeId) === String(theme.id)).forEach(item => { item.themeName = name; });
  state.entries.filter(item => String(item.themeId) === String(theme.id) || (!item.themeId && item.themeName === oldName)).forEach(item => { item.themeName = name; });
  if (String(state.timer?.themeId || '') === String(theme.id)) state.timer.themeName = name;
  if (String(state.timer?.interruption?.themeId || '') === String(theme.id)) state.timer.interruption.themeName = name;
  saveState();
  return theme;
}

function setThemeColor(themeId, color) {
  const theme = state.themes.find(item => String(item.id) === String(themeId));
  if (!theme || !validThemeColor(color)) return null;
  theme.color = String(color).toLowerCase();
  saveState();
  render();
  return theme;
}

function setThemeIncludedInTotals(themeId, included) {
  const theme = state.themes.find(item => String(item.id) === String(themeId));
  if (!theme) return null;
  theme.includeInTotals = included !== false;
  saveState();
  render();
  return theme;
}

function includeAllThemesInTotals() {
  state.themes.forEach(theme => { theme.includeInTotals = true; });
  saveState();
  render();
  return true;
}

function excludeAllThemesFromTotals() {
  state.themes.forEach(theme => { theme.includeInTotals = false; });
  saveState();
  render();
  return true;
}

function setThemeSortMode(mode, visibleOrder = []) {
  const next = ['smart', 'alpha', 'custom'].includes(mode) ? mode : 'smart';
  if (next === 'custom' && !Array.isArray(state.settings.themeOrder)) state.settings.themeOrder = normalizedThemeOrder(visibleOrder);
  if (next === 'custom' && !state.settings.themeOrder.length) state.settings.themeOrder = normalizedThemeOrder(visibleOrder);
  state.settings.themeSortMode = next;
  state.settings.themeOrder = normalizedThemeOrder(state.settings.themeOrder);
  saveState();
  return next;
}

function setThemeOrder(themeIds) {
  state.settings.themeOrder = normalizedThemeOrder(themeIds);
  state.settings.themeSortMode = 'custom';
  saveState();
  return [...state.settings.themeOrder];
}

function renameSubtheme(subthemeId, rawName) {
  const subtheme = state.subthemes.find(item => String(item.id) === String(subthemeId));
  const name = cleanName(rawName);
  if (!subtheme || !name) return null;
  const duplicate = state.subthemes.find(item => String(item.id) !== String(subtheme.id) && String(item.themeId) === String(subtheme.themeId) && item.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0);
  if (duplicate) return null;
  const oldName = subtheme.name;
  subtheme.name = name;
  state.entries.filter(item => String(item.subthemeId) === String(subtheme.id) || (!item.subthemeId && item.subthemeName === oldName && String(item.themeId || '') === String(subtheme.themeId || ''))).forEach(item => { item.subthemeName = name; });
  if (String(state.timer?.subthemeId || '') === String(subtheme.id)) state.timer.subthemeName = name;
  if (String(state.timer?.interruption?.subthemeId || '') === String(subtheme.id)) state.timer.interruption.subthemeName = name;
  saveState();
  return subtheme;
}

function addColleague(rawName) {
  const name = cleanName(rawName); if (!name) return null;
  const existing = state.colleagues.find(c => c.name.localeCompare(name, 'nl', { sensitivity: 'base' }) === 0); if (existing) return existing;
  const item = { id: uid(), name, usageCount: 0, createdAt: new Date().toISOString() }; state.colleagues.push(item); saveState(); return item;
}

function openStartModal(prefill = {}) {
  const suggested = suggestion();
  const selectedThemeId = prefill.themeId || suggested?.theme?.id || '';
  const selectedSubId = prefill.subthemeId || suggested?.sub?.id || '';
  openModal(`<div class="modal-head"><h2 id="modalTitle">Start activiteit</h2><button class="close" aria-label="Sluiten">×</button></div><div class="field"><label>Thema</label><select id="startTheme">${themeOptions(selectedThemeId)}</select></div><div class="inline-form"><div class="field"><label>Nieuw thema</label><input id="newThemeStart" placeholder="Naam"></div><button id="addThemeStart" class="btn small">Toevoegen</button></div><div class="field"><label>Subthema</label><select id="startSubtheme">${selectedThemeId ? subthemeOptions(selectedThemeId, selectedSubId) : '<option value="">Kies eerst een thema</option>'}</select></div><div class="inline-form"><div class="field"><label>Nieuw subthema</label><input id="newSubthemeStart" placeholder="Naam"></div><button id="addSubthemeStart" class="btn small">Toevoegen</button></div><div class="field"><label>Locatie (optioneel)</label><input id="startLocation" value="${safeText(prefill.locationName || suggested?.locationName || '')}" placeholder="Bijvoorbeeld kantoor of Amsterdam"></div><div class="field"><label>Notitie (optioneel)</label><textarea id="startNote"></textarea></div><button id="confirmStart" class="btn primary full">Start</button>`);
  const theme = $('#startTheme'); const sub = $('#startSubtheme');
  const refreshSubs = (selected = '') => { sub.innerHTML = theme.value ? subthemeOptions(theme.value, selected) : '<option value="">Kies eerst een thema</option>'; };
  theme.addEventListener('change', () => refreshSubs());
  $('#addThemeStart').addEventListener('click', () => { const t = addTheme($('#newThemeStart').value); if (!t) return; theme.innerHTML = themeOptions(t.id); $('#newThemeStart').value = ''; refreshSubs(); toast('Thema toegevoegd'); });
  $('#addSubthemeStart').addEventListener('click', () => { if (!theme.value) return toast('Kies eerst een thema'); const s = addSubtheme(theme.value, $('#newSubthemeStart').value); if (!s) return; refreshSubs(s.id); $('#newSubthemeStart').value = ''; toast('Subthema toegevoegd'); });
  $('#confirmStart').addEventListener('click', () => { const t = state.themes.find(x => x.id === theme.value); if (!t) return toast('Kies eerst een thema'); const s = state.subthemes.find(x => x.id === sub.value) || null; startTimer(t, s, cleanName($('#startLocation').value), cleanName($('#startNote').value)); closeModal(); });
}

function startTimer(theme, subtheme = null, locationName = '', note = '') {
  theme.usageCount = (theme.usageCount || 0) + 1; if (subtheme) subtheme.usageCount = (subtheme.usageCount || 0) + 1;
  state.timer = { ...defaultTimer(), status: 'active', sessionId: uid(), startISO: new Date().toISOString(), themeId: theme.id, themeName: theme.name, subthemeId: subtheme?.id || null, subthemeName: subtheme?.name || '', locationName, note };
  state.lastCompletion = null;
  saveState(); render(); toast('Activiteit gestart');
}

function openActiveEdit() {
  const timer = state.timer; if (timer.status !== 'active' || timer.interruption) return;
  openModal(`<div class="modal-head"><h2 id="modalTitle">Actieve context</h2><button class="close">×</button></div><div class="field"><label>Thema</label><select id="activeTheme">${themeOptions(timer.themeId)}</select></div><div class="field"><label>Subthema</label><select id="activeSub">${subthemeOptions(timer.themeId, timer.subthemeId)}</select></div><div class="field"><label>Locatie</label><input id="activeLocation" value="${safeText(timer.locationName)}"></div><div class="field"><label>Notitie</label><textarea id="activeNote">${safeText(timer.note)}</textarea></div><button id="saveActive" class="btn primary full">Bewaar</button>`);
  $('#activeTheme').addEventListener('change', e => { $('#activeSub').innerHTML = subthemeOptions(e.target.value); });
  $('#saveActive').addEventListener('click', () => { const theme = state.themes.find(t => t.id === $('#activeTheme').value); if (!theme) return; const sub = state.subthemes.find(s => s.id === $('#activeSub').value); Object.assign(state.timer, { themeId: theme.id, themeName: theme.name, subthemeId: sub?.id || null, subthemeName: sub?.name || '', locationName: cleanName($('#activeLocation').value), note: $('#activeNote').value.trim() }); saveState(); closeModal(); render(); toast('Context bijgewerkt'); });
}

function openInterruptionStart() {
  if (state.timer.status !== 'active' || state.timer.interruption) return;
  const top = sortedByUsage(state.colleagues).slice(0, 8);
  openModal(`<div class="modal-head"><h2 id="modalTitle">Tussenstop</h2><button class="close">×</button></div><p class="muted small">Kies eventueel bij wie je meekijkt. Meerdere collega's zijn mogelijk.</p><div id="interruptPeople" class="check-list">${top.map((c,i)=>`<div class="check-row"><input type="checkbox" value="${c.id}" id="ic-${c.id}" ${i===0?'checked':''}><label for="ic-${c.id}">${safeText(c.name)}</label><small>${c.usageCount||0}×</small></div>`).join('') || '<div class="muted small">Nog geen collega\'s bekend.</div>'}</div><div class="inline-form"><div class="field"><label>Andere collega</label><input id="interruptNewColleague" placeholder="Naam"></div><button id="addInterruptColleague" class="btn small">Toevoegen</button></div><div class="field"><label>Afdeling (optioneel)</label><input id="interruptDepartment" placeholder="Bijvoorbeeld Engineering"></div><div class="field"><label>Onderwerp (optioneel)</label><select id="interruptTheme">${themeOptions('', true)}</select></div><div class="field"><label>Subthema</label><select id="interruptSub"><option value="">Geen subthema</option></select></div><div class="field"><label>Locatie (optioneel)</label><input id="interruptLocation" value="${safeText(state.timer.locationName || '')}"></div><button id="confirmInterruption" class="btn primary full">Start tussenstop</button>`);
  const refreshPeople = selected => { const set = new Set(selected); $('#interruptPeople').innerHTML = sortedByUsage(state.colleagues).slice(0, 12).map(c=>`<div class="check-row"><input type="checkbox" value="${c.id}" id="ic-${c.id}" ${set.has(c.id)?'checked':''}><label for="ic-${c.id}">${safeText(c.name)}</label><small>${c.usageCount||0}×</small></div>`).join('') || '<div class="muted small">Nog geen collega\'s bekend.</div>'; };
  $('#interruptTheme').addEventListener('change', e => { $('#interruptSub').innerHTML = e.target.value ? subthemeOptions(e.target.value) : '<option value="">Geen subthema</option>'; });
  $('#addInterruptColleague').addEventListener('click', () => { const selected = $$('#interruptPeople input:checked').map(x=>x.value); const c = addColleague($('#interruptNewColleague').value); if (!c) return; selected.push(c.id); refreshPeople(selected); $('#interruptNewColleague').value=''; toast('Collega toegevoegd'); });
  $('#confirmInterruption').addEventListener('click', () => { const people = $$('#interruptPeople input:checked').map(input => { const c = state.colleagues.find(x => x.id === input.value); if (c) c.usageCount = (c.usageCount || 0) + 1; return c ? { id: c.id, name: c.name } : null; }).filter(Boolean); const theme = state.themes.find(t => t.id === $('#interruptTheme').value); const sub = state.subthemes.find(s => s.id === $('#interruptSub').value); state.timer.interruption = { id: uid(), startISO: new Date().toISOString(), themeId: theme?.id || null, themeName: theme?.name || 'Tussenstop', subthemeId: sub?.id || null, subthemeName: sub?.name || '', departmentName: cleanName($('#interruptDepartment').value), locationName: cleanName($('#interruptLocation').value), people }; saveState(); closeModal(); render(); toast('Tussenstop gestart'); });
}

function stopInterruption() {
  const interruption = state.timer.interruption; if (!interruption) return;
  const endISO = new Date().toISOString(); const actual = actualMinutes(interruption.startISO, endISO); const booked = interruptionBooking(actual); const deduct = interruptionDeduction(actual);
  const entry = normalizeEntry({ id: interruption.id, activityType: 'interruption', parentActivityId: state.timer.sessionId, kind: 'Tussenstop', dateISO: endISO, startISO: interruption.startISO, endISO, themeId: interruption.themeId, themeName: interruption.themeName, subthemeId: interruption.subthemeId, subthemeName: interruption.subthemeName, locationName: interruption.locationName, departmentName: interruption.departmentName, people: interruption.people, actualMinutes: actual, netActualMinutes: actual, roundedMinutes: booked, ownMinutes: booked, colleagueMinutes: 0, totalMinutes: booked, deductMinutes: deduct, roundingSnapshot: { unitMinutes: Number(state.settings.interruptionUnitMinutes), mode: 'up', threshold: 0 }, createdAt: new Date().toISOString() });
  state.entries.push(entry); state.timer.interruption = null; saveState(); render(); toast(`${actual} min tussenstop · ${booked} min geboekt · ${deduct} min afgetrokken`);
}

function calculateParentTimer(timer) {
  const stop = timer.stopISO || new Date().toISOString(); const span = actualMinutes(timer.startISO, stop); const deducted = state.entries.filter(e => e.activityType === 'interruption' && e.parentActivityId === timer.sessionId).reduce((sum,e)=>sum+(Number(e.deductMinutes)||0),0); const net = Math.max(1, span - deducted); const booked = roundByRule(net); return { span, deducted, net, booked };
}

function beginStop() {
  if (state.timer.status !== 'active') return; if (state.timer.interruption) return toast('Beëindig eerst de tussenstop'); state.timer.status = 'pending'; state.timer.stopISO = new Date().toISOString(); saveState(); render(); openStopModal();
}

function colleagueSection(ownMinutes, prefix, initialAllocations = []) {
  const colleagues = sortedByUsage(state.colleagues);
  const selected = new Set(initialAllocations.map(item => String(item.colleagueId)));
  const initialMode = selected.size ? 'individual' : 'same';
  return `<div class="settings-section"><h3>Collega-inzet</h3><div id="${prefix}ColleagueList" class="check-list">${colleagues.map(c=>`<div class="check-row"><input type="checkbox" id="${prefix}c-${c.id}" value="${c.id}" class="${prefix}col-check" ${selected.has(String(c.id))?'checked':''}><label for="${prefix}c-${c.id}">${safeText(c.name)}</label><small>${c.usageCount||0}×</small></div>`).join('') || '<p class="muted small">Geen collega\'s.</p>'}</div><div class="inline-form"><div class="field"><label>Nieuwe collega</label><input id="${prefix}NewColleague"></div><button id="${prefix}AddColleague" class="btn small" type="button">Toevoegen</button></div><div id="${prefix}ColleagueTimes" style="display:none"><div class="field"><label>Verdeling</label><select id="${prefix}Mode"><option value="same" ${initialMode==='same'?'selected':''}>Zelfde als mijn geboekte tijd</option><option value="common">Eén tijd voor iedereen</option><option value="individual" ${initialMode==='individual'?'selected':''}>Per collega</option></select></div><div id="${prefix}CommonWrap" class="field" style="display:none"><label>Minuten per collega</label><input id="${prefix}CommonMinutes" type="number" min="0" value="${ownMinutes}"></div><div id="${prefix}IndividualWrap" style="display:none"></div></div></div>`;
}

function wireColleagueSection(prefix, ownMinutes, initialAllocations = []) {
  const list = $(`#${prefix}ColleagueList`), times = $(`#${prefix}ColleagueTimes`), mode = $(`#${prefix}Mode`), commonWrap = $(`#${prefix}CommonWrap`), individualWrap = $(`#${prefix}IndividualWrap`);
  const initialById = new Map(initialAllocations.map(item => [String(item.colleagueId), Math.max(0, Number(item.minutes) || 0)]));
  const currentOwnMinutes = () => Math.max(0, Number(typeof ownMinutes === 'function' ? ownMinutes() : ownMinutes) || 0);
  const selectedIds = () => $$(`.${prefix}col-check`, list).filter(x=>x.checked).map(x=>x.value);
  const renderIndividual = () => {
    const current = new Map($$(`.${prefix}individual`, individualWrap).map(input => [String(input.dataset.id), input.value]));
    individualWrap.innerHTML = selectedIds().map(id => {
      const c=state.colleagues.find(x=>String(x.id)===String(id));
      const value = current.get(String(id)) ?? initialById.get(String(id)) ?? currentOwnMinutes();
      return `<div class="field"><label>${safeText(c?.name||'')}</label><input class="${prefix}individual" data-id="${id}" type="number" min="0" value="${value}"></div>`;
    }).join('');
  };
  const refresh = () => { const ids=selectedIds(); times.style.display=ids.length?'':'none'; commonWrap.style.display=ids.length&&mode.value==='common'?'':'none'; individualWrap.style.display=ids.length&&mode.value==='individual'?'':'none'; if(mode.value==='individual')renderIndividual(); };
  list.addEventListener('change', refresh); mode.addEventListener('change', refresh);
  $(`#${prefix}AddColleague`).addEventListener('click',()=>{const selected=new Set(selectedIds());const c=addColleague($(`#${prefix}NewColleague`).value);if(!c)return;selected.add(c.id);list.innerHTML=sortedByUsage(state.colleagues).map(x=>`<div class="check-row"><input type="checkbox" id="${prefix}c-${x.id}" value="${x.id}" class="${prefix}col-check" ${selected.has(x.id)?'checked':''}><label for="${prefix}c-${x.id}">${safeText(x.name)}</label></div>`).join('');$(`#${prefix}NewColleague`).value='';refresh();});
  refresh();
  return () => { const ids=selectedIds(); const own=currentOwnMinutes(); const modeValue=mode.value; const common=Math.max(0,Number($(`#${prefix}CommonMinutes`)?.value||own)); return ids.map(id=>{const c=state.colleagues.find(x=>x.id===id);let minutes=own;if(modeValue==='common')minutes=common;if(modeValue==='individual')minutes=Math.max(0,Number($(`.${prefix}individual[data-id="${id}"]`)?.value||own));return{colleagueId:id,colleagueName:c?.name||'',minutes:Math.round(minutes)};}); };
}

function reconcileAllocationUsage(previous = [], next = []) {
  const previousIds = new Set(previous.map(item => String(item.colleagueId)));
  const nextIds = new Set(next.map(item => String(item.colleagueId)));
  state.colleagues.forEach(colleague => {
    const id = String(colleague.id);
    if (previousIds.has(id) && !nextIds.has(id)) colleague.usageCount = Math.max(0, Number(colleague.usageCount || 0) - 1);
    if (!previousIds.has(id) && nextIds.has(id)) colleague.usageCount = Number(colleague.usageCount || 0) + 1;
  });
}

function openStopModal() {
  const timer = state.timer; if (timer.status !== 'pending') return; const calc = calculateParentTimer(timer);
  openModal(`<div class="modal-head"><h2 id="modalTitle">Boeking afronden</h2><button class="close">×</button></div><div class="detail-grid"><div class="detail-item"><span>Werkelijke periode</span><strong>${clockMinutes(calc.span)}</strong></div><div class="detail-item"><span>Tussenstops afgetrokken</span><strong>${clockMinutes(calc.deducted)}</strong></div><div class="detail-item"><span>Netto werkelijke tijd</span><strong>${clockMinutes(calc.net)}</strong></div><div class="detail-item"><span>Te boeken</span><strong>${displayMinutes(calc.booked)}</strong></div></div>${colleagueSection(calc.booked,'stop')}<button id="saveStop" class="btn primary full">Opslaan</button>`);
  const getAllocations = wireColleagueSection('stop', calc.booked);
  $('#saveStop').addEventListener('click', () => { const allocations = getAllocations(); allocations.forEach(a=>{const c=state.colleagues.find(x=>x.id===a.colleagueId);if(c)c.usageCount=(c.usageCount||0)+1;}); const colleagueMinutes=allocations.reduce((s,x)=>s+x.minutes,0); const entry = normalizeEntry({ id: timer.sessionId, activityType:'normal', parentActivityId:null, kind:'Stopwatch', dateISO:timer.stopISO, themeId:timer.themeId,themeName:timer.themeName,subthemeId:timer.subthemeId,subthemeName:timer.subthemeName, locationName:timer.locationName,note:timer.note,startISO:timer.startISO,endISO:timer.stopISO, actualMinutes:calc.span,netActualMinutes:calc.net,deductedInterruptionMinutes:calc.deducted, roundedMinutes:calc.booked,ownMinutes:calc.booked,colleagueMinutes,totalMinutes:calc.booked+colleagueMinutes, allocations,roundingSnapshot:roundingSnapshot(),createdAt:new Date().toISOString() }); state.entries.push(entry); state.lastCompletion={type:'task',entryId:entry.id,completedAt:new Date().toISOString()}; state.timer=defaultTimer(); saveState(); closeModal(); render(); toast('Activiteit opgeslagen'); });
}

function openManualModal() {
  const defaultMinutes = 60; const s = suggestion();
  openModal(`<div class="modal-head"><h2 id="modalTitle">Activiteit toevoegen</h2><button class="close">×</button></div><div class="field"><label>Thema</label><select id="manualTheme">${themeOptions(s?.theme?.id||'')}</select></div><div class="inline-form"><div class="field"><label>Nieuw thema</label><input id="manualNewTheme"></div><button id="manualAddTheme" class="btn small">Toevoegen</button></div><div class="field"><label>Subthema</label><select id="manualSub">${s?.theme ? subthemeOptions(s.theme.id,s.sub?.id||'') : '<option value="">Geen subthema</option>'}</select></div><div class="field"><label>Datum</label><input id="manualDate" type="date" value="${dateInputValue()}"></div><div class="field"><label>Werkelijke minuten</label><input id="manualMinutes" type="number" min="1" value="${defaultMinutes}"></div><div id="manualPreview" class="hint">Te boeken: ${displayMinutes(roundByRule(defaultMinutes))}</div><div class="field"><label>Locatie (optioneel)</label><input id="manualLocation" value="${safeText(s?.locationName||'')}"></div><div class="field"><label>Notitie</label><textarea id="manualNote"></textarea></div><div id="manualColleagueHost">${colleagueSection(roundByRule(defaultMinutes),'manual')}</div><button id="saveManual" class="btn primary full">Opslaan</button>`);
  const theme=$('#manualTheme'),sub=$('#manualSub'),minutes=$('#manualMinutes'); let getAllocations=wireColleagueSection('manual',roundByRule(defaultMinutes));
  theme.addEventListener('change',()=>{sub.innerHTML=subthemeOptions(theme.value);});
  $('#manualAddTheme').addEventListener('click',()=>{const t=addTheme($('#manualNewTheme').value);if(!t)return;theme.innerHTML=themeOptions(t.id);sub.innerHTML=subthemeOptions(t.id);$('#manualNewTheme').value='';});
  const rebuild=()=>{const own=roundByRule(Math.max(1,Number(minutes.value)||1));$('#manualPreview').textContent=`Te boeken: ${displayMinutes(own)}`;$('#manualColleagueHost').innerHTML=colleagueSection(own,'manual');getAllocations=wireColleagueSection('manual',own);}; minutes.addEventListener('input',rebuild);
  $('#saveManual').addEventListener('click',()=>{ const t=state.themes.find(x=>x.id===theme.value);if(!t)return toast('Kies een thema');const st=state.subthemes.find(x=>x.id===sub.value);const actual=Math.max(1,Number(minutes.value)||1);const own=roundByRule(actual);const allocations=getAllocations();const colleagueMinutes=allocations.reduce((s,x)=>s+x.minutes,0);const dateISO=new Date(`${$('#manualDate').value}T12:00:00`).toISOString(); t.usageCount=(t.usageCount||0)+1;if(st)st.usageCount=(st.usageCount||0)+1;allocations.forEach(a=>{const c=state.colleagues.find(x=>x.id===a.colleagueId);if(c)c.usageCount=(c.usageCount||0)+1;}); state.entries.push(normalizeEntry({id:uid(),activityType:'normal',kind:'Handmatig',dateISO,themeId:t.id,themeName:t.name,subthemeId:st?.id||null,subthemeName:st?.name||'',startISO:null,endISO:null,actualMinutes:actual,netActualMinutes:actual,roundedMinutes:own,ownMinutes:own,colleagueMinutes,totalMinutes:own+colleagueMinutes,allocations,locationName:cleanName($('#manualLocation').value),note:$('#manualNote').value.trim(),roundingSnapshot:roundingSnapshot(),createdAt:new Date().toISOString()})); saveState();closeModal();render();toast('Activiteit toegevoegd'); });
}

function openEntryDetail(entryId) {
  const e=state.entries.find(x=>x.id===entryId);if(!e)return; const children=state.entries.filter(x=>x.parentActivityId===e.id);
  const allocationDetails = Array.isArray(e.allocations) && e.allocations.length
    ? `<div class="settings-section"><h3>Collega-inzet</h3><div class="list">${e.allocations.map(allocation => `<div class="entry"><div class="entry-main"><strong>${safeText(allocation.colleagueName || state.colleagues.find(item => String(item.id) === String(allocation.colleagueId))?.name || 'Collega')}</strong><small>${displayMinutes(allocation.minutes)}</small></div></div>`).join('')}</div></div>`
    : '';
  openModal(`<div class="modal-head"><h2 id="modalTitle">${e.activityType==='interruption'?'Tussenstop':'Registratie'}</h2><button class="close">×</button></div><div class="detail-hero" style="--item-accent:${themeColor(e.themeId || e.themeName)}"><div class="kicker">${safeText(e.kind||'Activiteit')}</div><h2>${safeText(e.themeName||'Activiteit')}</h2>${e.subthemeName?`<div class="muted">${safeText(e.subthemeName)}</div>`:''}</div><div class="detail-grid"><div class="detail-item"><span>Werkelijk</span><strong>${clockMinutes(e.actualMinutes)}</strong></div><div class="detail-item"><span>Geboekt</span><strong>${displayMinutes(e.ownMinutes)}</strong></div>${e.deductedInterruptionMinutes?`<div class="detail-item"><span>Aftrek tussenstops</span><strong>${clockMinutes(e.deductedInterruptionMinutes)}</strong></div>`:''}${e.activityType==='interruption'?`<div class="detail-item"><span>Aftrek hoofdactiviteit</span><strong>${clockMinutes(e.deductMinutes)}</strong></div>`:''}<div class="detail-item"><span>Collega-inzet</span><strong>${displayMinutes(e.colleagueMinutes)}</strong></div><div class="detail-item"><span>Totale inzet</span><strong>${displayMinutes(e.totalMinutes)}</strong></div></div><div class="settings-section"><h3>Informatie</h3><div class="list"><div class="entry"><div class="entry-main"><strong>Datum</strong><small>${dateText(e.dateISO)}</small></div></div>${e.startISO?`<div class="entry"><div class="entry-main"><strong>Tijd</strong><small>${timeText(e.startISO)}–${timeText(e.endISO)}</small></div></div>`:''}${e.locationName?`<div class="entry"><div class="entry-main"><strong>Locatie</strong><small>${safeText(e.locationName)}</small></div></div>`:''}${e.departmentName?`<div class="entry"><div class="entry-main"><strong>Afdeling</strong><small>${safeText(e.departmentName)}</small></div></div>`:''}${e.people?.length?`<div class="entry"><div class="entry-main"><strong>Bij / met</strong><small>${safeText(e.people.map(p=>p.name).join(', '))}</small></div></div>`:''}${e.note?`<div class="entry"><div class="entry-main"><strong>Notitie</strong><small>${safeText(e.note)}</small></div></div>`:''}</div></div>${allocationDetails}${children.length?`<div class="settings-section"><h3>Tussenstops</h3><div class="list">${children.map(c=>entryRow(c,true)).join('')}</div></div>`:''}<div class="row"><button id="editEntry" class="btn primary">Wijzigen</button><button id="deleteEntry" class="btn danger">Verwijderen</button></div>`);
  $$('[data-entry]').forEach(el=>el.addEventListener('click',()=>openEntryDetail(el.dataset.entry))); $('#editEntry').addEventListener('click',()=>openEntryEdit(entryId)); $('#deleteEntry').addEventListener('click',()=>{ const childCount=state.entries.filter(x=>x.parentActivityId===entryId).length; const msg=childCount?`Deze registratie en ${childCount} gekoppelde tussenstop(s) verwijderen?`:'Deze registratie verwijderen?'; if(!confirm(msg))return; state.entries=state.entries.filter(x=>x.id!==entryId&&x.parentActivityId!==entryId);saveState();closeModal();render();toast('Registratie verwijderd'); });
}

function openEntryEdit(entryId) {
  const e=state.entries.find(x=>x.id===entryId);if(!e)return; const isManual=!e.startISO||!e.endISO;
  const previousAllocations = Array.isArray(e.allocations) ? e.allocations.map(item => ({ ...item })) : [];
  const legacyColleagueMinutes = !previousAllocations.length ? Math.max(0, Number(e.colleagueMinutes) || 0) : 0;
  const colleagueEditor = e.activityType === 'interruption' ? '' : `${colleagueSection(e.ownMinutes, 'edit', previousAllocations)}${legacyColleagueMinutes ? `<p class="hint">Eerder vastgelegde collega-inzet zonder persoonsverdeling: ${displayMinutes(legacyColleagueMinutes)}. Deze blijft behouden totdat je hierboven een persoon kiest.</p>` : ''}`;
  openModal(`<div class="modal-head"><h2 id="modalTitle">Registratie wijzigen</h2><button class="close">×</button></div><div class="field"><label>Thema</label><select id="editTheme">${themeOptions(e.themeId,e.activityType==='interruption')}</select></div><div class="field"><label>Subthema</label><select id="editSub">${e.themeId?subthemeOptions(e.themeId,e.subthemeId):'<option value="">Geen subthema</option>'}</select></div>${isManual?`<div class="field"><label>Datum</label><input id="editDate" type="date" value="${dateInputValue(new Date(e.dateISO))}"></div><div class="field"><label>Werkelijke minuten</label><input id="editMinutes" type="number" min="1" value="${e.actualMinutes}"></div>`:`<div class="field"><label>Start</label><input id="editStart" type="datetime-local" value="${localDateTimeInput(e.startISO)}"></div><div class="field"><label>Einde</label><input id="editEnd" type="datetime-local" value="${localDateTimeInput(e.endISO)}"></div>`}<div class="field"><label>Locatie</label><input id="editLocation" value="${safeText(e.locationName||'')}"></div>${e.activityType==='interruption'?`<div class="field"><label>Afdeling</label><input id="editDepartment" value="${safeText(e.departmentName||'')}"></div>`:''}<div class="field"><label>Notitie</label><textarea id="editNote">${safeText(e.note||'')}</textarea></div>${colleagueEditor}<p class="hint">Tijd, collega-inzet en totalen worden na bewaren opnieuw berekend.</p><button id="saveEdit" class="btn primary full">Bewaar wijzigingen</button>`);
  const editedOwnMinutes = () => {
    if (isManual) return roundByRule(Math.max(1, Number($('#editMinutes')?.value) || 1));
    const start = new Date($('#editStart')?.value);
    const end = new Date($('#editEnd')?.value);
    if (!(end > start)) return Number(e.ownMinutes) || 0;
    const span = actualMinutes(start.toISOString(), end.toISOString());
    if (e.activityType === 'interruption') return interruptionBooking(span);
    const deducted = state.entries.filter(item => item.activityType === 'interruption' && item.parentActivityId === e.id).reduce((sum,item)=>sum+(Number(item.deductMinutes)||0),0);
    return roundByRule(Math.max(1, span - deducted));
  };
  const getEditAllocations = e.activityType === 'interruption' ? null : wireColleagueSection('edit', editedOwnMinutes, previousAllocations);
  $('#editTheme').addEventListener('change',ev=>{$('#editSub').innerHTML=ev.target.value?subthemeOptions(ev.target.value):'<option value="">Geen subthema</option>';});
  $('#saveEdit').addEventListener('click',()=>{ const theme=state.themes.find(t=>t.id===$('#editTheme').value);const sub=state.subthemes.find(s=>s.id===$('#editSub').value); e.themeId=theme?.id||null;e.themeName=theme?.name||(e.activityType==='interruption'?'Tussenstop':'Activiteit');e.subthemeId=sub?.id||null;e.subthemeName=sub?.name||'';e.locationName=cleanName($('#editLocation').value);e.note=$('#editNote').value.trim();if(e.activityType==='interruption')e.departmentName=cleanName($('#editDepartment').value); if(isManual){const actual=Math.max(1,Number($('#editMinutes').value)||1);e.dateISO=new Date(`${$('#editDate').value}T12:00:00`).toISOString();e.actualMinutes=actual;e.netActualMinutes=actual;e.roundedMinutes=roundByRule(actual);e.ownMinutes=e.roundedMinutes;} else{const start=new Date($('#editStart').value);const end=new Date($('#editEnd').value);if(!(end>start))return toast('Eindtijd moet na starttijd liggen');e.startISO=start.toISOString();e.endISO=end.toISOString();e.dateISO=e.endISO;e.actualMinutes=actualMinutes(e.startISO,e.endISO);if(e.activityType==='interruption'){e.netActualMinutes=e.actualMinutes;e.roundedMinutes=interruptionBooking(e.actualMinutes);e.ownMinutes=e.roundedMinutes;e.deductMinutes=interruptionDeduction(e.actualMinutes);}else{recalculateNormalEntry(e);}} if(getEditAllocations){const allocations=getEditAllocations();reconcileAllocationUsage(previousAllocations,allocations);e.allocations=allocations;e.colleagueMinutes=allocations.length?allocations.reduce((sum,item)=>sum+(Number(item.minutes)||0),0):legacyColleagueMinutes;} e.totalMinutes=(Number(e.ownMinutes)||0)+(Number(e.colleagueMinutes)||0);if(e.parentActivityId){const parent=state.entries.find(x=>x.id===e.parentActivityId);if(parent)recalculateNormalEntry(parent);}saveState();closeModal();render();toast('Registratie bijgewerkt'); });
}

function recalculateNormalEntry(entry) {
  if (!entry.startISO || !entry.endISO) return; const span=actualMinutes(entry.startISO,entry.endISO);const deducted=state.entries.filter(x=>x.activityType==='interruption'&&x.parentActivityId===entry.id).reduce((s,x)=>s+(Number(x.deductMinutes)||0),0);const net=Math.max(1,span-deducted);const booked=roundByRule(net); entry.actualMinutes=span;entry.netActualMinutes=net;entry.deductedInterruptionMinutes=deducted;entry.roundedMinutes=booked;entry.ownMinutes=booked;entry.totalMinutes=booked+(Number(entry.colleagueMinutes)||0);
}

function settingsAccordion(title, subtitle, body) {
  return `<details class="settings-accordion"><summary><span class="settings-accordion-title"><strong>${safeText(title)}</strong><small>${safeText(subtitle)}</small></span><span class="settings-accordion-arrow">›</span></summary><div class="settings-accordion-body">${body}</div></details>`;
}

function openSettings({ scroll = true } = {}) {
  currentView = 'settings';
  closeModal();
  render();
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeSettings({ scroll = true } = {}) {
  currentView = 'home';
  closeModal();
  render();
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function syncNavigationChrome() {
  const settings = currentView === 'settings';
  const title = $('#appTitle');
  const count = $('#appTaskCount');
  const action = $('#openSettings');
  if (title) title.textContent = settings ? 'Instellingen' : 'Tijdsregistratie';
  if (count) count.dataset.navigationView = settings ? 'settings' : 'home';
  if (action) {
    action.textContent = settings ? '←' : '⚙︎';
    action.setAttribute('aria-label', settings ? 'Terug naar tijdsregistratie' : 'Instellingen');
  }
  window.dispatchEvent(new CustomEvent('log-time-view-change', { detail: { view: currentView } }));
}

function renderSettingsPage() {
  const timeBody = `<div class="field"><label>Weergave</label><select id="timeDisplay"><option value="decimal" ${state.settings.timeDisplay==='decimal'?'selected':''}>Decimale uren (1,25)</option><option value="clock" ${state.settings.timeDisplay==='clock'?'selected':''}>Uren:minuten (1:15)</option></select></div><div class="field"><label>Afronding</label><select id="roundMode"><option value="none" ${state.settings.roundingMode==='none'?'selected':''}>Geen afronding</option><option value="up" ${state.settings.roundingMode==='up'?'selected':''}>Altijd omhoog</option><option value="threshold" ${state.settings.roundingMode==='threshold'?'selected':''}>Vanaf drempel omhoog</option></select></div><div class="field"><label>Tijdseenheid</label><select id="roundUnit">${ROUNDING_UNITS.map(x=>`<option value="${x}" ${Number(state.settings.roundingUnitMinutes)===x?'selected':''}>${x} min · ${decimalHours(x)} uur</option>`).join('')}</select></div><div class="field"><label>Drempel</label><select id="roundThreshold">${[.25,.5,.75].map(x=>`<option value="${x}" ${Number(state.settings.roundingThreshold)===x?'selected':''}>${Math.round(x*100)}%</option>`).join('')}</select></div>`;
  const controlBody = `<div class="check-row settings-toggle-row"><input id="swipeDeleteEnabled" type="checkbox" ${state.settings.swipeDeleteEnabled!==false?'checked':''}><label for="swipeDeleteEnabled"><strong>Registraties verwijderen met swipe</strong><small>Bewerken blijft altijd mogelijk. Lege thema’s worden apart opgeruimd; gebruikte thema’s worden gearchiveerd.</small></label></div>`;
  const interruptionBody = `<p class="muted small">Tussenstops worden altijd omhoog afgerond. Aftrek van de hoofdactiviteit wordt altijd omlaag afgerond.</p><div class="field"><label>Eenheid tussenstop</label><select id="interruptUnit">${ROUNDING_UNITS.map(x=>`<option value="${x}" ${Number(state.settings.interruptionUnitMinutes)===x?'selected':''}>${x} minuten</option>`).join('')}</select></div><div class="field"><label>Hoofdactiviteit aftrekken vanaf</label><select id="interruptThreshold">${[5,10,15,30,45,60].map(x=>`<option value="${x}" ${Number(state.settings.interruptionDeductAfterMinutes)===x?'selected':''}>${x} minuten</option>`).join('')}</select></div>`;
  const colleagueBody = `<div class="settings-list">${sortedByUsage(state.colleagues).map(c=>`<div class="settings-list-row"><div class="entry-main"><strong>${safeText(c.name)}</strong><small>${c.usageCount||0}× gebruikt</small></div><button class="settings-row-action danger" data-delete-colleague="${c.id}">Wis</button></div>`).join('')||'<p class="muted small">Nog geen collega\'s.</p>'}</div><div class="inline-form"><div class="field"><label>Nieuwe collega</label><input id="settingsNewColleague"></div><button id="settingsAddColleague" class="btn small">Toevoegen</button></div>`;
  const dataBody = `<p class="muted small">De complete back-up en herstelactie staan in de algemene instellingen van Log.</p><button id="resetData" class="settings-danger-action">Wis alle tijdregistratiegegevens</button>`;
  $('#main').innerHTML = `<section class="settings-page">${settingsAccordion('Tijd en afronding', `${displayMinutes(state.settings.roundingUnitMinutes)} · ${state.settings.roundingMode==='none'?'geen afronding':'afronding actief'}`, timeBody)}${settingsAccordion('Bediening', 'Swipe en verwijderen', controlBody)}${settingsAccordion('Tussenstops', `${state.settings.interruptionUnitMinutes} minuten`, interruptionBody)}${settingsAccordion("Collega's", `${state.colleagues.length} opgeslagen`, colleagueBody)}${settingsAccordion('Gegevensbeheer', 'Tijdregistratie wissen', dataBody)}</section>`;
  $('#swipeDeleteEnabled')?.addEventListener('change',event=>{state.settings.swipeDeleteEnabled=event.target.checked;saveState();toast('Instelling bewaard');});
  const saveSettings=()=>{state.settings.timeDisplay=$('#timeDisplay').value;state.settings.roundingMode=$('#roundMode').value;state.settings.roundingUnitMinutes=Number($('#roundUnit').value);state.settings.roundingThreshold=Number($('#roundThreshold').value);state.settings.interruptionUnitMinutes=Number($('#interruptUnit').value);state.settings.interruptionDeductAfterMinutes=Number($('#interruptThreshold').value);saveState();};
  ['timeDisplay','roundMode','roundUnit','roundThreshold','interruptUnit','interruptThreshold'].forEach(id=>$('#'+id).addEventListener('change',()=>{saveSettings();toast('Instelling bewaard');})); $('#settingsAddColleague').addEventListener('click',()=>{if(addColleague($('#settingsNewColleague').value)){openSettings();toast('Collega toegevoegd');}}); $$('[data-delete-colleague]').forEach(btn=>btn.addEventListener('click',()=>{const c=state.colleagues.find(x=>x.id===btn.dataset.deleteColleague);if(c&&confirm(`Collega "${c.name}" uit beheer verwijderen?`)){state.colleagues=state.colleagues.filter(x=>x.id!==c.id);saveState();openSettings();}})); $('#resetData').addEventListener('click',resetAll);
}

function exportBackup() {
  const payload=JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2);const blob=new Blob([payload],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`urenregistratie-backup-${dateInputValue()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup aangemaakt');
}

function importBackup(event) {
  const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));if(!Array.isArray(parsed.entries)||!Array.isArray(parsed.themes))throw new Error('formaat');if(!confirm('Huidige gegevens vervangen door deze backup?'))return;localStorage.setItem(STORAGE_KEY,JSON.stringify(parsed));state=loadState();closeModal();render();toast('Backup hersteld');}catch{alert('Dit bestand is geen geldige Urenregistratie-backup.');}finally{event.target.value='';}};reader.readAsText(file);
}

async function resetAll() {
  const policy = window.LogRemovalPolicy;
  const plan = policy?.createPlan({
    entityType: 'time-data',
    id: 'all',
    label: 'Alle tijdregistratiegegevens',
    owned: [
      state.entries.length ? { key: 'entries', label: state.entries.length === 1 ? 'registratie' : 'registraties', count: state.entries.length } : null,
      state.themes.length ? { key: 'themes', label: state.themes.length === 1 ? 'thema' : "thema's", count: state.themes.length } : null,
      state.subthemes.length ? { key: 'subthemes', label: state.subthemes.length === 1 ? 'subthema' : "subthema's", count: state.subthemes.length } : null,
      state.colleagues.length ? { key: 'colleagues', label: state.colleagues.length === 1 ? 'collega' : "collega's", count: state.colleagues.length } : null
    ],
    incoming: []
  });
  const approved = plan ? await policy.confirmDelete(plan) : confirm('Alle urenregistratiegegevens wissen?');
  if (!approved) return;
  state = defaultState();
  saveState();
  closeModal();
  render();
  toast('Alle gegevens gewist');
}

function startFromEntry(entryId) {
  if (state.timer.status !== 'inactive') return false;
  const entry = state.entries.find(item => String(item.id) === String(entryId) && item.activityType !== 'interruption');
  if (!entry) return false;
  const theme = state.themes.find(item => String(item.id) === String(entry.themeId)) || state.themes.find(item => item.name === entry.themeName);
  if (!theme) return false;
  const subtheme = state.subthemes.find(item => String(item.id) === String(entry.subthemeId)) || null;
  startTimer(theme, subtheme, entry.locationName || '', '');
  return true;
}

function reloadFromStorage({ view = currentView } = {}) {
  state = loadState();
  currentView = view === 'settings' ? 'settings' : 'home';
  closeModal();
  render();
}

function init() {
  $('#openSettings')?.addEventListener('click',()=>currentView==='settings'?closeSettings():openSettings());
  $('#modal')?.addEventListener('click',event=>{if(event.target===$('#modal'))closeModal();});
  render();
}

// Read persisted timer state again at confirmation, including changes from another tab.
function startFromCard({themeId,subthemeId,locationName=''}) {
  state=loadState();
  if(state.timer.status!=='inactive')throw Error('Er loopt nog een taak of er wacht een taak op afronding. Rond die eerst af.');
  const theme=state.themes.find(item=>item.id===themeId);
  const subtheme=subthemeId?state.subthemes.find(item=>item.id===subthemeId&&item.themeId===themeId):null;
  if(!theme || (subthemeId&&!subtheme))throw Error('Het gekoppelde thema of subthema is niet meer beschikbaar. Bewerk de kaart.');
  try { startTimer(theme,subtheme,locationName); }
  catch(error){state=loadState();throw error;}
  return true;
}

window.LogTimeModule = Object.freeze({
  getState: () => state,
  getPeriodEntries: () => entriesForPeriod(),
  getThemeCatalog: () => ({
    themes: state.themes.map(item => ({ ...item, lastUsedAt: themeLastUsedAt(item) })),
    subthemes: state.subthemes.map(item => ({ ...item })),
    sortMode: themeSortMode(),
    themeOrder: normalizedThemeOrder()
  }),
  createTheme: rawName => addTheme(rawName),
  createSubtheme: (themeId, rawName) => addSubtheme(themeId, rawName),
  renameTheme,
  renameSubtheme,
  setThemeColor,
  setThemeIncludedInTotals,
  includeAllThemesInTotals,
  excludeAllThemesFromTotals,
  setThemeSortMode,
  setThemeOrder,
  getView: () => currentView,
  showHome: options => closeSettings(options),
  showSettings: options => openSettings(options),
  reloadFromStorage,
  startFromEntry,
  startFromCard,
  resumeEntry: entryId => reopenLastTask(entryId),
  editEntry: entryId => openEntryEdit(entryId),
  openEntry: entryId => openEntryDetail(entryId),
  render
});

window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY) return;
  state = loadState();
  render();
});

window.addEventListener('pageshow', () => {
  state = loadState();
  render();
});

document.addEventListener('DOMContentLoaded',init);
