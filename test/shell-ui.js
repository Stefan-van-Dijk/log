(function () {
  'use strict';

  const BUILD = window.LOG_TEST_BUILD || '0.31.10-test.112';
  const SHELL_VERSION = (() => {
    try {
      const script = document.currentScript || [...document.scripts].find(item => item.src.includes('shell-ui.js'));
      return window.LOG_TEST_BUILD || new URL(script?.src || location.href).searchParams.get('v') || BUILD;
    } catch (_) {
      return BUILD;
    }
  })();
  const DATA_KEY = 'kmreg-test-v4-data';
  const KM_STATE_EVENT = 'log-km-state-change';
  const MODE_KEY = 'kmreg-test-active-app-v1';
  const SECTION_KEY = 'kmreg-test-shell-section-v1';
  const DRAWER_KEY = 'kmreg-test-shell-drawer-v1';
  const MENU_DOCUMENT_URL = './config/modules.json';
  const MENU_DOCUMENT_CACHE_KEY = 'log-test-menu-document-v3';
  const MENU_SCHEMA_VERSION = 3;
  const THEMES_NAVIGATION_MIGRATION_KEY = 'log-test-native-themes-navigation-v1';
  const FALLBACK_MENU_DOCUMENT = {
    schemaVersion: MENU_SCHEMA_VERSION,
    modules: [
      { id: 'rides', label: 'Ritten', shortLabel: 'Ritten', subtitle: 'Ritten registreren en terugvinden', icon: 'rides', available: true, defaultPlacement: 'both', bottomOrder: 10, menuOrder: 10, view: 'rides', settingsTarget: 'rides' },
      { id: 'time', label: 'Tijd en taken', shortLabel: 'Tijd/taken', subtitle: 'Tijd en werkzaamheden registreren', icon: 'time', available: true, defaultPlacement: 'both', bottomOrder: 20, menuOrder: 20, view: 'time', settingsTarget: 'time' },
      { id: 'locations', label: 'Locaties', shortLabel: 'Locaties', subtitle: 'Adressen en herkenning beheren', icon: 'locations', available: true, defaultPlacement: 'both', bottomOrder: 30, menuOrder: 30, view: 'locations', settingsTarget: 'locations' },
      { id: 'themes', label: 'Thema’s', shortLabel: 'Thema’s', subtitle: 'Thema’s en subthema’s beheren', icon: 'themes', available: true, defaultPlacement: 'both', bottomOrder: 40, menuOrder: 40, view: 'themes', settingsTarget: null },
      { id: 'barcodes', label: 'Barcodekaarten', shortLabel: 'Kaarten', subtitle: 'Barcodekaarten scannen en beheren', icon: 'barcodes', available: true, defaultPlacement: 'hidden', bottomOrder: 50, menuOrder: 50, view: 'placeholder', settingsTarget: null }
    ]
  };
  const ROOT_SECTIONS = new Set();
  let MODULE_CATALOG = [];

  function normalizeMenuDocument(value) {
    if (!value || value.schemaVersion !== MENU_SCHEMA_VERSION || !Array.isArray(value.modules)) return null;
    const icons = new Set(['rides', 'time', 'locations', 'themes', 'barcodes']);
    const views = new Set(['rides', 'time', 'locations', 'themes', 'placeholder']);
    const settingsTargets = new Set(['rides', 'time', 'locations']);
    const seen = new Set();
    const modules = [];
    for (const source of value.modules) {
      if (!source || source.available === false) continue;
      const id = String(source.id || '').trim();
      const label = String(source.label || '').trim();
      const shortLabel = String(source.shortLabel || label).trim();
      const subtitle = String(source.subtitle || '').trim();
      const view = String(source.view || '').trim();
      if (!/^[a-z][a-z0-9_-]{1,31}$/.test(id) || seen.has(id) || !label || !shortLabel || !views.has(view)) continue;
      if (view !== 'placeholder' && id !== view) continue;
      seen.add(id);
      modules.push({
        id,
        label: label.slice(0, 40),
        shortLabel: shortLabel.slice(0, 16),
        subtitle: subtitle.slice(0, 120),
        icon: icons.has(source.icon) ? source.icon : 'themes',
        defaultPlacement: ['bottom', 'menu', 'both', 'hidden'].includes(source.defaultPlacement) ? source.defaultPlacement : 'both',
        bottomOrder: Number.isFinite(Number(source.bottomOrder)) ? Number(source.bottomOrder) : modules.length * 10,
        menuOrder: Number.isFinite(Number(source.menuOrder)) ? Number(source.menuOrder) : modules.length * 10,
        view,
        settingsTarget: settingsTargets.has(source.settingsTarget) ? source.settingsTarget : null,
        placeholder: view === 'placeholder'
      });
    }
    return modules.length ? modules.sort((a, b) => Math.min(a.bottomOrder, a.menuOrder) - Math.min(b.bottomOrder, b.menuOrder) || a.label.localeCompare(b.label, 'nl')) : null;
  }

  function applyModuleCatalog(modules) {
    MODULE_CATALOG = modules.map(module => ({ ...module }));
    ROOT_SECTIONS.clear();
    MODULE_CATALOG.forEach(module => ROOT_SECTIONS.add(module.id));
  }

  function cachedMenuDocument() {
    try {
      return JSON.parse(localStorage.getItem(MENU_DOCUMENT_CACHE_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  applyModuleCatalog(
    normalizeMenuDocument(cachedMenuDocument()) ||
    normalizeMenuDocument(FALLBACK_MENU_DOCUMENT)
  );

  let section = localStorage.getItem(SECTION_KEY);
  if (!ROOT_SECTIONS.has(section)) section = localStorage.getItem(MODE_KEY) === 'time' ? 'time' : 'rides';
  let drawerOpen = false;
  let drawerPeek = false;
  let expandedLocationId = null;
  let expandedThemeId = null;
  let locationSwipe = null;
  let themeSwipe = null;
  let pendingParentForNew = null;
  let kmSettingsMounted = false;
  let timeSettingsMounted = false;
  let kmAppPlaceholder = null;
  let timeModulePlaceholder = null;
  let lastEditorState = document.body.classList.contains('editor-view');
  let locationEditorAugmentQueued = false;
  let activeSettingsTarget = null;
  let settingsMountToken = 0;
  let sectionTransitioning = false;
  let scrollRestoreToken = 0;
  const windowScrollState = { top: viewportScrollTop(), reverse: 0 };
  const sectionScrollPositions = new Map([[section, windowScrollState.top]]);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  function viewportScrollTop() {
    if (document.scrollingElement) return Math.max(0, Number(document.scrollingElement.scrollTop) || 0);
    return Math.max(0, Number(window.scrollY) || Number(window.pageYOffset) || Number(document.documentElement?.scrollTop) || Number(document.body?.scrollTop) || 0);
  }

  function setViewportScrollTop(top) {
    const target = Math.max(0, Number(top) || 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = target;
    document.documentElement.scrollTop = target;
    document.body.scrollTop = target;
    window.scrollTo(0, target);
  }

  async function refreshMenuDocument() {
    try {
      const response = await fetch(MENU_DOCUMENT_URL, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Menuconfiguratie niet beschikbaar (' + response.status + ').');
      const documentValue = await response.json();
      const modules = normalizeMenuDocument(documentValue);
      if (!modules) throw new Error('Menuconfiguratie heeft geen geldige modules.');
      try { localStorage.setItem(MENU_DOCUMENT_CACHE_KEY, JSON.stringify(documentValue)); } catch (_) {}
      applyModuleCatalog(modules);
      refreshShellUI();
    } catch (error) {
      console.warn('De laatst geldige menuconfiguratie blijft actief.', error);
    }
  }

  function readData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DATA_KEY) || '{}');
      return {
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : {},
        locations: Array.isArray(parsed.locations) ? parsed.locations : [],
        trips: Array.isArray(parsed.trips) ? parsed.trips : [],
        events: Array.isArray(parsed.events) ? parsed.events : []
      };
    } catch (_) {
      return { settings: {}, locations: [], trips: [], events: [] };
    }
  }

  function migrateThemesNavigation() {
    if (localStorage.getItem(THEMES_NAVIGATION_MIGRATION_KEY) === '1') return;
    try {
      const raw = JSON.parse(localStorage.getItem(DATA_KEY) || '{}');
      const navigation = raw?.settings?.navigationModules;
      if (Array.isArray(navigation)) {
        const stored = navigation.find(item => item?.id === 'themes');
        if (stored) {
          if (stored.enabled === false) stored.placement = 'both';
          stored.enabled = true;
        } else navigation.push({ id: 'themes', placement: 'both', bottomOrder: navigation.length, menuOrder: navigation.length });
        localStorage.setItem(DATA_KEY, JSON.stringify(raw));
      }
      localStorage.setItem(THEMES_NAVIGATION_MIGRATION_KEY, '1');
    } catch (error) {
      console.warn('Thema’s konden niet automatisch aan de navigatie worden toegevoegd.', error);
    }
  }

  function moduleById(id) {
    return MODULE_CATALOG.find(module => module.id === id) || null;
  }

  function moduleConfiguration(snapshot = readData()) {
    const saved = Array.isArray(snapshot.settings?.navigationModules) ? snapshot.settings.navigationModules : [];
    const savedById = new Map(saved.filter(item => item && ROOT_SECTIONS.has(item.id)).map(item => [item.id, item]));
    const placements = new Set(['bottom', 'menu', 'both', 'hidden']);
    const config = MODULE_CATALOG.map((module, index) => {
      const stored = savedById.get(module.id);
      const legacyPlacement = stored?.enabled === false ? 'hidden' : module.defaultPlacement;
      const placement = placements.has(stored?.placement) ? stored.placement : legacyPlacement;
      const legacyOrder = Number.isFinite(Number(stored?.order)) ? Number(stored.order) : index;
      return {
        id: module.id,
        placement,
        bottomOrder: Number.isFinite(Number(stored?.bottomOrder)) ? Number(stored.bottomOrder) : (stored ? legacyOrder : module.bottomOrder),
        menuOrder: Number.isFinite(Number(stored?.menuOrder)) ? Number(stored.menuOrder) : (stored ? legacyOrder : module.menuOrder)
      };
    });
    if (!config.some(item => item.placement !== 'hidden') && config[0]) config[0].placement = 'both';
    return config;
  }

  function moduleSurfaceEnabled(item, surface) {
    return item?.placement === 'both' || item?.placement === surface;
  }

  function placementForSurfaces(bottomOn, menuOn) {
    return bottomOn && menuOn ? 'both' : bottomOn ? 'bottom' : menuOn ? 'menu' : 'hidden';
  }

  function bottomBarEnabled(snapshot = readData()) {
    return snapshot.settings?.bottomBarEnabled !== false;
  }

  function hasReachableModule(config, showBottomBar = bottomBarEnabled()) {
    return config.some(item => moduleSurfaceEnabled(item, 'menu') || (showBottomBar && moduleSurfaceEnabled(item, 'bottom')));
  }

  function enabledModules(snapshot = readData()) {
    const showBottomBar = bottomBarEnabled(snapshot);
    return moduleConfiguration(snapshot)
      .filter(item => moduleSurfaceEnabled(item, 'menu') || (showBottomBar && moduleSurfaceEnabled(item, 'bottom')))
      .map(item => moduleById(item.id))
      .filter(Boolean);
  }

  function navigationModules(surface, snapshot = readData()) {
    const orderKey = surface === 'bottom' ? 'bottomOrder' : 'menuOrder';
    return moduleConfiguration(snapshot)
      .filter(item => item.placement === 'both' || item.placement === surface)
      .sort((a, b) => a[orderKey] - b[orderKey] || a.id.localeCompare(b.id, 'nl'))
      .map(item => moduleById(item.id))
      .filter(Boolean);
  }

  function notifyActiveViewRefresh() {
    window.dispatchEvent(new CustomEvent('log-shell-view-refresh', { detail: { section } }));
  }

  function refreshShellUI() {
    const visible = enabledModules();
    if (!visible.some(module => module.id === section)) {
      section = visible[0]?.id || MODULE_CATALOG[0]?.id || 'rides';
      localStorage.setItem(SECTION_KEY, section);
      localStorage.setItem(MODE_KEY, section === 'time' ? 'time' : 'kilometers');
    }
    renderNavigation();
    renderModuleSettings();
    const settingsTargetOpen = $('#kmShellSettings')?.classList.contains('open') && activeSettingsTarget;
    if (settingsTargetOpen) syncChrome();
    else showSection();
    requestAnimationFrame(() => {
      syncChrome();
      applyShellSearch();
    });
  }

  function refreshKmState(detail = {}) {
    if (String(detail.reason || '').startsWith('location-') && localStorage.getItem(SECTION_KEY) === 'locations') section = 'locations';
    if (section === 'locations') {
      if (document.body.classList.contains('editor-view')) scheduleLocationRefresh();
      else renderLocations();
      notifyActiveViewRefresh();
    }
    filterTripLocationSelects();
    syncChrome();
    applyShellSearch();
  }

  let locationRefreshToken = 0;
  function scheduleLocationRefresh() {
    const token = ++locationRefreshToken;
    const apply = attempts => {
      if (token !== locationRefreshToken || section !== 'locations') return;
      if (document.body.classList.contains('editor-view')) {
        if (attempts < 12) setTimeout(() => apply(attempts + 1), 40);
        return;
      }
      document.body.classList.add('km-shell-locations-mode');
      renderLocations();
      syncChrome();
      applyShellSearch();
    };
    requestAnimationFrame(() => apply(0));
  }

  function focusModuleControl(id, surface = '') {
    if (!id) return;
    requestAnimationFrame(() => {
      const host = $('#kmShellModuleSettings');
      if (!host) return;
      if (surface === 'global-bottom') {
        host.querySelector('[data-bottom-bar-toggle]')?.focus({ preventScroll: true });
        return;
      }
      if (surface) {
        const toggle = $$('.km-shell-module-row[data-module-id]', host)
          .find(candidate => candidate.dataset.moduleId === id && candidate.closest('[data-module-surface]')?.dataset.moduleSurface === surface)
          ?.querySelector('[data-module-surface-toggle]');
        toggle?.focus({ preventScroll: true });
        return;
      }
      const row = host ? $$('.km-shell-module-row[data-module-id]', host)
        .find(candidate => candidate.dataset.moduleId === id && candidate.querySelector('[data-module-drag-handle]')) : null;
      row?.querySelector('[data-module-drag-handle]')?.focus({ preventScroll: true });
    });
  }

  function saveModuleConfiguration(config, focusId = '', focusSurface = '', showBottomBar = bottomBarEnabled()) {
    const normalized = config.map(item => ({
      id: item.id,
      placement: ['bottom', 'menu', 'both', 'hidden'].includes(item.placement) ? item.placement : 'both',
      bottomOrder: Number(item.bottomOrder) || 0,
      menuOrder: Number(item.menuOrder) || 0
    }));
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(DATA_KEY) || '{}'); } catch (_) {}
    if (!raw || typeof raw !== 'object') raw = {};
    if (!raw.settings || typeof raw.settings !== 'object') raw.settings = {};
    raw.settings.navigationModules = normalized;
    raw.settings.bottomBarEnabled = showBottomBar !== false;
    localStorage.setItem(DATA_KEY, JSON.stringify(raw));
    window.dispatchEvent(new CustomEvent('log-navigation-modules-change', { detail: { modules: normalized, bottomBarEnabled: showBottomBar !== false } }));
    refreshShellUI();
    focusModuleControl(focusId, focusSurface);
  }

  function moduleIcon(id) {
    const icons = {
      rides: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5h16M6.5 17.5l1.2-6.2h8.6l1.2 6.2M8.8 11.3l1-3h4.4l1 3"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>',
      time: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.3 2"/></svg>',
      locations: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6-5.8 6-11a6 6 0 1 0-12 0c0 5.2 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>',
      themes: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><circle cx="8" cy="16" r="3"/><circle cx="16" cy="16" r="3"/></svg>',
      barcodes: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5v14M7 5v14M11 5v14M14 5v14M19 5v14M17 5v14"/></svg>'
    };
    const icon = moduleById(id)?.icon || id;
    return icons[icon] || icons.themes;
  }

  function themeColor(value) {
    if (value && typeof value === 'object' && /^#[0-9a-f]{6}$/i.test(String(value.color || ''))) return value.color;
    const palette = ['#a875ff', '#4da3ff', '#49d17d', '#ff9f0a', '#ff6767', '#4da3ff', '#ffbd4a', '#8e8e93'];
    const key = value && typeof value === 'object' ? value.id || value.name : value;
    let hash = 0;
    for (const char of String(key || 'theme')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return palette[Math.abs(hash) % palette.length];
  }

  function renderNavigation() {
    const snapshot = readData();
    const menuModules = navigationModules('menu', snapshot);
    const bottomModules = navigationModules('bottom', snapshot);
    const showBottomBar = bottomBarEnabled(snapshot);
    const nav = $('#kmShellDrawerNav');
    if (nav) {
      nav.innerHTML = menuModules.map(module => `<button class="km-shell-nav-button" type="button" data-shell-section="${module.id}"><span class="icon">${moduleIcon(module.id)}</span><span>${esc(module.label)}</span></button>`).join('') || '<div class="km-shell-nav-empty">Geen modules in het menu.</div>';
    }
    const tabbar = $('#kmShellTabBar');
    if (tabbar) {
      const hasMore = bottomModules.length > 5;
      const primary = hasMore ? bottomModules.slice(0, 4) : bottomModules;
      const moreButton = hasMore
        ? '<button class="km-shell-tab-button km-shell-tab-more" type="button" data-shell-more aria-label="Meer onderdelen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg><span>Meer</span></button>'
        : '';
      tabbar.style.setProperty('--km-tab-count', String(Math.max(1, primary.length + (hasMore ? 1 : 0))));
      tabbar.innerHTML = primary.map(module => `<button class="km-shell-tab-button" type="button" data-shell-tab="${module.id}" aria-label="${esc(module.label)}">${moduleIcon(module.id)}<span>${esc(module.shortLabel)}</span></button>`).join('') + moreButton;
      tabbar.hidden = !showBottomBar || bottomModules.length === 0;
    }
    document.body.classList.toggle('km-shell-tabbar-disabled', !showBottomBar || bottomModules.length === 0);
    syncDrawerSelection();
  }

  function locationById(id, snapshot = readData()) {
    return snapshot.locations.find(location => location.id === id) || null;
  }

  function typeLabel(type) {
    return ({ home: 'Thuis', work: 'Werk', business: 'Zakelijk', private: 'Privé', other: 'Overig' })[type] || 'Overig';
  }

  function locationGlyph(type) {
    const paths = {
      home: '<path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4z"/>',
      work: '<path d="M4 8h16v11H4z"/><path d="M9 8V5h6v3M4 12h16M10 12v2h4v-2"/>',
      business: '<path d="M6 20V5h12v15M9 8h2m2 0h2M9 12h2m2 0h2M9 16h2m2 0h2"/>',
      private: '<circle cx="12" cy="8" r="3"/><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6"/>',
      other: '<path d="M12 21s6-6.2 6-12a6 6 0 1 0-12 0c0 5.8 6 12 6 12z"/><circle cx="12" cy="9" r="2"/>'
    };
    const key = Object.hasOwn(paths, type) ? type : 'other';
    return `<svg viewBox="0 0 24 24" aria-hidden="true" data-location-type="${key}">${paths[key]}</svg>`;
  }

  function effectiveLocation(location, snapshot = readData()) {
    const parent = location?.parentId ? locationById(location.parentId, snapshot) : null;
    return {
      address: location?.address || parent?.address || '',
      lat: location?.lat ?? parent?.lat ?? null,
      lng: location?.lng ?? parent?.lng ?? null,
      parent
    };
  }

  function injectStyles() {
    if ($('#kmregShellStyles')) return;
    const style = document.createElement('style');
    style.id = 'kmregShellStyles';
    style.textContent = `
      .km-shell-top{display:grid!important;grid-template-columns:42px minmax(0,1fr) 42px;align-items:center!important;gap:8px;padding:12px 0 14px!important}
      .km-shell-menu-button,.km-shell-top-spacer{width:40px;height:40px}
      .km-shell-menu-button{position:fixed;z-index:92;top:calc(env(safe-area-inset-top) + 10px);left:max(12px,calc((100vw - 760px)/2 + 12px));display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;background:transparent;color:var(--text);font-size:24px;line-height:1;cursor:pointer;touch-action:manipulation}
      .km-shell-menu-button:active{background:var(--card2)}
      .km-shell-search-toggle{position:fixed;z-index:42;top:calc(env(safe-area-inset-top) + 15px);right:max(12px,calc((100vw - 760px)/2 + 12px));display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:0;border-radius:50%;background:color-mix(in srgb,var(--accent) 11%,transparent);color:var(--accent);cursor:pointer;transition:opacity .15s ease,transform .15s ease}.km-shell-search-toggle:active{opacity:.58;transform:scale(.94)}.km-shell-search-toggle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
      .km-shell-top-copy{text-align:center;overflow:hidden}.km-shell-top-copy .eyebrow{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.km-shell-title{margin-top:3px;font-size:20px;font-weight:850;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.km-shell-meta{margin-top:3px;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .km-shell-legacy{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important}
      .km-shell-backdrop{position:fixed;z-index:95;inset:0;background:rgba(0,0,0,.42);opacity:0;pointer-events:none;transition:opacity .22s ease}
      .km-shell-backdrop.open{opacity:1;pointer-events:auto}
      .km-shell-drawer{position:fixed;z-index:100;inset:0 auto 0 0;width:min(82vw,330px);display:flex;flex-direction:column;padding:calc(18px + env(safe-area-inset-top)) 14px calc(12px + env(safe-area-inset-bottom));border-right:1px solid var(--line);background:rgba(17,21,26,.97);box-shadow:18px 0 52px rgba(0,0,0,.34);transform:translateX(-102%);transition:transform .24s cubic-bezier(.2,.8,.2,1);-webkit-backdrop-filter:blur(26px) saturate(165%);backdrop-filter:blur(26px) saturate(165%)}
      .km-shell-drawer.open{transform:translateX(0)}
      body.km-shell-drawer-peek .km-shell-drawer.open{transform:translateX(calc(-100% + min(50vw,330px)))}
      .km-shell-drawer-head{padding:4px 8px 17px}.km-shell-drawer-head strong{display:block;font-size:19px;letter-spacing:-.02em}.km-shell-drawer-head small{display:block;margin-top:4px;color:var(--muted);font-size:11px}
      .km-shell-nav{display:grid;gap:4px}.km-shell-nav-button{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:9px 11px;border:0;border-radius:12px;background:transparent;color:var(--text);font-weight:760;text-align:left;cursor:pointer}.km-shell-nav-button .icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid var(--line);border-radius:9px;color:var(--muted);font-size:15px}.km-shell-nav-button.active{background:var(--card2)}.km-shell-nav-button.active .icon{border-color:rgba(77,163,255,.45);color:var(--accent);background:rgba(77,163,255,.09)}.km-shell-nav-empty{padding:16px 13px;color:var(--muted);font-size:12px;line-height:1.4}
      .km-shell-drawer-spacer{flex:1}.km-shell-drawer-bottom{display:grid;gap:6px}.km-shell-settings-button{width:100%;cursor:pointer}.km-shell-drawer-footer{display:flex;align-items:center;padding:4px 11px 2px}.km-shell-version{display:inline-flex!important;align-items:center;gap:7px;flex:0 0 auto;min-width:0;padding:6px 9px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line));border-radius:10px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--text)!important;font-size:11px;font-weight:750;line-height:1;white-space:nowrap;visibility:visible!important;opacity:1!important}.km-shell-version-label{color:var(--accent);font-size:9px;font-weight:850;letter-spacing:.08em}.km-shell-version-number{overflow:hidden;text-overflow:ellipsis}
      .km-shell-tabbar{--km-tab-count:3;position:fixed;z-index:80;left:50%;bottom:calc(9px + env(safe-area-inset-bottom));width:min(520px,calc(100vw - 20px));height:74px;display:grid;grid-template-columns:repeat(var(--km-tab-count),minmax(0,1fr));gap:5px;padding:6px;border:1px solid color-mix(in srgb,#fff 62%,var(--line));border-radius:29px;background:color-mix(in srgb,var(--card) 58%,transparent);box-shadow:0 14px 42px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.72),inset 0 -1px 0 color-mix(in srgb,var(--line) 75%,transparent);-webkit-backdrop-filter:blur(34px) saturate(210%);backdrop-filter:blur(34px) saturate(210%);transform:translateX(-50%);transition:opacity .2s ease,transform .28s cubic-bezier(.22,1,.36,1);isolation:isolate;overflow:hidden}
      .km-shell-tabbar[hidden]{display:none!important}
      .km-shell-tabbar::before{content:"";position:absolute;z-index:0;inset:0;background:linear-gradient(145deg,rgba(255,255,255,.34),transparent 44%,color-mix(in srgb,var(--accent) 9%,transparent));pointer-events:none}
      .km-shell-tab-button{position:relative;z-index:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:5px 3px;border:1px solid transparent;border-radius:22px;background:transparent;color:color-mix(in srgb,var(--text) 66%,var(--muted));font:inherit;font-size:10px;font-weight:760;line-height:1;letter-spacing:-.015em;cursor:pointer;touch-action:manipulation;transition:color .18s ease,background .24s cubic-bezier(.22,1,.36,1),border-color .2s ease,box-shadow .24s ease,transform .16s ease}
      .km-shell-tab-button svg,.km-shell-nav-button svg{width:23px;height:23px;display:block;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;transition:transform .24s cubic-bezier(.22,1,.36,1)}
      .km-shell-nav-button .icon svg{width:18px;height:18px}
      .km-shell-tab-button.active{border-color:color-mix(in srgb,var(--accent) 52%,transparent);background:color-mix(in srgb,var(--accent) 25%,var(--card));box-shadow:0 5px 16px color-mix(in srgb,var(--accent) 23%,transparent),inset 0 1px 0 rgba(255,255,255,.58);color:var(--accent)}
      .km-shell-tab-button.active::after{content:"";position:absolute;bottom:4px;width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}
      .km-shell-tab-button.active svg{transform:translateY(-2px) scale(1.08);stroke-width:2.25}
      .km-shell-tab-button:active{transform:scale(.94)}
      .km-shell-module-settings{display:grid;gap:18px}.km-shell-module-order-list{overflow:hidden;border:.5px solid var(--line);border-radius:14px;background:var(--card)}.km-shell-module-order-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:7px}.km-shell-module-order-copy{min-width:0}.km-shell-module-order-copy>strong,.km-shell-module-order-copy>small{display:block}.km-shell-module-order-copy>strong{font-size:13px}.km-shell-module-order-copy>small{margin-top:3px;color:var(--muted);font-size:10px;line-height:1.35}.km-shell-module-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:58px;padding:8px 10px;border:0;background:var(--card);transition:background .16s ease,box-shadow .16s ease,transform .16s ease}.km-shell-module-row+.km-shell-module-row{border-top:.5px solid var(--line)}.km-shell-module-row.is-off .km-shell-module-copy{opacity:.56}.km-shell-module-handle{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;border:0;border-radius:10px;background:transparent;color:var(--muted);touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.km-shell-module-handle:active,.km-shell-module-row.is-dragging .km-shell-module-handle{cursor:grabbing;background:var(--card2);color:var(--accent)}.km-shell-module-handle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}.km-shell-module-toggle{position:relative;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:46px;height:30px;cursor:pointer}.km-shell-module-toggle input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.km-shell-module-toggle span{position:relative;width:42px;height:24px;border-radius:999px;background:color-mix(in srgb,var(--muted) 30%,var(--card2));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--muted) 35%,transparent);transition:background .18s ease,box-shadow .18s ease}.km-shell-module-toggle span::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.28);transition:transform .2s cubic-bezier(.22,1,.36,1)}.km-shell-module-toggle input:checked+span{background:var(--accent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 80%,#000)}.km-shell-module-toggle input:checked+span::after{transform:translateX(18px)}.km-shell-module-toggle input:focus-visible+span{outline:2px solid var(--accent);outline-offset:3px}.km-shell-module-row.is-dragging{position:fixed;z-index:140;border:.5px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--accent) 12%,var(--card));box-shadow:0 16px 38px rgba(0,0,0,.28);transform:scale(1.015);pointer-events:none}.km-shell-module-placeholder{min-height:58px;border:1px dashed color-mix(in srgb,var(--accent) 55%,var(--line));border-radius:12px;background:color-mix(in srgb,var(--accent) 8%,transparent)}.km-shell-module-copy strong,.km-shell-module-copy small{display:block}.km-shell-module-copy strong{font-size:13px}.km-shell-module-copy small{margin-top:3px;color:var(--muted);font-size:10px}.km-shell-module-help{display:block;margin-top:-6px;color:var(--muted);font-size:10px;line-height:1.4}
      .km-shell-placeholder{padding:4px 0 28px}.km-shell-placeholder-hero{padding:22px 18px;border:.5px solid color-mix(in srgb,var(--accent) 24%,var(--line));border-radius:20px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 12%,var(--card)),var(--card));box-shadow:0 10px 28px rgba(0,0,0,.08)}.km-shell-placeholder-hero svg{width:34px;height:34px;color:var(--accent);fill:none;stroke:currentColor;stroke-width:1.7}.km-shell-placeholder-hero h2{margin:14px 0 6px;font-size:25px}.km-shell-placeholder-hero p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}.km-shell-placeholder-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.km-shell-placeholder-card{min-height:92px;padding:14px;border:.5px solid var(--line);border-radius:16px;background:var(--card)}.km-shell-placeholder-card strong,.km-shell-placeholder-card small{display:block}.km-shell-placeholder-card small{margin-top:6px;color:var(--muted);font-size:11px;line-height:1.4}.km-shell-placeholder-mode #app,.km-shell-placeholder-mode #timeModuleRoot,.km-shell-placeholder-mode .km-shell-locations{display:none!important}.km-shell-placeholder-mode .km-shell-search{display:none!important}
      .km-shell-themes{padding:2px 0 28px}.km-shell-theme-create{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px;margin:4px 0 16px;padding:16px;border:.5px solid var(--line);border-radius:16px;background:var(--card)}.km-shell-theme-create .field,.km-shell-subtheme-create .field{margin:0}.km-shell-theme-create button,.km-shell-subtheme-create button{min-height:42px;background:var(--accent);border-color:var(--accent);color:#fff;font-weight:780}.km-shell-theme-list{overflow:hidden;border:.5px solid var(--line);border-radius:16px;background:var(--card)}.km-shell-theme-node+.km-shell-theme-node{border-top:.5px solid var(--line)}.km-shell-theme-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:6px;min-height:62px;padding:10px 9px 10px 14px;cursor:pointer}.km-shell-theme-row-copy{min-width:0}.km-shell-theme-row-copy strong,.km-shell-theme-row-copy small,.km-shell-subtheme-copy strong,.km-shell-subtheme-copy small{display:block}.km-shell-theme-row-copy strong,.km-shell-subtheme-copy strong{font-size:15px;font-weight:620}.km-shell-theme-row-copy small{margin-top:3px;color:var(--muted);font-size:11px}.km-shell-theme-action{min-height:34px;padding:7px 9px;border:0;border-radius:9px;background:transparent;color:var(--muted);font:inherit;font-size:11px;font-weight:800}.km-shell-theme-action:active{background:var(--card2)}.km-shell-theme-toggle{width:34px;padding:0;font-size:20px}.km-shell-theme-details{padding:0 14px 13px;background:color-mix(in srgb,var(--card2) 42%,var(--card))}.km-shell-subtheme-list{margin-left:10px;border-top:.5px solid var(--line)}.km-shell-subtheme-item{position:relative}.km-shell-subtheme-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;min-height:50px;padding:7px 0}.km-shell-subtheme-row+.km-shell-subtheme-row{border-top:.5px solid var(--line)}.km-shell-subtheme-copy strong{display:flex;align-items:center;gap:6px}.km-shell-subtheme-branch{flex:0 0 auto;color:#8a6500;font-size:17px;font-weight:500;line-height:1}.km-shell-subtheme-copy small{margin-top:2px;padding-left:23px;color:var(--muted);font-size:11px}.km-shell-subtheme-create{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:8px;padding:12px 0 0 10px}.km-shell-theme-archive{margin-top:14px;overflow:hidden;border:.5px solid var(--line);border-radius:16px;background:var(--card)}.km-shell-theme-archive>summary{display:flex;align-items:center;justify-content:space-between;min-height:54px;padding:11px 14px;list-style:none;cursor:pointer}.km-shell-theme-archive>summary::-webkit-details-marker{display:none}.km-shell-theme-archive-copy strong,.km-shell-theme-archive-copy small,.km-shell-theme-archive-row strong,.km-shell-theme-archive-row small{display:block}.km-shell-theme-archive-copy small,.km-shell-theme-archive-row small{margin-top:2px;color:var(--muted);font-size:10px}.km-shell-theme-archive-body{border-top:.5px solid var(--line)}.km-shell-theme-archive-row{display:flex;align-items:center;gap:10px;min-height:52px;padding:9px 13px}.km-shell-theme-archive-row+.km-shell-theme-archive-row{border-top:.5px solid var(--line)}.km-shell-theme-archive-row>div{flex:1;min-width:0}.km-shell-theme-archive-row button{min-height:34px;padding:6px 10px;border:0;border-radius:10px;background:var(--card2);color:var(--accent);font:inherit;font-size:11px;font-weight:800}
      .km-shell-theme-swipe-row{position:relative;overflow:hidden;background:var(--card)}.km-shell-theme-swipe-actions{position:absolute;z-index:0;inset:0 0 0 auto;display:flex;justify-content:flex-end}.km-shell-theme-swipe-action{width:84px;padding:0;border:0;border-radius:0;color:#fff!important;font:inherit;font-size:11px;font-weight:800;opacity:.62;transition:opacity .12s ease,filter .12s ease}.km-shell-theme-swipe-edit{background:var(--accent)}.km-shell-theme-swipe-delete{background:var(--bad,#d70015)}.km-shell-theme-swipe-archive{background:#8a6500}.km-shell-theme-swipe-row.swipe-edit-armed .km-shell-theme-swipe-edit,.km-shell-theme-swipe-row.delete-armed .km-shell-theme-swipe-delete,.km-shell-theme-swipe-row.delete-armed .km-shell-theme-swipe-archive{opacity:1;filter:brightness(1.12)}.km-shell-theme-swipe-surface{position:relative;z-index:1;background:var(--card);touch-action:pan-y;transition:transform .18s cubic-bezier(.2,.8,.2,1);user-select:none;-webkit-user-select:none}.km-shell-subtheme-item+.km-shell-subtheme-item{border-top:.5px solid var(--line)}.km-shell-subtheme-item .km-shell-subtheme-row{border:0}.km-shell-theme-editor{position:fixed;z-index:150;inset:0;display:flex;align-items:flex-end;justify-content:center;padding:18px;background:rgba(0,0,0,.42)}.km-shell-theme-editor-panel{width:min(100%,520px);padding:17px;border:1px solid var(--line);border-radius:20px;background:var(--bg);box-shadow:0 18px 54px rgba(0,0,0,.36)}.km-shell-theme-editor-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.km-shell-theme-editor-head h2{margin:0;font-size:20px}.km-shell-theme-editor-close{width:38px;height:38px;border:0;border-radius:50%;background:var(--card2);color:var(--text);font-size:24px}.km-shell-theme-editor-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.km-shell-theme-color-control{display:flex;align-items:center;gap:12px;min-height:48px;padding:7px 0;border-bottom:1px solid var(--line)}.km-shell-theme-color-control input{width:52px!important;height:38px!important;min-height:38px!important;padding:2px!important;border:1px solid var(--line)!important;border-radius:10px!important;background:var(--card2)!important}.km-shell-theme-color-control output{font-size:12px;font-weight:750;color:var(--muted)}
      body.km-shell-drawer-open .km-shell-tabbar,body.km-shell-drawer-peek .km-shell-tabbar,body.km-shell-settings-open .km-shell-tabbar,body.editor-view .km-shell-tabbar{opacity:0;transform:translate(-50%,18px) scale(.98);pointer-events:none}
      .shell{padding-bottom:calc(108px + env(safe-area-inset-bottom))!important}
      body.km-shell-tabbar-disabled .shell{padding-bottom:calc(28px + env(safe-area-inset-bottom))!important}
      @keyframes kmTabPageIn{from{opacity:.72;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
      body.km-shell-tab-transition .shell{animation:kmTabPageIn .22s cubic-bezier(.22,1,.36,1) both}
      .km-shell-settings{position:fixed;z-index:120;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.38);opacity:0;pointer-events:none;transition:opacity .22s ease}.km-shell-settings.open{opacity:1;pointer-events:auto}
      .km-shell-settings-surface{width:100%;height:min(94dvh,900px);display:flex;flex-direction:column;border-radius:24px 24px 0 0;border:1px solid var(--line);border-bottom:0;background:var(--bg);box-shadow:0 -18px 52px rgba(0,0,0,.34);transform:translateY(104%);transition:transform .46s cubic-bezier(.22,1,.36,1);overflow:hidden;will-change:transform}.km-shell-settings.open .km-shell-settings-surface{transform:translateY(0)}
      .km-shell-settings-head{position:relative;display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;flex:0 0 auto;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;border-bottom:1px solid var(--line);background:rgba(13,17,23,.92);-webkit-backdrop-filter:blur(22px) saturate(165%);backdrop-filter:blur(22px) saturate(165%)}.km-shell-settings-title{text-align:center;font-size:16px;font-weight:850}.km-shell-settings-close{position:absolute;right:14px;top:calc(10px + env(safe-area-inset-top));display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:0;border-radius:50%;background:var(--card2);color:var(--text);font-size:25px;cursor:pointer}.km-shell-settings-content{position:relative;flex:1;min-height:0;overflow:auto;padding:8px 16px calc(24px + env(safe-area-inset-bottom))}.km-shell-settings-content #app,.km-shell-settings-content #timeModuleRoot{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;width:100%;max-width:760px;margin:0 auto}body.time-mode #kmShellSettingsContent #app,body.km-shell-locations-mode #kmShellSettingsContent #app,body.km-shell-themes-mode #kmShellSettingsContent #app,body.km-shell-placeholder-mode #kmShellSettingsContent #app{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
      .km-shell-settings-back{position:absolute;left:14px;top:calc(10px + env(safe-area-inset-top));display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:0;border-radius:50%;background:transparent;color:var(--accent);font-size:22px;font-weight:800;cursor:pointer}.km-shell-settings-back[hidden]{display:none!important}.km-shell-settings-back:active{background:var(--card2)}
      .km-shell-general-settings{max-width:760px;margin:0 auto;padding:8px 0 24px}.km-shell-general-intro{padding:8px 1px 16px;border-bottom:1px solid var(--line)}.km-shell-general-intro h2{margin:3px 0 5px;font-size:28px;letter-spacing:-.035em}.km-shell-general-intro p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}
      .km-shell-general-card{padding:17px 1px;border-bottom:1px solid var(--line)}.km-shell-general-card>strong,.km-shell-general-card>small{display:block}.km-shell-general-card>strong{font-size:17px}.km-shell-general-card>small{margin-top:4px;color:var(--muted);font-size:11px;line-height:1.4}.km-shell-general-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.km-shell-general-actions .btn{width:100%;margin:0;text-align:center}.km-shell-general-nav{display:grid;gap:2px;margin-top:10px}.km-shell-general-nav button{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:48px;padding:10px 1px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--text);font-weight:760;text-align:left}.km-shell-general-nav button span:last-child{color:var(--muted);font-size:21px}.km-shell-general-advanced{margin-top:12px}.km-shell-general-advanced summary{color:var(--muted);font-size:12px;font-weight:750;cursor:pointer}.km-shell-general-status{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.4}
      @keyframes kmSettingsForwardIn{from{opacity:.35;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}@keyframes kmSettingsBackIn{from{opacity:.35;transform:translateX(-24px)}to{opacity:1;transform:translateX(0)}}
      .km-shell-settings-content.km-settings-forward-in>*{animation:kmSettingsForwardIn .24s cubic-bezier(.22,1,.36,1) both}.km-shell-settings-content.km-settings-back-in>*{animation:kmSettingsBackIn .24s cubic-bezier(.22,1,.36,1) both}
      @media(max-width:480px){.km-shell-general-actions{grid-template-columns:1fr}}
      .shell>#timeModuleRoot{position:relative;z-index:0}.km-shell-drawer-open .shell>#timeModuleRoot,.km-shell-drawer-peek .shell>#timeModuleRoot{pointer-events:none!important}.editor-view>.km-shell-menu-button,.editor-view>.km-shell-search-toggle{display:none!important}
      .km-shell-locations{padding:2px 0 28px}.km-shell-locations-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:8px 1px 10px}.km-shell-locations-head h2{margin:2px 0 0;font-size:28px;letter-spacing:-.035em}.km-shell-location-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:5px 0 16px}.km-shell-location-actions button{min-height:44px}
      .km-shell-location-sort{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:4px;margin-bottom:8px;border:1px solid var(--line);border-radius:12px;background:var(--card)}.km-shell-location-sort button{min-height:34px;padding:5px;border:0;border-radius:8px;background:transparent;color:var(--muted);font-size:11px;font-weight:800}.km-shell-location-sort button.active{background:var(--card2);color:var(--text)}
      .km-shell-location-tree{border-top:1px solid var(--line)}.km-shell-location-node{--depth:0;margin-left:calc(var(--depth) * 20px)}.km-shell-location-swipe-row{position:relative;overflow:hidden;background:var(--card)}.km-shell-location-swipe-actions{position:absolute;z-index:0;inset:0 0 0 auto;display:flex;justify-content:flex-end}.km-shell-location-swipe-action{width:84px;padding:0;border:0;border-radius:0;color:#fff;font-size:11px;font-weight:800;opacity:.62;transition:opacity .12s ease,filter .12s ease}.km-shell-location-swipe-delete{background:#9b3037}.km-shell-location-swipe-edit{background:#2869b6}.km-shell-location-swipe-row.swipe-edit-armed .km-shell-location-swipe-edit,.km-shell-location-swipe-row.delete-armed .km-shell-location-swipe-delete{opacity:1;filter:brightness(1.12)}.km-shell-location-swipe-surface{position:relative;z-index:1;background:var(--card);touch-action:pan-y;transition:transform .18s cubic-bezier(.2,.8,.2,1);user-select:none;-webkit-user-select:none;cursor:pointer}.km-shell-location-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:58px;padding:10px 2px;border-bottom:1px solid var(--line)}.km-shell-location-node[data-depth="1"] .km-shell-location-row{position:relative}.km-shell-location-node[data-depth="1"] .km-shell-location-row::before{content:"";position:absolute;left:-12px;top:0;bottom:50%;width:9px;border-left:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0 0 0 6px}.km-shell-location-icon{display:flex;align-items:center;justify-content:center;width:27px;height:27px;border:1px solid var(--line);border-radius:9px;color:var(--muted);font-size:15px}.km-shell-location-copy{min-width:0}.km-shell-location-copy strong,.km-shell-location-copy small{display:block}.km-shell-location-copy strong{font-size:14px}.km-shell-location-copy small{margin-top:3px;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.km-shell-location-buttons{display:flex;align-items:center;gap:3px}.km-shell-location-buttons button{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--muted);font-size:19px}.km-shell-location-buttons button:active{background:var(--card2);color:var(--text)}.km-shell-location-chevron{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;color:var(--muted);font-size:19px}.km-shell-location-details{padding:10px 2px 12px 37px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px;line-height:1.5}.km-shell-location-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.km-shell-location-detail{padding:8px 0}.km-shell-location-detail span,.km-shell-location-detail strong{display:block}.km-shell-location-detail span{font-size:9px;text-transform:uppercase;letter-spacing:.06em}.km-shell-location-detail strong{margin-top:2px;color:var(--text);font-size:11px}.km-shell-child-add{margin-top:7px;padding:4px 0;border:0;background:transparent;color:var(--accent);font-size:11px;font-weight:800}.km-shell-empty{padding:24px 2px;color:var(--muted);font-size:13px}
      .km-shell-parent-section select{width:100%;min-height:38px;padding:6px 0 7px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;color:var(--text);font-size:15px;outline:none}.km-shell-parent-hint{margin-top:6px;color:var(--muted);font-size:10px;line-height:1.4}
      body.km-shell-locations-mode #app,body.km-shell-locations-mode #timeModuleRoot,body.km-shell-locations-mode #kmShellThemesView{display:none!important}body.km-shell-locations-mode #kmShellLocationsView{display:block!important}
      body.km-shell-themes-mode .shell>#app,body.km-shell-themes-mode .shell>#timeModuleRoot,body.km-shell-themes-mode .shell>#kmShellLocationsView,body.km-shell-themes-mode .shell>#kmShellPlaceholderView{display:none!important}body.km-shell-themes-mode #kmShellThemesView{display:block!important}
      body.editor-view #kmShellLocationsView{display:none!important}
      /* Eén visuele taal voor Ritten, Tijd/taken en Locaties. */
      .km-shell-settings-head{display:flex!important;align-items:center!important;justify-content:center!important;min-height:59px}.km-shell-settings-title{padding:0 46px}
      body:not(.time-mode) #app .hero,body:not(.time-mode) #app .summary,body:not(.time-mode) #app .notice,body:not(.time-mode) #app .empty{border:1px solid var(--line)!important;border-radius:16px!important;background:var(--card)!important;box-shadow:none!important}
      body:not(.time-mode) #app .list{overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--card)}
      body:not(.time-mode) #app .list .list-item{margin:0!important;border:0!important;border-bottom:1px solid var(--line)!important;border-radius:0!important;background:var(--card)!important}
      body:not(.time-mode) #app .list .trip-entry:last-child .list-item{border-bottom:0!important}
      body:not(.time-mode) #app .btn,.km-shell-locations .btn,.km-shell-themes .btn{border-radius:12px!important;box-shadow:none!important}
      .km-shell-location-tree{overflow:hidden;border:1px solid var(--line)!important;border-radius:16px;background:var(--card)}
      .km-shell-location-row{padding-left:12px!important;padding-right:8px!important}
      @media(max-width:520px){.km-shell-location-swipe-action{width:78px}}
      @media(max-width:520px){.km-shell-theme-create,.km-shell-subtheme-create{grid-template-columns:1fr}.km-shell-theme-create button,.km-shell-subtheme-create button{width:100%}}
      @media(max-width:520px){.km-shell-theme-swipe-action{width:78px}}
      .km-shell-location-node:last-child>.km-shell-location-row{border-bottom:0}
      .km-shell-location-sort{border-radius:12px!important;background:var(--card)!important}
      .km-shell-general-settings{max-width:760px;margin:0 auto;padding:8px 0 30px}
      .km-shell-general-intro{padding:8px 1px 16px;border-bottom:0}
      .km-shell-settings-accordion{width:100%;margin:0 0 9px;overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--card)}
      .km-shell-settings-accordion summary{display:flex;align-items:center;gap:10px;min-height:64px;padding:13px 15px;list-style:none;cursor:pointer;user-select:none}
      .km-shell-settings-accordion summary::-webkit-details-marker{display:none}
      .km-shell-settings-accordion-title{flex:1;min-width:0}
      .km-shell-settings-accordion-title strong,.km-shell-settings-accordion-title small{display:block}
      .km-shell-settings-accordion-title strong{font-size:15px}
      .km-shell-settings-accordion-title small{margin-top:3px;color:var(--muted);font-size:11px;font-weight:500;line-height:1.35}
      .km-shell-settings-accordion-arrow{color:var(--muted);font-size:21px;transition:transform .22s cubic-bezier(.22,1,.36,1)}
      .km-shell-settings-accordion[open] .km-shell-settings-accordion-arrow{transform:rotate(90deg)}
      .km-shell-settings-accordion-body{padding:0 15px 15px;border-top:1px solid var(--line)}
      .km-shell-settings-panel-host{position:relative;min-height:1px}
      .km-shell-settings-panel-host.km-settings-panel-in{animation:kmSettingsPanelIn .24s cubic-bezier(.22,1,.36,1) both}
      .km-shell-settings-panel-host>#app{max-width:none!important;margin:0!important;padding-top:2px}
      .km-shell-settings-panel-host>#app form{margin:0}
      .km-shell-settings-panel-host>#app details.accordion{margin:0;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent}
      .km-shell-settings-panel-host>#app details.accordion:last-child{border-bottom:0}
      .km-shell-settings-panel-host>#app details.accordion>summary{padding-left:1px;padding-right:1px}
      .km-shell-settings-panel-host>#app .accordion-body{padding-left:1px;padding-right:1px}
      .km-shell-settings-panel-host>#timeModuleRoot{display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:2px 0 0!important}.km-shell-settings-panel-host>#timeModuleRoot .settings-page{padding:0!important}.km-shell-settings-panel-host>#timeModuleRoot .settings-accordion:first-of-type{border-top:0}
      .km-shell-settings-loading,.km-shell-settings-panel-status{padding:16px 1px;color:var(--muted);font-size:12px}.km-shell-settings-panel-status{display:flex;align-items:center;justify-content:space-between;gap:12px}.km-shell-settings-panel-status[data-state="error"]{color:var(--bad)}.km-shell-settings-panel-status button{flex:0 0 auto;min-height:34px;padding:7px 11px;border:0;border-radius:10px;background:var(--card2);color:var(--accent);font:inherit;font-weight:800}.km-shell-settings-panel-host>#app details.accordion.km-shell-settings-single{border-bottom:0}.km-shell-settings-panel-host>#app details.accordion.km-shell-settings-single>.accordion-body{padding-top:14px}
      @keyframes kmSettingsPanelIn{from{opacity:.35;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      /* iPhone Mail-achtige navigatie en gegroepeerde lijsten. */
      html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
      body{-webkit-tap-highlight-color:transparent}
      .shell{padding-left:16px!important;padding-right:16px!important}
      .top.km-shell-top{position:sticky!important;top:0!important;z-index:70!important;margin:0 -16px 8px!important;padding:calc(11px + env(safe-area-inset-top)) 58px 12px!important;grid-template-columns:minmax(0,1fr)!important;min-height:86px;border-bottom:.5px solid color-mix(in srgb,var(--line) 72%,transparent);background:color-mix(in srgb,var(--bg) 84%,transparent)!important;-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%)}
      .km-shell-top>.km-shell-top-spacer{display:none!important}
      .km-shell-top-copy{text-align:left!important;overflow:visible!important}
      .km-shell-top-copy .eyebrow{display:none!important}
      .km-shell-title{margin:0!important;font-size:32px!important;line-height:1.05;font-weight:780!important;letter-spacing:-.035em!important}
      .km-shell-meta{margin-top:5px!important;font-size:11px!important;line-height:1.25;color:var(--muted)!important}
      .km-shell-menu-button{top:calc(env(safe-area-inset-top) + 15px)!important;left:max(12px,calc((100vw - 760px)/2 + 12px))!important;width:40px!important;height:40px!important;border-radius:50%!important;background:color-mix(in srgb,var(--accent) 11%,transparent)!important;color:var(--accent)!important;font-size:21px!important;font-weight:700;transition:opacity .15s ease,transform .15s ease}
      .km-shell-menu-button:active{opacity:.55;transform:scale(.94);background:color-mix(in srgb,var(--accent) 16%,transparent)!important}
      .km-shell-drawer{width:min(90vw,360px)!important;border-radius:0 24px 24px 0;border-right:.5px solid var(--line)!important;padding-left:12px!important;padding-right:12px!important}
      .km-shell-drawer-head{padding:7px 12px 18px!important}.km-shell-drawer-head strong{font-size:32px!important;font-weight:780!important;letter-spacing:-.035em!important}.km-shell-drawer-head small{font-size:11px!important}
      .km-shell-nav{overflow:hidden;gap:0!important;border:.5px solid var(--line);border-radius:16px;background:var(--card)}
      .km-shell-nav-button{position:relative;min-height:55px!important;padding:8px 13px!important;border-radius:0!important;font-size:16px!important;font-weight:600!important}
      .km-shell-nav-button:not(:last-child)::after{content:"";position:absolute;left:52px;right:0;bottom:0;height:.5px;background:var(--line)}
      .km-shell-nav-button .icon{width:29px!important;height:29px!important;border:0!important;border-radius:50%!important;background:color-mix(in srgb,var(--accent) 14%,transparent)!important;color:var(--accent)!important;font-size:15px!important}
      .km-shell-nav-button.active{background:color-mix(in srgb,var(--accent) 11%,var(--card))!important;color:var(--accent)!important}.km-shell-nav-button.active .icon{background:var(--accent)!important;color:#fff!important}
      .km-shell-drawer-bottom{gap:6px!important}.km-shell-settings-button{margin:0!important;border-radius:16px!important;background:var(--card)!important;color:var(--text)!important}.km-shell-settings-button .icon{background:color-mix(in srgb,var(--accent) 14%,transparent)!important;color:var(--accent)!important}.km-shell-drawer-footer{border-top:0!important;padding:4px 11px 2px!important}
      .km-shell-settings-surface::before{content:"";position:absolute;z-index:3;top:7px;left:50%;width:36px;height:5px;border-radius:99px;background:color-mix(in srgb,var(--muted) 45%,transparent);transform:translateX(-50%)}
      .km-shell-settings-surface{position:relative;border-radius:28px 28px 0 0!important}
      .km-shell-settings-head{padding-top:calc(15px + env(safe-area-inset-top))!important;border-bottom:.5px solid var(--line)!important}
      .km-shell-settings-close{right:13px!important;top:calc(14px + env(safe-area-inset-top))!important;width:34px!important;height:34px!important;background:color-mix(in srgb,var(--muted) 16%,var(--card2))!important;color:var(--muted)!important;font-size:23px!important;font-weight:650}
      .km-shell-settings-title{font-size:17px!important;font-weight:650!important}
      .km-shell-general-intro{padding:10px 3px 14px!important}.km-shell-general-intro p{font-size:12px!important}.km-shell-settings-group{margin:0 0 22px}.km-shell-settings-group:last-child{margin-bottom:0}.km-shell-settings-group-head{padding:0 3px 7px}.km-shell-settings-group-head h2{margin:0;color:var(--text);font-size:20px;font-weight:720;letter-spacing:-.025em}.km-shell-settings-group-head p{margin:3px 0 0;color:var(--muted);font-size:11px;line-height:1.4}
      .km-shell-settings-accordion{margin:0!important;border-radius:0!important;border-width:0 .5px .5px!important}
      .km-shell-settings-accordion:first-of-type{border-top:.5px solid var(--line)!important;border-radius:16px 16px 0 0!important}
      .km-shell-settings-accordion:last-of-type{border-radius:0 0 16px 16px!important}
      .km-shell-settings-accordion summary{min-height:62px!important;padding:11px 14px!important}
      .km-shell-settings-accordion-title strong{font-size:16px!important;font-weight:620!important}
      .km-shell-settings-accordion-arrow{font-size:23px!important;color:color-mix(in srgb,var(--muted) 65%,transparent)!important}
      .km-shell-settings-accordion-body{padding-left:14px!important;padding-right:14px!important}
      body:not(.time-mode) #app .hero,body:not(.time-mode) #app .summary,body:not(.time-mode) #app .notice,body:not(.time-mode) #app .empty{border-width:.5px!important;border-radius:16px!important}
      body:not(.time-mode) #app .list{border-width:.5px!important;border-radius:16px!important}
      body:not(.time-mode) #app .list .list-item{position:relative;border-bottom:0!important}
      body:not(.time-mode) #app .list .list-item::after{content:"";position:absolute;left:58px;right:0;bottom:0;height:.5px;background:var(--line);pointer-events:none}
      body:not(.time-mode) #app .list .trip-entry:last-child .list-item::after{display:none}
      body:not(.time-mode) #app .swipe-edit{background:#0a84ff!important;color:#fff!important}
      body:not(.time-mode) #app .swipe-delete{background:#ff453a!important;color:#fff!important}
      body:not(.time-mode) #app .chev{color:color-mix(in srgb,var(--muted) 62%,transparent)!important;font-size:20px!important}
      body:not(.time-mode) #app .btn:active,.km-shell-locations button:active,.km-shell-themes button:active{opacity:.68}
      .km-shell-locations-head{padding:7px 2px 12px!important}.km-shell-locations-head h2{font-size:20px!important;font-weight:720!important;letter-spacing:-.02em!important}
      .km-shell-location-actions{overflow:hidden;gap:0!important;border:.5px solid var(--line);border-radius:14px;background:var(--card)}
      .km-shell-location-actions button{border:0!important;border-radius:0!important;background:transparent!important;color:var(--accent)!important;font-weight:650!important}.km-shell-location-actions button:first-child{border-right:.5px solid var(--line)!important}
      .km-shell-location-sort{border-width:.5px!important;border-radius:9px!important;background:color-mix(in srgb,var(--muted) 13%,transparent)!important}
      .km-shell-location-tree{border-width:.5px!important;border-radius:16px!important}
      .km-shell-location-row{position:relative;min-height:62px!important;border-bottom:0!important;padding-left:13px!important}
      .km-shell-location-row::after{content:"";position:absolute;left:52px;right:0;bottom:0;height:.5px;background:var(--line)}
      .km-shell-location-node:last-child>.km-shell-location-row::after{display:none}
      .km-shell-location-icon{border:0!important;border-radius:50%!important;background:color-mix(in srgb,var(--accent) 14%,transparent)!important;color:var(--accent)!important}
      .km-shell-location-copy strong{font-size:15px!important;font-weight:620!important}.km-shell-location-copy small{font-size:11px!important}
      .km-shell-location-buttons button{color:var(--accent)!important;font-size:17px!important}.km-shell-location-chevron{color:color-mix(in srgb,var(--muted) 62%,transparent)!important;font-size:21px!important}
      .section-title h2{letter-spacing:-.02em}
      button,.btn,[role="button"],summary{touch-action:manipulation}
      .swipe-surface,.activity-swipe-surface,.km-shell-location-swipe-surface{touch-action:pan-y}
      /* Zoeken, compacte navigatie en eenduidige invoerschermen. */
      .km-shell-search{position:sticky;top:calc(59px + env(safe-area-inset-top));z-index:39;display:flex;align-items:center;gap:7px;height:0;min-height:0;margin:0;padding:0;border-radius:12px;background:color-mix(in srgb,var(--muted) 14%,var(--bg));color:var(--muted);transform:translateY(-7px);opacity:0;overflow:hidden;visibility:hidden;pointer-events:none;transition:transform .2s cubic-bezier(.22,1,.36,1),opacity .14s ease,height .2s ease,margin .2s ease,visibility 0s linear .2s;-webkit-backdrop-filter:blur(20px) saturate(170%);backdrop-filter:blur(20px) saturate(170%)}
      body.km-shell-search-open .km-shell-search{height:42px;min-height:42px;padding:0 8px 0 11px;transform:translateY(0);opacity:1;visibility:visible;pointer-events:auto;box-shadow:0 7px 18px color-mix(in srgb,#000 10%,transparent);transition-delay:0s}
      .km-shell-search>span{font-size:20px;line-height:1;transform:rotate(-15deg)}
      .km-shell-search input{flex:1;min-width:0;height:38px;padding:0;border:0;outline:0;background:transparent;color:var(--text);font:inherit;font-size:16px}
      .km-shell-search input::placeholder{color:var(--muted)}
      .km-shell-search input::-webkit-search-cancel-button{display:none}
      .km-shell-search button{flex:0 0 auto;width:28px;height:28px;padding:0;border:0;border-radius:50%;background:color-mix(in srgb,var(--muted) 24%,transparent);color:var(--text);font-size:18px;line-height:1}.km-shell-search button[hidden]{display:none}
      .km-shell-search-status{margin:-3px 0 14px;padding:20px 2px;color:var(--muted);font-size:13px;text-align:center}.km-shell-search-status.total{padding:0 2px 8px;font-size:11px;font-weight:750;text-align:right}
      body.km-shell-scrolled .top.km-shell-top{min-height:59px!important;padding-top:calc(9px + env(safe-area-inset-top))!important;padding-bottom:9px!important}
      .top.km-shell-top,.km-shell-title,.km-shell-meta{transition:min-height .22s ease,padding .22s ease,font-size .22s ease,opacity .18s ease,margin .22s ease}
      body.km-shell-scrolled .km-shell-title{font-size:18px!important;letter-spacing:-.015em!important}
      body.km-shell-scrolled .km-shell-meta{height:0;margin:0!important;opacity:0;overflow:hidden}
      body.editor-view .km-shell-top,body.editor-view .km-shell-search,body.editor-view .km-shell-search-status,body.editor-view .km-shell-search-toggle{display:none!important}
      body.editor-view .editor-nav{z-index:40;background:color-mix(in srgb,var(--bg) 88%,transparent)!important;-webkit-backdrop-filter:blur(22px) saturate(170%);backdrop-filter:blur(22px) saturate(170%)}
      body.editor-view .editor-page .edit-section{margin:0 0 11px;padding:14px;border:.5px solid var(--line)!important;border-radius:16px;background:var(--card)}
      body.editor-view .editor-page .edit-section:first-of-type{padding-top:14px!important;border-top:.5px solid var(--line)!important}
      body.editor-view .editor-savebar{border-top:.5px solid var(--line)!important;background:color-mix(in srgb,var(--bg) 88%,transparent)!important;-webkit-backdrop-filter:blur(22px) saturate(170%);backdrop-filter:blur(22px) saturate(170%)}
      .km-shell-undo{position:fixed;z-index:150;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:18px;width:max-content;max-width:calc(100vw - 28px);padding:12px 14px;border-radius:14px;background:rgba(35,35,38,.96);box-shadow:0 10px 34px rgba(0,0,0,.3);color:#fff;font-size:13px;opacity:0;transform:translate(-50%,14px);pointer-events:none;transition:opacity .2s ease,transform .24s cubic-bezier(.22,1,.36,1)}
      .km-shell-undo.show{opacity:1;transform:translate(-50%,0);pointer-events:auto}.km-shell-undo button{padding:2px 0;border:0;background:transparent;color:#64a8ff;font-weight:750}
      .toast.km-action-toast{display:flex!important;align-items:center;gap:18px;max-width:calc(100vw - 28px)!important;border-radius:14px!important;text-align:left!important}.toast.km-action-toast span{min-width:0}.toast.km-action-toast button{padding:2px 0;border:0;background:transparent;color:#0a67c8;font-weight:800}
      /* Correcties voor iPhone-safe-areas, scheidingslijnen en overlay-stapeling. */
      .shell{padding-top:0!important}
      .top.km-shell-top{z-index:40!important}
      .km-shell-menu-button{z-index:42!important}
      .km-shell-settings-head{padding-top:15px!important}
      .km-shell-settings-close{top:14px!important}
      body.km-shell-settings-open .km-shell-drawer{transform:translateX(-102%)!important;pointer-events:none!important}
      body.km-shell-settings-open .km-shell-backdrop{opacity:0!important;pointer-events:none!important}
      body.km-shell-settings-open .toast{z-index:140!important}
      body:not(.time-mode) #app .list{gap:0!important}
      body:not(.time-mode) #app .list .swipe-row{border-radius:0!important}
      body:not(.time-mode) #app .trip-entry.expanded .list-item::after{display:none!important}
      body:not(.time-mode) #app .trip-inline-details{background:var(--card)!important}
      /* Op iPhone ligt de navigatie onder de volledige verschuivende pagina. */
      @media(max-width:820px){
        html,body{overflow-x:clip}
        .shell{position:relative;z-index:20;min-height:100dvh;background:var(--bg);transition:transform .34s cubic-bezier(.22,1,.36,1),border-radius .34s ease,box-shadow .34s ease}
        .km-shell-menu-button{z-index:22!important;transition:transform .34s cubic-bezier(.22,1,.36,1),opacity .15s ease}
        .km-shell-drawer{z-index:10!important;width:min(90vw,360px)!important;transform:none!important;opacity:0;pointer-events:none;box-shadow:none!important;transition:opacity .18s ease!important}
        .km-shell-drawer.open{opacity:1;pointer-events:auto}
        .km-shell-backdrop{z-index:21!important;inset:0 0 0 min(90vw,360px)!important;background:rgba(0,0,0,.1)!important}
        body.km-shell-drawer-open .shell{transform:translateX(min(90vw,360px));border-radius:22px 0 0 22px;box-shadow:-14px 0 38px rgba(0,0,0,.24)}
        body.km-shell-drawer-open .km-shell-menu-button{transform:translateX(min(90vw,360px))}
        body.km-shell-drawer-open .km-shell-search-toggle{opacity:0;pointer-events:none}
        body.km-shell-drawer-peek .km-shell-drawer.open{transform:none!important;opacity:1;pointer-events:auto}
        body.km-shell-drawer-peek .shell{transform:translateX(min(50vw,360px));border-radius:18px 0 0 18px;box-shadow:-10px 0 28px rgba(0,0,0,.2)}
        body.km-shell-drawer-peek .km-shell-menu-button{transform:translateX(min(50vw,360px))}
        body.km-shell-drawer-peek .km-shell-search-toggle{opacity:0;pointer-events:none}
        body.km-shell-drawer-peek .km-shell-backdrop{left:min(50vw,360px)!important}
        body.km-shell-settings-open .km-shell-drawer{opacity:0!important;pointer-events:none!important;transform:none!important}
      }
      @media(prefers-color-scheme:light){.km-shell-drawer{background:rgba(255,255,255,.97);box-shadow:18px 0 52px rgba(30,45,65,.16)}.km-shell-settings-head{background:rgba(245,245,247,.93)}.km-shell-backdrop{background:rgba(0,0,0,.22)}.km-shell-settings{background:rgba(0,0,0,.22)}}
      @media(max-width:480px){.km-shell-drawer{width:min(86vw,330px)}.km-shell-settings-surface{height:96dvh;border-radius:21px 21px 0 0}.km-shell-settings-content{padding-left:12px;padding-right:12px}.km-shell-location-detail-grid{grid-template-columns:1fr}.km-shell-location-actions{grid-template-columns:1fr 1fr}}
      /* UX-review: schaalbare navigatie, rustiger instellingen en grotere aanraakvlakken. */
      .km-shell-tabbar{height:70px;border-radius:26px}
      .km-shell-tab-button.active::after{display:none}
      .km-shell-tab-button.active{border-color:color-mix(in srgb,var(--accent) 38%,transparent);background:color-mix(in srgb,var(--accent) 18%,var(--card));box-shadow:0 4px 14px color-mix(in srgb,var(--accent) 18%,transparent),inset 0 1px 0 rgba(255,255,255,.5)}
      .km-shell-tab-more svg circle{fill:currentColor;stroke:none}
      .km-shell-menu-button{width:44px!important;height:44px!important}
      .km-shell-settings-close{width:40px!important;height:40px!important}
      .km-shell-search button{width:32px;height:32px}
      .km-shell-location-buttons button,.km-shell-location-chevron{width:44px!important;height:44px!important}
      .km-shell-settings-content{scroll-padding-top:12px;overscroll-behavior:contain}
      .km-shell-settings-group{margin-bottom:20px}
      .km-shell-settings-group-head{padding:0 5px 8px}
      .km-shell-settings-group-head h2{font-size:13px!important;font-weight:720!important;letter-spacing:.055em!important;text-transform:uppercase;color:var(--muted)!important}
      .km-shell-settings-group-head p{margin-top:4px!important;font-size:12px!important}
      .km-shell-settings-accordion summary:focus-visible,.km-shell-nav-button:focus-visible,.km-shell-tab-button:focus-visible,.km-shell-menu-button:focus-visible,.km-shell-settings-close:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
      .km-shell-settings-panel-host>#app details.accordion>summary{min-height:58px}
      .km-shell-module-settings{gap:16px}
      .km-shell-module-row{grid-template-columns:44px minmax(0,1fr) auto;min-height:60px;padding:8px 10px 8px 7px;border-radius:0;background:transparent}
      .km-shell-module-row.is-dragging{border-radius:12px;border-bottom-color:transparent}
      .km-shell-module-handle{display:inline-flex}
      .km-shell-module-copy strong{font-size:15px;font-weight:620}
      .km-shell-module-copy small{font-size:11px;line-height:1.35}
      .km-shell-module-toggle input{width:42px;height:24px}
      @media(max-width:390px){.km-shell-tab-button{font-size:9px}.km-shell-tab-button svg{width:21px;height:21px}.km-shell-title{font-size:29px!important}}
      .km-shell-theme-row{grid-template-columns:minmax(0,1fr) auto auto!important;gap:6px!important;padding-left:10px!important;border-left:3px solid var(--theme-color,var(--accent))!important}.km-shell-theme-node>.km-shell-theme-swipe-row .km-shell-theme-row-copy small{color:var(--theme-color,var(--accent))!important}
      .km-shell-theme-count-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-4px 2px 12px;color:var(--muted);font-size:11px}.km-shell-theme-count-actions{display:flex;align-items:center;gap:10px}.km-shell-theme-count-all{padding:7px 0;border:0;background:transparent;color:var(--accent);font:inherit;font-weight:800;white-space:nowrap}.km-shell-theme-count-all:disabled{color:var(--muted);opacity:.42}.km-shell-theme-count-toggle{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--muted)}.km-shell-theme-count-toggle svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.km-shell-theme-count-toggle[aria-pressed="true"]{background:color-mix(in srgb,var(--theme-color) 14%,transparent);color:var(--theme-color)}.km-shell-theme-count-toggle[aria-pressed="false"]{opacity:.52}
      .km-shell-theme-sort{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;padding:4px;margin-bottom:12px;border:.5px solid var(--line);border-radius:9px;background:color-mix(in srgb,var(--muted) 13%,transparent)}.km-shell-theme-sort button{min-height:34px;padding:5px;border:0;border-radius:7px;background:transparent;color:var(--muted);font-size:11px;font-weight:800}.km-shell-theme-sort button.active{background:var(--card);color:var(--text)}.km-shell-theme-row.km-shell-theme-custom-row{grid-template-columns:auto minmax(0,1fr) auto auto!important}.km-shell-theme-drag-handle{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--muted);touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}.km-shell-theme-drag-handle svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}.km-shell-theme-node.is-dragging{position:fixed;z-index:160;overflow:hidden;border:.5px solid var(--line);border-radius:13px;background:var(--card);box-shadow:0 16px 38px rgba(0,0,0,.28);pointer-events:none}.km-shell-theme-placeholder{border:1px dashed color-mix(in srgb,var(--accent) 55%,var(--line));border-radius:13px;background:color-mix(in srgb,var(--accent) 8%,transparent)}
      .km-shell-location-row.km-shell-location-custom-row{grid-template-columns:auto 28px minmax(0,1fr) auto}.km-shell-location-drag-handle{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--muted);touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}.km-shell-location-drag-handle svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}.km-shell-location-group.is-dragging{position:fixed;z-index:160;overflow:hidden;border:.5px solid var(--line);border-radius:13px;background:var(--card);box-shadow:0 16px 38px rgba(0,0,0,.28);pointer-events:none}.km-shell-location-placeholder{border:1px dashed color-mix(in srgb,var(--accent) 55%,var(--line));border-radius:13px;background:color-mix(in srgb,var(--accent) 8%,transparent)}
      .km-shell-location-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.km-shell-location-icon:has(svg[data-location-type="home"]){color:var(--home,#ff9f0a)!important}.km-shell-location-icon:has(svg[data-location-type="work"]){color:var(--commute,#4da3ff)!important}.km-shell-location-icon:has(svg[data-location-type="business"]){color:var(--business,#a875ff)!important}.km-shell-location-icon:has(svg[data-location-type="private"]){color:var(--private,#49d17d)!important}.km-shell-location-icon:has(svg[data-location-type="other"]){color:var(--other,#8e8e93)!important}
      .km-shell-search select{flex:0 1 126px;max-width:126px;height:32px;padding:0 24px 0 8px;border:.5px solid var(--line);border-radius:9px;background:var(--card);color:var(--text);font-size:11px;font-weight:650}.km-shell-search select[hidden]{display:none}
      .km-shell-search{margin-bottom:0!important}body.km-shell-search-open .km-shell-search{margin-bottom:12px!important}
      @media(prefers-reduced-motion:reduce){.shell,.km-shell-menu-button,.km-shell-drawer,.km-shell-backdrop,.km-shell-settings,.km-shell-settings-surface,.km-shell-tabbar,.km-shell-tab-button{transition:none!important}.km-shell-settings-content>*,body.km-shell-tab-transition .shell{animation:none!important}}
    `;
    document.head.appendChild(style);
  }

  function installChrome() {
    const top = $('.top');
    if (!top || $('#kmShellMenuButton')) return;

    const today = $('#today');
    const legacyMode = $('#appModeToggle');
    const legacyAction = $('#topAction');
    const legacyMeta = $('#appModeMeta');

    const menu = document.createElement('button');
    menu.id = 'kmShellMenuButton';
    menu.className = 'km-shell-menu-button';
    menu.type = 'button';
    menu.setAttribute('aria-label', 'Menu openen');
    menu.setAttribute('aria-controls', 'kmShellDrawer');
    menu.setAttribute('aria-expanded', 'false');
    menu.textContent = '☰';

    const copy = document.createElement('div');
    copy.className = 'km-shell-top-copy';
    if (today) copy.appendChild(today);
    const title = document.createElement('div');
    title.id = 'kmShellTitle';
    title.className = 'km-shell-title';
    title.textContent = moduleById(section)?.label || 'Ritten';
    copy.appendChild(title);
    const meta = document.createElement('div');
    meta.id = 'kmShellMeta';
    meta.className = 'km-shell-meta';
    meta.textContent = moduleById(section)?.subtitle || '';
    copy.appendChild(meta);

    const searchToggle = document.createElement('button');
    searchToggle.id = 'kmShellSearchToggle';
    searchToggle.className = 'km-shell-search-toggle';
    searchToggle.type = 'button';
    searchToggle.setAttribute('aria-label', 'Zoeken openen');
    searchToggle.setAttribute('aria-controls', 'kmShellSearch');
    searchToggle.setAttribute('aria-expanded', 'false');
    searchToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
    const legacy = document.createElement('div');
    legacy.className = 'km-shell-legacy';
    if (legacyMode) legacy.appendChild(legacyMode);
    if (legacyAction) legacy.appendChild(legacyAction);
    if (legacyMeta) legacy.appendChild(legacyMeta);

    const menuSlot = document.createElement('span');
    menuSlot.className = 'km-shell-top-spacer';
    menuSlot.setAttribute('aria-hidden', 'true');
    top.innerHTML = '';
    top.classList.add('km-shell-top');
    top.append(menuSlot, copy, searchToggle, legacy);

    const search = document.createElement('div');
    search.id = 'kmShellSearch';
    search.className = 'km-shell-search';
    search.innerHTML = '<span aria-hidden="true">⌕</span><input id="kmShellSearchInput" type="search" autocomplete="off" enterkeyhint="search" aria-label="Zoeken"><select id="kmShellThemeFilter" aria-label="Filter op thema" hidden><option value="all">Alle thema’s</option></select><button id="kmShellSearchClear" type="button" aria-label="Zoekopdracht wissen" hidden>×</button><button id="kmShellSearchClose" type="button" aria-label="Zoeken sluiten">×</button>';
    top.insertAdjacentElement('afterend', search);
    const setSearchOpen = open => {
      document.body.classList.toggle('km-shell-search-open', open);
      searchToggle.setAttribute('aria-expanded', String(open));
      searchToggle.setAttribute('aria-label', open ? 'Zoeken sluiten' : 'Zoeken openen');
      if (open) requestAnimationFrame(() => $('#kmShellSearchInput', search)?.focus());
    };
    searchToggle.addEventListener('click', () => setSearchOpen(!document.body.classList.contains('km-shell-search-open')));
    $('#kmShellSearchInput', search).addEventListener('input', event => {
      $('#kmShellSearchClear', search).hidden = !event.target.value;
      applyShellSearch();
    });
    $('#kmShellSearchClear', search).addEventListener('click', () => {
      const input = $('#kmShellSearchInput', search);
      input.value = '';
      input.focus();
      $('#kmShellSearchClear', search).hidden = true;
      applyShellSearch();
    });
    $('#kmShellThemeFilter', search).addEventListener('change', applyShellSearch);
    $('#kmShellSearchClose', search).addEventListener('click', () => {
      const input = $('#kmShellSearchInput', search);
      if (input) input.value = '';
      const filter = $('#kmShellThemeFilter', search);
      if (filter) filter.value = 'all';
      $('#kmShellSearchClear', search).hidden = true;
      applyShellSearch();
      setSearchOpen(false);
    });

    document.body.appendChild(menu);
    menu.addEventListener('click', () => {
      if (!drawerOpen) openDrawer();
      else closeDrawer();
    });

    if (today) {
      today.textContent = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()) + ' · ' + BUILD;
    }
  }

  function installShellElements() {
    if ($('#kmShellDrawer')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'kmShellBackdrop';
    backdrop.className = 'km-shell-backdrop';
    backdrop.addEventListener('click', closeDrawer);

    const drawer = document.createElement('aside');
    drawer.id = 'kmShellDrawer';
    drawer.className = 'km-shell-drawer';
    drawer.setAttribute('aria-label', 'Navigatie');
    drawer.innerHTML = `
      <div class="km-shell-drawer-head"><strong>Log</strong><small>Jouw registratieonderdelen</small></div>
      <nav id="kmShellDrawerNav" class="km-shell-nav"></nav>
      <div class="km-shell-drawer-spacer"></div>
      <div class="km-shell-drawer-bottom">
        <button id="kmShellSettingsButton" class="km-shell-nav-button km-shell-settings-button" type="button" aria-label="Instellingen"><span class="icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg></span><span>Instellingen</span></button>
        <div class="km-shell-drawer-footer"><span class="km-shell-version" aria-label="Geladen testversie ${SHELL_VERSION}"><span class="km-shell-version-label">TEST</span><span class="km-shell-version-number">${SHELL_VERSION}</span></span></div>
      </div>`;

    drawer.addEventListener('click', event => {
      const button = event.target.closest('[data-shell-section]');
      if (button) selectSection(button.dataset.shellSection);
    });
    $('#kmShellSettingsButton', drawer).addEventListener('click', () => openSettingsSheet());

    const settings = document.createElement('div');
    settings.id = 'kmShellSettings';
    settings.className = 'km-shell-settings';
    settings.innerHTML = `
      <section class="km-shell-settings-surface" role="dialog" aria-modal="true" aria-labelledby="kmShellSettingsTitle">
        <header class="km-shell-settings-head"><div id="kmShellSettingsTitle" class="km-shell-settings-title">Algemene instellingen</div><button id="kmShellSettingsClose" class="km-shell-settings-close" type="button" aria-label="Instellingen sluiten">×</button></header>
        <div id="kmShellSettingsContent" class="km-shell-settings-content"></div>
      </section>`;
    $('#kmShellSettingsClose', settings).addEventListener('click', closeSettingsSheet);

    const locationsView = document.createElement('main');
    locationsView.id = 'kmShellLocationsView';
    locationsView.className = 'km-shell-locations';
    locationsView.hidden = true;
    const themesView = document.createElement('main');
    themesView.id = 'kmShellThemesView';
    themesView.className = 'km-shell-themes';
    themesView.hidden = true;
    const placeholderView = document.createElement('main');
    placeholderView.id = 'kmShellPlaceholderView';
    placeholderView.className = 'km-shell-placeholder';
    placeholderView.hidden = true;
    const shell = $('.shell');
    if (shell) shell.append(locationsView, themesView, placeholderView);

    const tabbar = document.createElement('nav');
    tabbar.id = 'kmShellTabBar';
    tabbar.className = 'km-shell-tabbar';
    tabbar.setAttribute('aria-label', 'Hoofdnavigatie');
    tabbar.innerHTML = '';
    tabbar.addEventListener('click', event => {
      const more = event.target.closest('[data-shell-more]');
      if (more) {
        openDrawer();
        return;
      }
      const button = event.target.closest('[data-shell-tab]');
      if (button) selectSection(button.dataset.shellTab);
    });

    document.body.append(backdrop, drawer, settings, tabbar);
    renderNavigation();
  }

  function openDrawer(mode = 'peek') {
    if ($('#kmShellSettings')?.classList.contains('open')) return;
    drawerOpen = true;
    drawerPeek = mode === 'peek';
    localStorage.setItem(DRAWER_KEY, '1');
    document.body.classList.toggle('km-shell-drawer-peek', drawerPeek);
    document.body.classList.toggle('km-shell-drawer-open', !drawerPeek);
    $('#kmShellMenuButton')?.setAttribute('aria-expanded', 'true');
    $('#kmShellDrawer')?.classList.add('open');
    $('#kmShellBackdrop')?.classList.add('open');
    syncDrawerSelection();
  }

  function closeDrawer() {
    drawerOpen = false;
    drawerPeek = false;
    localStorage.removeItem(DRAWER_KEY);
    document.body.classList.remove('km-shell-drawer-open', 'km-shell-drawer-peek');
    $('#kmShellMenuButton')?.setAttribute('aria-expanded', 'false');
    $('#kmShellDrawer')?.classList.remove('open');
    $('#kmShellBackdrop')?.classList.remove('open');
  }

  function syncDrawerSelection() {
    $$('.km-shell-nav-button').forEach(button => {
      const active = button.dataset.shellSection === section;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const directTabs = $$('.km-shell-tab-button[data-shell-tab]');
    directTabs.forEach(button => {
      const active = button.dataset.shellTab === section;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const more = $('.km-shell-tab-more');
    if (more) {
      const active = !directTabs.some(button => button.dataset.shellTab === section);
      more.classList.toggle('active', active);
      if (active) more.setAttribute('aria-current', 'page');
      else more.removeAttribute('aria-current');
    }
  }

  function originalIsTimeMode() {
    return document.body.classList.contains('time-mode');
  }

  function ensureOriginalMode(mode) {
    const wantTime = mode === 'time';
    if (originalIsTimeMode() === wantTime) return;
    const toggle = $('#appModeToggle');
    if (toggle) toggle.click();
  }

  function ensureKmView(wanted) {
    const topAction = $('#topAction');
    if (!topAction) return false;
    const current = topAction.dataset.action === 'home' ? 'settings' : 'ride';
    if (current !== wanted) topAction.click();
    return (topAction.dataset.action === 'home' ? 'settings' : 'ride') === wanted;
  }

  function normalizedSearch(value) {
    return String(value || '').toLocaleLowerCase('nl-NL').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  function currentSearchValue() {
    return normalizedSearch($('#kmShellSearchInput')?.value);
  }

  function updateSearchPlaceholder() {
    const input = $('#kmShellSearchInput');
    if (!input) return;
    const labels = { rides: 'Zoek in ritten', time: 'Zoek in tijd en taken', locations: 'Zoek in locaties', themes: 'Zoek in thema’s' };
    input.placeholder = labels[section] || `Zoek in ${moduleById(section)?.label?.toLocaleLowerCase('nl-NL') || 'onderdelen'}`;
  }

  function compactFilterTime(minutes) {
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    const hours = Math.floor(total / 60);
    const remainder = total % 60;
    return `${hours ? `${hours}u` : ''}${hours && remainder ? ' ' : ''}${remainder || !hours ? `${remainder}m` : ''}`;
  }

  function visiblePeriodTimeEntries(time) {
    const periodEntries = window.LogTimeModule?.getPeriodEntries?.();
    if (Array.isArray(periodEntries)) return periodEntries;
    const visibleIds = new Set($$('#timeModuleRoot .entry[data-entry]').map(node => String(node.dataset.entry || '')));
    return (Array.isArray(time.entries) ? time.entries : []).filter(entry => visibleIds.has(String(entry.id || '')));
  }

  function updateThemeFilterOptions() {
    const select = $('#kmShellThemeFilter');
    if (!select) return;
    select.hidden = section !== 'time';
    if (section !== 'time') return;
    const previous = select.value || 'all';
    let time = {};
    try { time = JSON.parse(localStorage.getItem('urenregistratie.test.pwa.v1') || '{}'); } catch (_) {}
    const periodEntries = visiblePeriodTimeEntries(time);
    const model = window.LogTimeFilterModel?.buildOptions?.({
      themes: Array.isArray(time.themes) ? time.themes : [],
      subthemes: Array.isArray(time.subthemes) ? time.subthemes : [],
      entries: periodEntries
    }) || { allMinutes: 0, records: [] };
    const allMinutes = model.allMinutes;
    const optionRecords = model.records;
    const optionsHtml = `<option value="all">Alle thema’s · ${compactFilterTime(allMinutes)}</option>` + optionRecords.map(({ theme, minutes, children }) => {
      return `<option value="theme:${esc(theme.id)}">${esc(theme.name || 'Thema')} · ${compactFilterTime(minutes)}</option>${children.map(({ subtheme, minutes: childMinutes }) => `<option value="subtheme:${esc(subtheme.id)}">↳ ${esc(subtheme.name || 'Subthema')} · ${compactFilterTime(childMinutes)}</option>`).join('')}`;
    }).join('');
    const optionsKey = JSON.stringify(['all', allMinutes, ...optionRecords.flatMap(({ theme, minutes, children }) => [`theme:${theme.id}:${theme.name}:${minutes}`, ...children.map(({ subtheme, minutes: childMinutes }) => `subtheme:${subtheme.id}:${subtheme.name}:${childMinutes}`)])]);
    if (select.dataset.optionsKey !== optionsKey) {
      select.innerHTML = optionsHtml;
      select.dataset.optionsKey = optionsKey;
    }
    select.value = [...select.options].some(option => option.value === previous) ? previous : 'all';
  }

  function resetShellSearch() {
    const input = $('#kmShellSearchInput');
    if (input) input.value = '';
    const clear = $('#kmShellSearchClear');
    if (clear) clear.hidden = true;
    const filter = $('#kmShellThemeFilter');
    if (filter) filter.value = 'all';
    document.body.classList.remove('km-shell-searching');
    document.body.classList.remove('km-shell-search-open');
    $('#kmShellSearchToggle')?.setAttribute('aria-expanded', 'false');
    applyShellSearch();
  }

  function setSearchMatches(nodes, query) {
    let visible = 0;
    for (const node of nodes) {
      const match = !query || normalizedSearch(node.textContent).includes(query);
      node.hidden = !match;
      if (match) visible += 1;
    }
    return visible;
  }

  function applyShellSearch() {
    const query = currentSearchValue();
    const themeFilter = section === 'time' ? ($('#kmShellThemeFilter')?.value || 'all') : 'all';
    const searching = Boolean(query) || themeFilter !== 'all';
    if (document.body.classList.contains('km-shell-searching') !== searching) document.body.classList.toggle('km-shell-searching', searching);
    let visible = 0;
    if (section === 'rides') {
      const nodes = $$('#app .trip-entry');
      visible = setSearchMatches(nodes, query);
      $$('#app .trip-group').forEach(group => {
        const items = [...group.querySelectorAll('.trip-entry')];
        group.hidden = Boolean(query) && items.length > 0 && items.every(item => item.hidden);
      });
    } else if (section === 'locations') {
      visible = setSearchMatches($$('#kmShellLocationsView .km-shell-location-node'), query);
    } else if (section === 'themes') {
      visible = setSearchMatches($$('#kmShellThemesView .km-shell-theme-node'), query);
    } else {
      const nodes = $$('#timeModuleRoot .activity-entry-shell');
      const timeState = window.LogTimeModule?.getState?.() || { entries: [], themes: [], subthemes: [] };
      const entries = new Map((timeState.entries || []).map(entry => [String(entry.id), entry]));
      let filteredMinutes = 0;
      for (const node of nodes) {
        const queryMatch = !query || normalizedSearch(node.textContent).includes(query);
        const filterMatch = window.LogTimeFilterModel?.matchesFilter?.(
          entries.get(String(node.dataset.id || '')) || { themeId: node.dataset.themeId, subthemeId: node.dataset.subthemeId },
          themeFilter,
          timeState
        ) ?? true;
        const shouldHide = !(queryMatch && filterMatch);
        if (node.hidden !== shouldHide) node.hidden = shouldHide;
        if (!node.hidden) {
          visible += 1;
          filteredMinutes += Number(entries.get(String(node.dataset.id || ''))?.ownMinutes) || 0;
        }
      }
      const status = $('#kmShellSearchStatus');
      if (status && themeFilter !== 'all' && visible > 0) {
        const option = $('#kmShellThemeFilter')?.selectedOptions?.[0];
        const label = String(option?.textContent || 'Selectie').replace(/\s·\s[^·]+$/, '');
        const themeId = themeFilter.startsWith('theme:')
          ? themeFilter.slice(6)
          : timeState.subthemes?.find(item => String(item.id) === themeFilter.slice(9))?.themeId;
        const theme = timeState.themes?.find(item => String(item.id) === String(themeId || ''));
        const nextText = `${label} · ${compactFilterTime(filteredMinutes)}${theme?.includeInTotals === false ? ' · telt niet mee' : ''}`;
        if (!status.classList.contains('total')) status.classList.add('total');
        if (status.hidden) status.hidden = false;
        if (status.textContent !== nextText) status.textContent = nextText;
      }
    }
    const status = $('#kmShellSearchStatus');
    if (status) {
      const filtering = Boolean(query) || themeFilter !== 'all';
      const hasThemeTotal = section === 'time' && themeFilter !== 'all' && visible > 0;
      if (status.classList.contains('total') !== hasThemeTotal) status.classList.toggle('total', hasThemeTotal);
      if (!hasThemeTotal) {
        const shouldHide = !filtering || visible > 0;
        if (status.hidden !== shouldHide) status.hidden = shouldHide;
        const nextText = filtering && visible === 0 ? 'Geen resultaten gevonden.' : '';
        if (status.textContent !== nextText) status.textContent = nextText;
      }
    }
  }

  function updateScrollChrome(scrollTop, state) {
    const top = Math.max(0, Number(scrollTop) || 0);
    const delta = top - state.top;
    if (top <= 24) {
      document.body.classList.remove('km-shell-scrolled', 'km-shell-search-revealed');
      state.reverse = 0;
    } else {
      document.body.classList.add('km-shell-scrolled');
      if (delta < -.35) {
        state.reverse += -delta;
        if (state.reverse >= 5) document.body.classList.add('km-shell-search-revealed');
      } else if (delta > .35) {
        state.reverse = 0;
        document.body.classList.remove('km-shell-search-revealed');
      }
    }
    state.top = top;
  }

  function bindHeaderCollapse() {
    const update = () => {
      const top = viewportScrollTop();
      if (!sectionTransitioning) sectionScrollPositions.set(section, top);
      updateScrollChrome(top, windowScrollState);
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  function selectSection(next) {
    if (!ROOT_SECTIONS.has(next)) return;
    if (next === section) {
      closeDrawer();
      showSection();
      scrollActiveSectionToTop();
      return;
    }

    sectionScrollPositions.set(section, viewportScrollTop());
    sectionTransitioning = true;
    const restoreToken = ++scrollRestoreToken;
    setViewportScrollTop(0);
    windowScrollState.top = 0;
    windowScrollState.reverse = 0;
    const openedFromDrawer = drawerOpen;
    closeDrawer();
    section = next;
    document.body.classList.remove('km-shell-scrolled', 'km-shell-search-revealed', 'km-shell-tab-transition');
    windowScrollState.top = viewportScrollTop();
    windowScrollState.reverse = 0;
    localStorage.setItem(SECTION_KEY, section);
    localStorage.setItem(MODE_KEY, section === 'time' ? 'time' : 'kilometers');
    if (section === 'time') ensureOriginalMode('time');
    else {
      ensureOriginalMode('kilometers');
      if (!document.body.classList.contains('editor-view')) ensureKmView('ride');
    }
    showSection();
    resetShellSearch();
    restoreSectionScroll(restoreToken);

    if (!openedFromDrawer) {
      void $('.shell')?.offsetWidth;
      document.body.classList.add('km-shell-tab-transition');
      setTimeout(() => document.body.classList.remove('km-shell-tab-transition'), 240);
    }
  }

  function restoreSectionScroll(token) {
    const target = Math.max(0, sectionScrollPositions.get(section) || 0);
    const apply = () => {
      if (token !== scrollRestoreToken) return;
      setViewportScrollTop(target);
      windowScrollState.top = viewportScrollTop();
      windowScrollState.reverse = 0;
      updateScrollChrome(windowScrollState.top, windowScrollState);
    };
    apply();
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(() => {
        apply();
        setTimeout(() => {
          if (token !== scrollRestoreToken) return;
          apply();
          sectionTransitioning = false;
          sectionScrollPositions.set(section, viewportScrollTop());
        }, 60);
      });
    });
  }

  function themeLifecycle(id, type) {
    const lifecycle = window.LogTimeRemovalPolicy;
    const plan = type === 'theme' ? lifecycle?.themePlan?.(id) : lifecycle?.subthemePlan?.(id);
    return { plan, action: plan?.action === 'archive' ? 'Archiveer' : 'Verwijder' };
  }

  function themeSwipeActions(id, type) {
    const { plan, action } = themeLifecycle(id, type);
    const attribute = type === 'theme' ? 'data-log-delete-theme' : 'data-del-sub';
    const lifecycleClass = plan?.action === 'archive' ? 'km-shell-theme-swipe-archive' : 'km-shell-theme-swipe-delete';
    return `<div class="km-shell-theme-swipe-actions"><button type="button" class="km-shell-theme-swipe-action ${lifecycleClass}" ${attribute}="${esc(id)}">${action}</button><button type="button" class="km-shell-theme-swipe-action km-shell-theme-swipe-edit" data-shell-theme-edit="${esc(id)}" data-shell-theme-type="${type}">Bewerk</button></div>`;
  }

  function resetThemeSwipeRow(row) {
    if (!row) return;
    const surface = $('.km-shell-theme-swipe-surface', row);
    if (surface) {
      surface.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
      surface.style.transform = 'translateX(0)';
      delete surface.dataset.swipeOpen;
    }
    row.classList.remove('swipe-open', 'swipe-edit-armed', 'delete-armed');
  }

  function closeThemeSwipes(except = null) {
    $$('.km-shell-theme-swipe-row').forEach(row => {
      if (row !== except) resetThemeSwipeRow(row);
    });
  }

  function openThemeNameEditor(id, type) {
    const catalog = window.LogTimeModule?.getThemeCatalog?.() || { themes: [], subthemes: [] };
    const collection = type === 'subtheme' ? catalog.subthemes : catalog.themes;
    const item = collection.find(candidate => String(candidate.id) === String(id));
    if (!item) return;
    $('#kmShellThemeEditor')?.remove();
    const previousOverflow = document.body.style.overflow;
    const editor = document.createElement('div');
    editor.id = 'kmShellThemeEditor';
    editor.className = 'km-shell-theme-editor';
    const color = themeColor(item);
    const colorField = type === 'theme' ? `<div class="field"><label for="kmShellThemeEditorColor">Kleur</label><div class="km-shell-theme-color-control"><input id="kmShellThemeEditorColor" type="color" value="${esc(color)}"><output id="kmShellThemeEditorColorValue">${esc(color.toUpperCase())}</output></div></div>` : '';
    editor.innerHTML = `<form class="km-shell-theme-editor-panel" aria-labelledby="kmShellThemeEditorTitle"><div class="km-shell-theme-editor-head"><h2 id="kmShellThemeEditorTitle">${type === 'subtheme' ? 'Subthema' : 'Thema'} bewerken</h2><button type="button" class="km-shell-theme-editor-close" data-theme-editor-close aria-label="Sluiten">×</button></div><div class="field"><label for="kmShellThemeEditorName">Naam</label><input id="kmShellThemeEditorName" value="${esc(item.name)}" autocomplete="off"></div>${colorField}<div id="kmShellThemeEditorError" class="hint" role="alert"></div><div class="km-shell-theme-editor-actions"><button type="button" class="btn secondary" data-theme-editor-close>Annuleren</button><button type="submit" class="btn primary">Bewaren</button></div></form>`;
    const close = () => {
      editor.remove();
      document.body.style.overflow = previousOverflow;
    };
    editor.addEventListener('click', event => {
      if (event.target === editor || event.target.closest('[data-theme-editor-close]')) close();
    });
    editor.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    editor.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const input = $('#kmShellThemeEditorName', editor);
      const value = input?.value.trim() || '';
      const renamed = type === 'subtheme'
        ? window.LogTimeModule?.renameSubtheme?.(id, value)
        : window.LogTimeModule?.renameTheme?.(id, value);
      if (!renamed) {
        const error = $('#kmShellThemeEditorError', editor);
        if (error) error.textContent = 'Kies een unieke, niet-lege naam.';
        input?.focus();
        return;
      }
      if (type === 'theme') window.LogTimeModule?.setThemeColor?.(id, $('#kmShellThemeEditorColor', editor)?.value || color);
      close();
      renderThemes();
      syncChrome();
    });
    $('#kmShellThemeEditorColor', editor)?.addEventListener('input', event => {
      const output = $('#kmShellThemeEditorColorValue', editor);
      if (output) output.textContent = event.target.value.toUpperCase();
    });
    document.body.appendChild(editor);
    document.body.style.overflow = 'hidden';
    const input = $('#kmShellThemeEditorName', editor);
    input?.focus();
    input?.select();
  }

  function bindThemeSwipeInteractions(root) {
    root.onpointerdown = event => {
      if (event.button != null && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('button,input,select,textarea')) return;
      const surface = target.closest('.km-shell-theme-swipe-surface');
      const row = surface?.closest('.km-shell-theme-swipe-row');
      if (!surface || !row) return;
      closeThemeSwipes(row);
      themeSwipe = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, row, surface, horizontal: false, cancelled: false, peakLeft: 0 };
      try { surface.setPointerCapture(event.pointerId); } catch (_) {}
    };
    root.onpointermove = event => {
      const gesture = themeSwipe;
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
      const rawX = event.clientX - gesture.startX;
      const rawY = event.clientY - gesture.startY;
      if (!gesture.horizontal) {
        const absX = Math.abs(rawX);
        const absY = Math.abs(rawY);
        if (absX < 10 && absY < 10) return;
        if (absX >= 10 && absX >= absY * 1.08) gesture.horizontal = true;
        else if (absY >= 10 && absY >= absX * 1.35) { gesture.cancelled = true; return; }
        else return;
      }
      if (event.cancelable) event.preventDefault();
      const actionWidth = innerWidth <= 520 ? 78 : 84;
      const maxDistance = actionWidth * 2;
      const dx = Math.max(-maxDistance, Math.min(0, rawX));
      const distance = Math.abs(dx);
      const lifecycleThreshold = actionWidth + 44;
      gesture.peakLeft = Math.max(gesture.peakLeft, distance);
      const editArmed = gesture.peakLeft >= 48 && distance >= 36;
      const lifecycleArmed = gesture.peakLeft >= lifecycleThreshold && distance >= lifecycleThreshold - 18;
      gesture.surface.style.transition = 'none';
      gesture.surface.style.transform = `translateX(${dx}px)`;
      gesture.row.classList.toggle('swipe-edit-armed', editArmed && !lifecycleArmed);
      gesture.row.classList.toggle('delete-armed', lifecycleArmed);
    };
    root.onpointerup = event => {
      const gesture = themeSwipe;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      themeSwipe = null;
      if (gesture.horizontal) {
        gesture.surface.dataset.suppressClick = '1';
        setTimeout(() => { if (gesture.surface) delete gesture.surface.dataset.suppressClick; }, 450);
      }
      resetThemeSwipeRow(gesture.row);
    };
    root.onpointercancel = () => {
      if (themeSwipe) resetThemeSwipeRow(themeSwipe.row);
      themeSwipe = null;
    };
  }

  function themeNodeIds(host) {
    return $$('.km-shell-theme-node[data-theme-node]', host).map(node => node.dataset.themeNode);
  }

  function bindThemeReordering(host) {
    if (!host || host.dataset.themeReorderBound === '1') return;
    host.dataset.themeReorderBound = '1';
    let drag = null;

    const removeListeners = () => {
      document.removeEventListener('pointermove', pointerMove, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('pointercancel', pointerCancel, true);
    };
    const finish = commit => {
      if (!drag) return;
      const active = drag;
      drag = null;
      removeListeners();
      if (active.placeholder.parentNode === host) host.insertBefore(active.node, active.placeholder);
      else host.appendChild(active.node);
      active.placeholder.remove();
      active.node.classList.remove('is-dragging');
      active.node.setAttribute('aria-grabbed', 'false');
      if (active.originalStyle === null) active.node.removeAttribute('style');
      else active.node.setAttribute('style', active.originalStyle);
      if (!commit) return renderThemes();
      window.LogTimeModule?.setThemeOrder?.(themeNodeIds(host));
      const id = active.id;
      renderThemes();
      requestAnimationFrame(() => $(`[data-theme-node="${CSS.escape(id)}"] [data-theme-drag-handle]`, root)?.focus({ preventScroll: true }));
    };
    const update = (clientY, event) => {
      if (!drag) return;
      event.preventDefault();
      drag.node.style.top = Math.round(clientY - drag.offsetY) + 'px';
      const edge = Math.min(74, innerHeight * .16);
      if (clientY < edge) window.scrollBy(0, -14);
      else if (clientY > innerHeight - edge) window.scrollBy(0, 14);
      const before = $$('.km-shell-theme-node[data-theme-node]', host).find(node => {
        const rect = node.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2;
      });
      if (before) host.insertBefore(drag.placeholder, before);
      else host.appendChild(drag.placeholder);
    };
    function pointerMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      update(event.clientY, event);
    }
    function pointerUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      finish(true);
    }
    function pointerCancel(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      finish(false);
    }

    host.addEventListener('pointerdown', event => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const handle = target?.closest('[data-theme-drag-handle]');
      if (!handle || event.button !== 0 || event.isPrimary === false || drag) return;
      const node = handle.closest('.km-shell-theme-node[data-theme-node]');
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = node.getBoundingClientRect();
      const placeholder = document.createElement('div');
      placeholder.className = 'km-shell-theme-placeholder';
      placeholder.style.height = Math.round(rect.height) + 'px';
      placeholder.setAttribute('aria-hidden', 'true');
      host.insertBefore(placeholder, node.nextElementSibling);
      drag = { pointerId: event.pointerId, id: node.dataset.themeNode, node, placeholder, offsetY: event.clientY - rect.top, originalStyle: node.getAttribute('style') };
      node.classList.add('is-dragging');
      node.setAttribute('aria-grabbed', 'true');
      Object.assign(node.style, { position: 'fixed', left: Math.round(rect.left) + 'px', top: Math.round(rect.top) + 'px', width: Math.round(rect.width) + 'px', height: Math.round(rect.height) + 'px', margin: '0', transition: 'none', boxSizing: 'border-box' });
      document.body.appendChild(node);
      document.addEventListener('pointermove', pointerMove, { capture: true, passive: false });
      document.addEventListener('pointerup', pointerUp, { capture: true, passive: false });
      document.addEventListener('pointercancel', pointerCancel, { capture: true, passive: true });
    });

    host.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const handle = target?.closest('[data-theme-drag-handle]');
      const node = handle?.closest('.km-shell-theme-node[data-theme-node]');
      if (!node) return;
      const neighbor = event.key === 'ArrowUp' ? node.previousElementSibling : node.nextElementSibling;
      if (!neighbor?.matches('.km-shell-theme-node[data-theme-node]')) return;
      event.preventDefault();
      if (event.key === 'ArrowUp') host.insertBefore(node, neighbor);
      else host.insertBefore(node, neighbor.nextElementSibling);
      window.LogTimeModule?.setThemeOrder?.(themeNodeIds(host));
      renderThemes();
      requestAnimationFrame(() => $(`[data-theme-node="${CSS.escape(node.dataset.themeNode)}"] [data-theme-drag-handle]`, root)?.focus({ preventScroll: true }));
    });
  }

  function renderThemes() {
    const root = $('#kmShellThemesView');
    if (!root || section !== 'themes' || document.body.classList.contains('editor-view')) return;
    const catalog = window.LogTimeModule?.getThemeCatalog?.() || { themes: [], subthemes: [], sortMode: 'smart', themeOrder: [] };
    const sortMode = ['smart', 'alpha', 'custom'].includes(catalog.sortMode) ? catalog.sortMode : 'smart';
    const orderIndex = new Map((catalog.themeOrder || []).map((id, index) => [String(id), index]));
    const themes = [...catalog.themes].sort((a, b) => {
      if (sortMode === 'custom') return (orderIndex.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (orderIndex.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER);
      if (sortMode === 'alpha') return String(a.name).localeCompare(String(b.name), 'nl', { sensitivity: 'base' });
      return (Number(b.lastUsedAt) || 0) - (Number(a.lastUsedAt) || 0) || (Number(b.usageCount) || 0) - (Number(a.usageCount) || 0) || String(a.name).localeCompare(String(b.name), 'nl', { sensitivity: 'base' });
    });
    const excludedCount = themes.filter(theme => theme.includeInTotals === false).length;
    const includedCount = themes.length - excludedCount;
    if (expandedThemeId && !themes.some(theme => String(theme.id) === String(expandedThemeId))) expandedThemeId = null;
    const nodes = themes.map(theme => {
      const subthemes = catalog.subthemes
        .filter(subtheme => String(subtheme.themeId) === String(theme.id))
        .sort((a, b) => (Number(b.usageCount) || 0) - (Number(a.usageCount) || 0) || String(a.name).localeCompare(String(b.name), 'nl', { sensitivity: 'base' }));
      const expanded = String(expandedThemeId) === String(theme.id);
      const details = expanded ? `<div class="km-shell-theme-details"><div class="km-shell-subtheme-list">${subthemes.length ? subthemes.map(subtheme => `<div class="km-shell-subtheme-item"><div class="km-shell-theme-swipe-row" data-shell-theme-swipe="${esc(subtheme.id)}" data-shell-theme-type="subtheme">${themeSwipeActions(subtheme.id, 'subtheme')}<div class="km-shell-subtheme-row km-shell-theme-swipe-surface"><div class="km-shell-subtheme-copy"><strong><span class="km-shell-subtheme-branch" aria-hidden="true">↳</span>${esc(subtheme.name)}</strong><small>${Number(subtheme.usageCount) || 0}× gebruikt</small></div><span class="km-shell-location-chevron" aria-hidden="true">›</span></div></div></div>`).join('') : '<div class="km-shell-empty">Nog geen subthema’s.</div>'}</div><div class="km-shell-subtheme-create"><div class="field"><label for="kmShellNewSubtheme-${esc(theme.id)}">Nieuw subthema</label><input id="kmShellNewSubtheme-${esc(theme.id)}" data-new-subtheme="${esc(theme.id)}" autocomplete="off" placeholder="Naam"></div><button type="button" class="btn" data-add-subtheme="${esc(theme.id)}">Toevoegen</button></div></div>` : '';
      const included = theme.includeInTotals !== false;
      const dragHandle = sortMode === 'custom' ? `<button type="button" class="km-shell-theme-drag-handle" data-theme-drag-handle aria-label="${esc(theme.name)} verslepen" title="Sleep om te verplaatsen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"></path></svg></button>` : '';
      return `<section class="km-shell-theme-node" data-theme-node="${esc(theme.id)}" style="--theme-color:${themeColor(theme)}"><span class="km-shell-legacy">${esc(subthemes.map(subtheme => subtheme.name).join(' '))}</span><div class="km-shell-theme-swipe-row" data-shell-theme-swipe="${esc(theme.id)}" data-shell-theme-type="theme">${themeSwipeActions(theme.id, 'theme')}<div class="km-shell-theme-row km-shell-theme-swipe-surface${sortMode === 'custom' ? ' km-shell-theme-custom-row' : ''}" data-theme-toggle="${esc(theme.id)}">${dragHandle}<div class="km-shell-theme-row-copy"><strong>${esc(theme.name)}</strong><small>${subthemes.length} ${subthemes.length === 1 ? 'subthema' : 'subthema’s'} · ${Number(theme.usageCount) || 0}× gebruikt</small></div><button type="button" class="km-shell-theme-count-toggle" data-theme-count-toggle="${esc(theme.id)}" aria-pressed="${included}" aria-label="${included ? 'Niet meetellen in tijdtotalen' : 'Meetellen in tijdtotalen'}" title="${included ? 'Telt mee in tijdtotalen' : 'Telt niet mee in tijdtotalen'}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5v5l3.2 1.9"></path></svg></button><button type="button" class="km-shell-theme-action km-shell-theme-toggle" data-theme-expand="${esc(theme.id)}" aria-expanded="${expanded}" aria-label="${expanded ? 'Subthema’s sluiten' : 'Subthema’s tonen'}">${expanded ? '⌄' : '›'}</button></div></div>${details}</section>`;
    }).join('');
    const archiveRecords = window.LogTimeRemovalPolicy?.themeArchiveRecords?.() || [];
    const archive = archiveRecords.length ? `<details class="km-shell-theme-archive"><summary><span class="km-shell-theme-archive-copy"><strong>Archief</strong><small>${archiveRecords.length} ${archiveRecords.length === 1 ? 'item' : 'items'} · tik om te herstellen</small></span><span aria-hidden="true">›</span></summary><div class="km-shell-theme-archive-body">${archiveRecords.map(record => `<div class="km-shell-theme-archive-row"><div><strong>${esc(window.LogTimeRemovalPolicy?.archiveRecordName?.(record) || 'Thema')}</strong><small>${record.entityType === 'theme' ? 'Thema' : 'Subthema'}</small></div><button type="button" data-log-time-restore="${esc(record.batchId)}">Herstel</button></div>`).join('')}</div></details>` : '';
    const countStatus = excludedCount === 0 ? 'Alle thema’s tellen mee' : includedCount === 0 ? 'Geen thema telt mee' : `${excludedCount} ${excludedCount === 1 ? 'thema telt' : 'thema’s tellen'} niet mee`;
    const countTools = themes.length ? `<div class="km-shell-theme-count-tools"><span>${countStatus}</span><div class="km-shell-theme-count-actions"><button type="button" class="km-shell-theme-count-all" data-theme-count-all${excludedCount === 0 ? ' disabled' : ''}>Alles aan</button><button type="button" class="km-shell-theme-count-all" data-theme-count-none${includedCount === 0 ? ' disabled' : ''}>Alles uit</button></div></div>` : '';
    const sortControls = `<div class="km-shell-theme-sort" aria-label="Thema’s sorteren"><button type="button" class="${sortMode === 'smart' ? 'active' : ''}" data-theme-sort="smart">◎ Logisch</button><button type="button" class="${sortMode === 'alpha' ? 'active' : ''}" data-theme-sort="alpha">A–Z Naam</button><button type="button" class="${sortMode === 'custom' ? 'active' : ''}" data-theme-sort="custom">☰ Eigen</button></div>`;
    root.innerHTML = `<div class="km-shell-theme-create"><div class="field"><label for="kmShellNewTheme">Nieuw thema</label><input id="kmShellNewTheme" autocomplete="off" placeholder="Naam"></div><button type="button" class="btn primary" data-add-theme>Toevoegen</button></div>${sortControls}${countTools}${themes.length ? `<div class="km-shell-theme-list">${nodes}</div>` : '<div class="km-shell-empty">Nog geen thema’s opgeslagen.</div>'}${archive}`;

    const addTheme = () => {
      const input = $('#kmShellNewTheme', root);
      if (!input?.value.trim()) return input?.focus();
      const theme = window.LogTimeModule?.createTheme?.(input.value);
      if (theme) {
        expandedThemeId = theme.id;
        renderThemes();
      }
    };
    $('[data-add-theme]', root)?.addEventListener('click', addTheme);
    $('#kmShellNewTheme', root)?.addEventListener('keydown', event => { if (event.key === 'Enter') addTheme(); });
    $$('[data-theme-sort]', root).forEach(button => button.addEventListener('click', () => {
      window.LogTimeModule?.setThemeSortMode?.(button.dataset.themeSort, themes.map(theme => theme.id));
      renderThemes();
    }));
    $$('[data-theme-count-toggle]', root).forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      window.LogTimeModule?.setThemeIncludedInTotals?.(button.dataset.themeCountToggle, button.getAttribute('aria-pressed') !== 'true');
      renderThemes();
    }));
    $('[data-theme-count-all]', root)?.addEventListener('click', () => {
      window.LogTimeModule?.includeAllThemesInTotals?.();
      renderThemes();
    });
    $('[data-theme-count-none]', root)?.addEventListener('click', () => {
      window.LogTimeModule?.excludeAllThemesFromTotals?.();
      renderThemes();
    });
    $$('[data-theme-expand]', root).forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      expandedThemeId = String(expandedThemeId) === String(button.dataset.themeExpand) ? null : button.dataset.themeExpand;
      renderThemes();
      applyShellSearch();
    }));
    $$('[data-theme-toggle]', root).forEach(row => row.addEventListener('click', event => {
      if (event.target.closest('button,input')) return;
      if (row.closest('.km-shell-theme-swipe-surface')?.dataset.suppressClick === '1') return;
      expandedThemeId = String(expandedThemeId) === String(row.dataset.themeToggle) ? null : row.dataset.themeToggle;
      renderThemes();
      applyShellSearch();
    }));
    $$('[data-shell-theme-edit]', root).forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openThemeNameEditor(button.dataset.shellThemeEdit, button.dataset.shellThemeType || 'theme');
    }));
    $$('[data-add-subtheme]', root).forEach(button => {
      const add = () => {
        const input = $(`[data-new-subtheme="${CSS.escape(button.dataset.addSubtheme)}"]`, root);
        if (!input?.value.trim()) return input?.focus();
        if (window.LogTimeModule?.createSubtheme?.(button.dataset.addSubtheme, input.value)) renderThemes();
      };
      button.addEventListener('click', add);
      $(`[data-new-subtheme="${CSS.escape(button.dataset.addSubtheme)}"]`, root)?.addEventListener('keydown', event => { if (event.key === 'Enter') add(); });
    });
    bindThemeSwipeInteractions(root);
    if (sortMode === 'custom') bindThemeReordering($('.km-shell-theme-list', root));
  }

  function refreshThemesFromStorage() {
    window.LogTimeModule?.reloadFromStorage?.({ view: 'home' });
    renderThemes();
  }

  function renderPlaceholderModule() {
    const view = $('#kmShellPlaceholderView');
    const module = moduleById(section);
    if (!view || !module?.placeholder) return;
    const cards = section === 'themes'
      ? [['Projectthema’s', 'Groepeer registraties op herkenbare onderwerpen.'], ['Subthema’s', 'Werk thema’s later verder uit in een eigen structuur.']]
      : [['Kaarten scannen', 'Start later een rit of taak met een barcodekaart.'], ['Kaarten beheren', 'Koppel kaarten aan vaste acties en gegevens.']];
    view.innerHTML = `<section class="km-shell-placeholder-hero">${moduleIcon(section)}<h2>${esc(module.label)}</h2><p>Dit onderdeel staat alvast klaar als dummy. De inhoud kan later worden toegevoegd zonder de navigatie opnieuw op te bouwen.</p></section><div class="km-shell-placeholder-grid">${cards.map(card => `<div class="km-shell-placeholder-card"><strong>${esc(card[0])}</strong><small>${esc(card[1])}</small></div>`).join('')}</div>`;
  }

  function showSection() {
    const locations = $('#kmShellLocationsView');
    const themes = $('#kmShellThemesView');
    const placeholder = $('#kmShellPlaceholderView');
    document.body.classList.toggle('km-shell-placeholder-mode', Boolean(moduleById(section)?.placeholder));
    if (document.body.classList.contains('editor-view')) {
      document.body.classList.remove('km-shell-locations-mode', 'km-shell-themes-mode', 'km-shell-placeholder-mode');
      if (locations) locations.hidden = true;
      if (themes) themes.hidden = true;
      if (placeholder) placeholder.hidden = true;
      syncChrome();
      notifyActiveViewRefresh();
      return;
    }

    if (section === 'locations') {
      ensureOriginalMode('kilometers');
      ensureKmView('ride');
      document.body.classList.remove('km-shell-themes-mode');
      document.body.classList.add('km-shell-locations-mode');
      if (locations) locations.hidden = false;
      if (themes) themes.hidden = true;
      if (placeholder) placeholder.hidden = true;
      renderLocations();
    } else if (section === 'themes') {
      ensureOriginalMode('kilometers');
      ensureKmView('ride');
      document.body.classList.remove('km-shell-locations-mode');
      document.body.classList.add('km-shell-themes-mode');
      if (locations) locations.hidden = true;
      if (themes) themes.hidden = false;
      if (placeholder) placeholder.hidden = true;
      renderThemes();
    } else if (moduleById(section)?.placeholder) {
      ensureOriginalMode('kilometers');
      ensureKmView('ride');
      document.body.classList.remove('km-shell-locations-mode', 'km-shell-themes-mode');
      if (locations) locations.hidden = true;
      if (themes) themes.hidden = true;
      if (placeholder) placeholder.hidden = false;
      renderPlaceholderModule();
    } else {
      document.body.classList.remove('km-shell-locations-mode', 'km-shell-themes-mode');
      if (locations) locations.hidden = true;
      if (themes) themes.hidden = true;
      if (placeholder) placeholder.hidden = true;
      ensureOriginalMode(section === 'time' ? 'time' : 'kilometers');
      if (section === 'rides') ensureKmView('ride');
    }
    syncChrome();
    notifyActiveViewRefresh();
  }

  function syncChrome() {
    const title = $('#kmShellTitle');
    const meta = $('#kmShellMeta');
    const menu = $('#kmShellMenuButton');
    const wantedTitle = moduleById(section)?.label || 'Registratie';
    if (title && title.textContent !== wantedTitle) title.textContent = wantedTitle;
    const wantedDocumentTitle = wantedTitle + ' · Log';
    if (document.title !== wantedDocumentTitle) document.title = wantedDocumentTitle;
    if (menu) {
      const wantedIcon = '☰';
      const wantedLabel = 'Menu openen';
      const wantedExpanded = String(drawerOpen);
      if (menu.textContent !== wantedIcon) menu.textContent = wantedIcon;
      if (menu.getAttribute('aria-label') !== wantedLabel) menu.setAttribute('aria-label', wantedLabel);
      if (menu.getAttribute('aria-expanded') !== wantedExpanded) menu.setAttribute('aria-expanded', wantedExpanded);
    }
    if (meta) {
      let wantedMeta = '';
      if (section === 'rides') {
        const data = readData();
        wantedMeta = `${data.trips.length} ${data.trips.length === 1 ? 'rit' : 'ritten'} geregistreerd`;
      } else if (section === 'locations') {
        const data = readData();
        const childCount = data.locations.filter(location => location.parentId).length;
        wantedMeta = `${data.locations.length} locaties${childCount ? ` · ${childCount} sublocaties` : ''}`;
      } else if (section === 'time') {
        try {
          const time = JSON.parse(localStorage.getItem('urenregistratie.test.pwa.v1') || '{}');
          const entries = Array.isArray(time.entries) ? time.entries.filter(entry => entry.activityType !== 'interruption') : [];
          wantedMeta = `${entries.length} ${entries.length === 1 ? 'taak' : 'taken'} geregistreerd${time.timer?.status === 'active' ? ' · timer actief' : ''}`;
        } catch (_) {
          wantedMeta = 'Tijdsregistratie';
        }
      } else if (section === 'themes') {
        const catalog = window.LogTimeModule?.getThemeCatalog?.() || { themes: [], subthemes: [] };
        wantedMeta = `${catalog.themes.length} ${catalog.themes.length === 1 ? 'thema' : 'thema’s'} · ${catalog.subthemes.length} ${catalog.subthemes.length === 1 ? 'subthema' : 'subthema’s'}`;
      } else {
        wantedMeta = moduleById(section)?.subtitle || 'Onderdeel in voorbereiding';
      }
      if (meta.textContent !== wantedMeta) meta.textContent = wantedMeta;
    }
    updateSearchPlaceholder();
    updateThemeFilterOptions();
    syncDrawerSelection();
  }

  function filterTripLocationSelects() {
    const snapshot = readData();
    const byId = new Map(snapshot.locations.map(location => [String(location.id), location]));
    if (![...byId.values()].some(location => location.parentId)) return;
    const selectors = [
      '#startDestination',
      '#arrivalDestination',
      '#manualForm select[name="originId"]',
      '#manualForm select[name="destinationId"]',
      '#tripEditForm select[name="originId"]',
      '#tripEditForm select[name="destinationId"]'
    ];
    for (const select of $$(selectors.join(','))) {
      const isArrival = select.id === 'arrivalDestination';
      for (const option of [...select.options]) {
        const optionId = isArrival && option.value.startsWith('known:') ? option.value.slice(6) : option.value;
        const location = byId.get(optionId);
        const parent = location?.parentId ? byId.get(String(location.parentId)) : null;
        if (location && parent) option.textContent = `${parent.name || 'Hoofdlocatie'} › ${location.name || 'Sublocatie'}`;
      }
    }
  }

  function locationTripCount(location, snapshot) {
    const seen = new Set();
    for (const trip of snapshot.trips) {
      if (trip.origin?.id === location.id || trip.destination?.id === location.id) seen.add(trip.id);
    }
    for (const event of snapshot.events) {
      if (event.tripId && event.location?.id === location.id) seen.add(event.tripId);
    }
    return seen.size;
  }

  function locationFamilyIds(location, snapshot) {
    const ids = new Set([String(location.id)]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of snapshot.locations) {
        if (candidate.parentId && ids.has(String(candidate.parentId)) && !ids.has(String(candidate.id))) {
          ids.add(String(candidate.id));
          changed = true;
        }
      }
    }
    return ids;
  }

  function locationLastUsedAt(location, snapshot) {
    const ids = locationFamilyIds(location, snapshot);
    let latest = 0;
    const record = value => {
      const stamp = Date.parse(value || '');
      if (Number.isFinite(stamp)) latest = Math.max(latest, stamp);
    };
    for (const trip of snapshot.trips) {
      if (ids.has(String(trip.origin?.id || '')) || ids.has(String(trip.destination?.id || ''))) {
        record(trip.arrivalTime);
        record(trip.departureTime);
        record(trip.updatedAt);
      }
    }
    for (const event of snapshot.events) {
      if (ids.has(String(event.location?.id || ''))) {
        record(event.time);
        record(event.updatedAt);
      }
    }
    return latest;
  }

  function locationSortMode(snapshot) {
    return ['smart', 'alpha', 'custom'].includes(snapshot.settings.locationSortMode) ? snapshot.settings.locationSortMode : 'smart';
  }

  function normalizedLocationOrder(snapshot, roots) {
    const ids = roots.map(location => String(location.id));
    const saved = Array.isArray(snapshot.settings.locationOrder) ? snapshot.settings.locationOrder.map(String) : [];
    return [...saved.filter((id, index) => ids.includes(id) && saved.indexOf(id) === index), ...ids.filter(id => !saved.includes(id))];
  }

  function orderedRoots(snapshot) {
    const roots = snapshot.locations.filter(location => !location.parentId || !snapshot.locations.some(candidate => candidate.id === location.parentId));
    const mode = locationSortMode(snapshot);
    if (mode === 'custom') {
      const order = new Map(normalizedLocationOrder(snapshot, roots).map((id, index) => [id, index]));
      return roots.sort((a, b) => (order.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (order.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER));
    }
    if (mode === 'alpha') return roots.sort((a, b) => String(a.name).localeCompare(String(b.name), 'nl', { sensitivity: 'base' }));
    return roots.sort((a, b) => locationLastUsedAt(b, snapshot) - locationLastUsedAt(a, snapshot)
      || locationTripCount(b, snapshot) - locationTripCount(a, snapshot)
      || String(a.name).localeCompare(String(b.name), 'nl', { sensitivity: 'base' }));
  }

  function locationNodeHtml(location, depth, snapshot) {
    const effective = effectiveLocation(location, snapshot);
    const children = snapshot.locations
      .filter(candidate => candidate.parentId === location.id)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'nl', { sensitivity: 'base' }));
    const expanded = expandedLocationId === location.id;
    const subtitle = depth
      ? (location.address || (effective.parent ? `Onder ${effective.parent.name}` : '') || 'Sublocatie')
      : (location.address || (effective.lat != null && effective.lng != null ? `${Number(effective.lat).toFixed(5)}, ${Number(effective.lng).toFixed(5)}` : 'Geen adres/GPS'));
    const gps = effective.lat != null && effective.lng != null ? `${Number(effective.lat).toFixed(5)}, ${Number(effective.lng).toFixed(5)}` : 'Niet vastgelegd';
    const inherited = depth && (!location.address || location.lat == null || location.lng == null) && effective.parent;
    const count = locationTripCount(location, snapshot);
    const canDelete = snapshot.settings.swipeDeleteEnabled !== false && snapshot.settings.locationDeleteEnabled !== false;
    const custom = depth === 0 && locationSortMode(snapshot) === 'custom';
    const dragHandle = custom ? `<button type="button" class="km-shell-location-drag-handle" data-location-drag-handle aria-label="${esc(location.name || 'Locatie')} verslepen" title="Sleep om te verplaatsen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"></path></svg></button>` : '';
    return `
      <div class="km-shell-location-node" data-shell-location-node="${esc(location.id)}" data-depth="${depth}" style="--depth:${depth}">
        <div class="km-shell-location-swipe-row" data-shell-location-swipe="${esc(location.id)}">
          <div class="km-shell-location-swipe-actions">
            ${canDelete ? `<button type="button" class="km-shell-location-swipe-action km-shell-location-swipe-delete" data-shell-location-swipe-action="delete" data-location-id="${esc(location.id)}">Verwijder</button>` : ''}
            <button type="button" class="km-shell-location-swipe-action km-shell-location-swipe-edit" data-shell-location-swipe-action="edit" data-location-id="${esc(location.id)}">Bewerk</button>
          </div>
          <div class="km-shell-location-row km-shell-location-swipe-surface${custom ? ' km-shell-location-custom-row' : ''}" data-shell-location-toggle="${esc(location.id)}" role="button" tabindex="0" aria-expanded="${expanded}">
            ${dragHandle}
            <span class="km-shell-location-icon">${locationGlyph(location.type)}</span>
            <div class="km-shell-location-copy"><strong>${esc(location.name || 'Locatie')}</strong><small>${esc(subtitle)}</small></div>
            <div class="km-shell-location-buttons">
              <button type="button" data-shell-edit-location="${esc(location.id)}" aria-label="${esc(location.name)} bewerken">•••</button>
              <span class="km-shell-location-chevron" aria-hidden="true">${expanded ? '⌄' : '›'}</span>
            </div>
          </div>
        </div>
        <div class="km-shell-location-details" data-shell-location-details="${esc(location.id)}"${expanded ? '' : ' hidden'}><div class="km-shell-location-detail-grid"><div class="km-shell-location-detail"><span>Type</span><strong>${esc(typeLabel(location.type))}</strong></div><div class="km-shell-location-detail"><span>Ritten</span><strong>${count}</strong></div><div class="km-shell-location-detail"><span>GPS</span><strong>${esc(gps)}${inherited ? ' · geërfd' : ''}</strong></div><div class="km-shell-location-detail"><span>Niveau</span><strong>${depth ? 'Sublocatie' : 'Hoofdlocatie'}</strong></div></div>${depth === 0 ? `<button type="button" class="km-shell-child-add" data-shell-add-child="${esc(location.id)}">+ Sublocatie toevoegen</button>` : ''}</div>
      </div>
      ${children.map(child => locationNodeHtml(child, Math.min(depth + 1, 1), snapshot)).join('')}`;
  }

  function resetLocationSwipeRow(row) {
    if (!row) return;
    const surface = row.querySelector('.km-shell-location-swipe-surface');
    if (surface) {
      surface.style.transition = 'transform .18s ease';
      surface.style.transform = 'translateX(0)';
      delete surface.dataset.swipeOpen;
    }
    row.classList.remove('swipe-open', 'swipe-edit-armed', 'delete-armed');
  }

  function closeLocationSwipes(except = null) {
    $$('.km-shell-location-swipe-row').forEach(row => {
      if (row !== except) resetLocationSwipeRow(row);
    });
  }

  function deleteLocationFromShell(id) {
    if (readData().settings.locationDeleteEnabled === false) return;
    const finish = () => {
      renderLocations();
      syncChrome();
      const undo = $('#toast button');
      undo?.addEventListener('click', () => setTimeout(() => {
        renderLocations();
        syncChrome();
      }, 0), { once: true });
    };
    if (typeof window.deleteLocation === 'function') {
      window.deleteLocation(id);
      finish();
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.dataset.id = id;
    wrapper.className = 'km-shell-legacy';
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = 'delete-location';
    wrapper.appendChild(button);
    document.body.appendChild(wrapper);
    button.click();
    wrapper.remove();
    setTimeout(finish, 0);
  }

  function setExpandedLocation(root, id) {
    expandedLocationId = String(expandedLocationId || '') === String(id) ? null : String(id);
    $$('.km-shell-location-node[data-shell-location-node]', root).forEach(node => {
      const open = String(node.dataset.shellLocationNode) === String(expandedLocationId || '');
      const toggle = $('[data-shell-location-toggle]', node);
      const details = $('[data-shell-location-details]', node);
      const chevron = $('.km-shell-location-chevron', node);
      if (toggle) toggle.setAttribute('aria-expanded', String(open));
      if (details) details.hidden = !open;
      if (chevron) chevron.textContent = open ? '⌄' : '›';
    });
  }

  function saveLocationOrdering(mode, order = null) {
    const snapshot = readData();
    const roots = snapshot.locations.filter(location => !location.parentId || !snapshot.locations.some(candidate => String(candidate.id) === String(location.parentId)));
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(DATA_KEY) || '{}'); } catch (_) {}
    if (!raw || typeof raw !== 'object') raw = {};
    if (!raw.settings || typeof raw.settings !== 'object') raw.settings = {};
    raw.settings.locationSortMode = ['smart', 'alpha', 'custom'].includes(mode) ? mode : 'smart';
    if (raw.settings.locationSortMode === 'custom' || Array.isArray(order)) {
      const source = Array.isArray(order) ? order.map(String) : normalizedLocationOrder(snapshot, roots);
      const ids = roots.map(location => String(location.id));
      raw.settings.locationOrder = [...source.filter((id, index) => ids.includes(id) && source.indexOf(id) === index), ...ids.filter(id => !source.includes(id))];
    }
    localStorage.setItem(DATA_KEY, JSON.stringify(raw));
    window.dispatchEvent(new CustomEvent(KM_STATE_EVENT, { detail: { key: DATA_KEY, reason: 'location-sort', source: 'shell-ui' } }));
  }

  function locationGroupIds(host) {
    return $$('.km-shell-location-group[data-shell-location-group]', host).map(group => group.dataset.shellLocationGroup);
  }

  function bindLocationReordering(host, root) {
    if (!host || host.dataset.locationReorderBound === '1') return;
    host.dataset.locationReorderBound = '1';
    let drag = null;
    const removeListeners = () => {
      document.removeEventListener('pointermove', pointerMove, true);
      document.removeEventListener('pointerup', pointerUp, true);
      document.removeEventListener('pointercancel', pointerCancel, true);
    };
    const finish = commit => {
      if (!drag) return;
      const active = drag;
      drag = null;
      removeListeners();
      if (active.placeholder.parentNode === host) host.insertBefore(active.group, active.placeholder);
      else host.appendChild(active.group);
      active.placeholder.remove();
      active.group.classList.remove('is-dragging');
      active.group.setAttribute('aria-grabbed', 'false');
      if (active.originalStyle === null) active.group.removeAttribute('style');
      else active.group.setAttribute('style', active.originalStyle);
      if (!commit) return renderLocations();
      saveLocationOrdering('custom', locationGroupIds(host));
      const id = active.id;
      renderLocations();
      requestAnimationFrame(() => $(`[data-shell-location-group="${CSS.escape(id)}"] [data-location-drag-handle]`, root)?.focus({ preventScroll: true }));
    };
    const update = (clientY, event) => {
      if (!drag) return;
      event.preventDefault();
      drag.group.style.top = Math.round(clientY - drag.offsetY) + 'px';
      const edge = Math.min(74, innerHeight * .16);
      if (clientY < edge) window.scrollBy(0, -14);
      else if (clientY > innerHeight - edge) window.scrollBy(0, 14);
      const before = $$('.km-shell-location-group[data-shell-location-group]', host).find(group => {
        const rect = group.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2;
      });
      if (before) host.insertBefore(drag.placeholder, before);
      else host.appendChild(drag.placeholder);
    };
    function pointerMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      update(event.clientY, event);
    }
    function pointerUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      finish(true);
    }
    function pointerCancel(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      finish(false);
    }
    host.addEventListener('pointerdown', event => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const handle = target?.closest('[data-location-drag-handle]');
      if (!handle || event.button !== 0 || event.isPrimary === false || drag) return;
      const group = handle.closest('.km-shell-location-group[data-shell-location-group]');
      if (!group) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = group.getBoundingClientRect();
      const placeholder = document.createElement('div');
      placeholder.className = 'km-shell-location-placeholder';
      placeholder.style.height = Math.round(rect.height) + 'px';
      placeholder.setAttribute('aria-hidden', 'true');
      host.insertBefore(placeholder, group.nextElementSibling);
      drag = { pointerId: event.pointerId, id: group.dataset.shellLocationGroup, group, placeholder, offsetY: event.clientY - rect.top, originalStyle: group.getAttribute('style') };
      group.classList.add('is-dragging');
      group.setAttribute('aria-grabbed', 'true');
      Object.assign(group.style, { position: 'fixed', left: Math.round(rect.left) + 'px', top: Math.round(rect.top) + 'px', width: Math.round(rect.width) + 'px', height: Math.round(rect.height) + 'px', margin: '0', transition: 'none', boxSizing: 'border-box' });
      document.body.appendChild(group);
      document.addEventListener('pointermove', pointerMove, { capture: true, passive: false });
      document.addEventListener('pointerup', pointerUp, { capture: true, passive: false });
      document.addEventListener('pointercancel', pointerCancel, { capture: true, passive: true });
    });
    host.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const handle = target?.closest('[data-location-drag-handle]');
      const group = handle?.closest('.km-shell-location-group[data-shell-location-group]');
      if (!group) return;
      const neighbor = event.key === 'ArrowUp' ? group.previousElementSibling : group.nextElementSibling;
      if (!neighbor?.matches('.km-shell-location-group[data-shell-location-group]')) return;
      event.preventDefault();
      if (event.key === 'ArrowUp') host.insertBefore(group, neighbor);
      else host.insertBefore(group, neighbor.nextElementSibling);
      const id = group.dataset.shellLocationGroup;
      saveLocationOrdering('custom', locationGroupIds(host));
      renderLocations();
      requestAnimationFrame(() => $(`[data-shell-location-group="${CSS.escape(id)}"] [data-location-drag-handle]`, root)?.focus({ preventScroll: true }));
    });
  }

  function bindLocationInteractions(root) {
    root.onclick = event => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;
      const sort = target.closest('.km-shell-location-sort [data-mode]');
      if (sort) {
        event.preventDefault();
        event.stopPropagation();
        saveLocationOrdering(sort.dataset.mode);
        renderLocations();
        return;
      }
      const swipeAction = target.closest('[data-shell-location-swipe-action]');
      if (swipeAction) {
        event.preventDefault();
        event.stopPropagation();
        const row = swipeAction.closest('.km-shell-location-swipe-row');
        const id = swipeAction.dataset.locationId;
        resetLocationSwipeRow(row);
        if (swipeAction.dataset.shellLocationSwipeAction === 'edit') openLocationEditor(id);
        else if (swipeAction.dataset.shellLocationSwipeAction === 'delete') deleteLocationFromShell(id);
        return;
      }
      const edit = target.closest('[data-shell-edit-location]');
      if (edit) {
        event.preventDefault();
        event.stopPropagation();
        openLocationEditor(edit.dataset.shellEditLocation);
        return;
      }
      const add = target.closest('[data-shell-add-location]');
      if (add) {
        event.preventDefault();
        event.stopPropagation();
        openLocationEditor(null, null, false);
        return;
      }
      const current = target.closest('[data-shell-current-location]');
      if (current) {
        event.preventDefault();
        event.stopPropagation();
        openLocationEditor(null, null, true);
        return;
      }
      const child = target.closest('[data-shell-add-child]');
      if (child) {
        event.preventDefault();
        event.stopPropagation();
        openLocationEditor(null, child.dataset.shellAddChild, false);
        return;
      }
      const surface = target.closest('.km-shell-location-swipe-surface');
      if (surface?.dataset.suppressClick === '1') {
        event.preventDefault();
        event.stopPropagation();
        delete surface.dataset.suppressClick;
        return;
      }
      const swipeRow = target.closest('.km-shell-location-swipe-row');
      if (surface && swipeRow?.classList.contains('swipe-open')) {
        event.preventDefault();
        event.stopPropagation();
        resetLocationSwipeRow(swipeRow);
        return;
      }
      const toggle = target.closest('[data-shell-location-toggle]');
      if (toggle && !target.closest('button')) {
        event.preventDefault();
        event.stopPropagation();
        setExpandedLocation(root, toggle.dataset.shellLocationToggle);
      }
    };

    root.onkeydown = event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : null;
      const toggle = target?.closest('[data-shell-location-toggle]');
      if (!toggle || target.closest('button')) return;
      event.preventDefault();
      setExpandedLocation(root, toggle.dataset.shellLocationToggle);
    };

    root.onpointerdown = event => {
      if (event.button != null && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest('button,input,select,textarea')) return;
      const surface = target.closest('.km-shell-location-swipe-surface');
      const row = surface?.closest('.km-shell-location-swipe-row');
      if (!surface || !row) return;
      closeLocationSwipes(row);
      locationSwipe = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dx: 0,
        row,
        surface,
        horizontal: false,
        cancelled: false,
        peakLeft: 0,
        maxDistance: 0
      };
      try { surface.setPointerCapture(event.pointerId); } catch (_) {}
    };

    root.onpointermove = event => {
      const gesture = locationSwipe;
      if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;
      const rawX = event.clientX - gesture.startX;
      const rawY = event.clientY - gesture.startY;
      if (!gesture.horizontal) {
        const absX = Math.abs(rawX);
        const absY = Math.abs(rawY);
        if (absX < 10 && absY < 10) return;
        if (absX >= 10 && absX >= absY * 1.08) gesture.horizontal = true;
        else if (absY >= 10 && absY >= absX * 1.35) {
          gesture.cancelled = true;
          return;
        }
        else return;
      }
      if (event.cancelable) event.preventDefault();
      const actionWidth = innerWidth <= 520 ? 78 : 84;
      const actionCount = gesture.row.querySelectorAll('.km-shell-location-swipe-action').length || 1;
      const maxDistance = actionCount * actionWidth;
      const dx = Math.max(-maxDistance, Math.min(0, rawX));
      const distance = Math.abs(dx);
      const editThreshold = 48;
      const lifecycleThreshold = actionWidth + 44;
      gesture.peakLeft = Math.max(gesture.peakLeft, distance);
      const editArmed = gesture.peakLeft >= editThreshold && distance >= 36;
      const lifecycleArmed = gesture.peakLeft >= lifecycleThreshold && distance >= lifecycleThreshold - 18;
      gesture.maxDistance = maxDistance;
      gesture.dx = dx;
      gesture.surface.style.transition = 'none';
      gesture.surface.style.transform = `translateX(${dx}px)`;
      gesture.row.classList.toggle('swipe-edit-armed', editArmed && !lifecycleArmed);
      gesture.row.classList.toggle('delete-armed', lifecycleArmed && actionCount > 1);
    };

    root.onpointerup = event => {
      const gesture = locationSwipe;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      locationSwipe = null;
      if (gesture.cancelled || !gesture.horizontal) {
        resetLocationSwipeRow(gesture.row);
        return;
      }
      gesture.surface.dataset.suppressClick = '1';
      setTimeout(() => {
        if (gesture.surface) delete gesture.surface.dataset.suppressClick;
      }, 450);
      resetLocationSwipeRow(gesture.row);
    };

    root.onpointercancel = () => {
      if (locationSwipe) resetLocationSwipeRow(locationSwipe.row);
      locationSwipe = null;
    };
  }

  function renderLocations() {
    const root = $('#kmShellLocationsView');
    if (!root || section !== 'locations' || document.body.classList.contains('editor-view')) return;
    const snapshot = readData();
    const sortMode = locationSortMode(snapshot);
    const roots = orderedRoots(snapshot);
    root.innerHTML = `
      <div class="km-shell-location-actions"><button type="button" class="btn secondary" data-shell-current-location>Huidige locatie</button><button type="button" class="btn" data-shell-add-location>Nieuwe locatie</button></div>
      <div class="km-shell-location-sort" aria-label="Locaties sorteren"><button type="button" class="${sortMode === 'smart' ? 'active' : ''}" data-action="location-sort" data-mode="smart">◎ Logisch</button><button type="button" class="${sortMode === 'alpha' ? 'active' : ''}" data-action="location-sort" data-mode="alpha">A–Z Naam</button><button type="button" class="${sortMode === 'custom' ? 'active' : ''}" data-action="location-sort" data-mode="custom">☰ Eigen</button></div>
      ${roots.length ? `<div class="km-shell-location-tree">${roots.map(location => `<section class="km-shell-location-group" data-shell-location-group="${esc(location.id)}">${locationNodeHtml(location, 0, snapshot)}</section>`).join('')}</div>` : '<div class="km-shell-empty">Nog geen locaties opgeslagen.</div>'}`;
    bindLocationInteractions(root);
    if (sortMode === 'custom') bindLocationReordering($('.km-shell-location-tree', root), root);
  }

  function dispatchOriginalAction(action, extra = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    Object.entries(extra).forEach(([key, value]) => { button.dataset[key] = value; });
    button.className = 'km-shell-legacy';
    document.body.appendChild(button);
    button.click();
    button.remove();
  }

  function openLocationEditor(id = null, parentId = null, current = false) {
    pendingParentForNew = id ? null : parentId;
    ensureOriginalMode('kilometers');
    ensureKmView('ride');
    document.body.classList.remove('km-shell-locations-mode');
    $('#kmShellLocationsView').hidden = true;
    if (typeof window.openLocation === 'function') {
      Promise.resolve(window.openLocation(id, current, 'locations'))
        .then(queueLocationEditorAugment)
        .catch(error => console.error('Locatie-editor kon niet worden geopend.', error));
      return;
    }
    if (current) {
      dispatchOriginalAction('current-location', { returnSection: 'locations' });
    } else if (id) {
      const wrapper = document.createElement('div');
      wrapper.dataset.id = id;
      wrapper.className = 'km-shell-legacy';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = 'edit-location';
      button.dataset.returnSection = 'locations';
      wrapper.appendChild(button);
      document.body.appendChild(wrapper);
      button.click();
      wrapper.remove();
    } else {
      dispatchOriginalAction('add-location', { returnSection: 'locations' });
    }
    queueLocationEditorAugment();
  }

  function parentOptions(currentId, selectedParentId, snapshot) {
    const roots = snapshot.locations
      .filter(location => location.id !== currentId && !location.parentId)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'nl', { sensitivity: 'base' }));
    return `<option value="">Geen · hoofdlocatie</option>${roots.map(location => `<option value="${esc(location.id)}" ${location.id === selectedParentId ? 'selected' : ''}>${esc(location.name)}</option>`).join('')}`;
  }

  function augmentLocationEditor() {
    const form = $('#locationForm');
    if (!form || $('#kmShellLocationParentSection', form)) return;
    const snapshot = readData();
    const id = form.elements.id?.value || '';
    const stored = id ? locationById(id, snapshot) : null;
    const selectedParent = stored?.parentId || pendingParentForNew || '';
    const basisSection = form.querySelector('.edit-section');
    const sectionEl = document.createElement('section');
    sectionEl.id = 'kmShellLocationParentSection';
    sectionEl.className = 'edit-section km-shell-parent-section';
    sectionEl.innerHTML = `<div class="edit-section-head"><strong>Onder locatie</strong><small>Hoofdlocatie of sublocatie</small></div><div class="form-group"><label>Onder locatie</label><select id="kmShellParentId" name="parentId">${parentOptions(id, selectedParent, snapshot)}</select><div id="kmShellParentHint" class="km-shell-parent-hint"></div></div>`;
    if (basisSection?.nextSibling) form.insertBefore(sectionEl, basisSection.nextSibling);
    else form.prepend(sectionEl);

    const select = $('#kmShellParentId', form);
    const hint = $('#kmShellParentHint', form);
    const updateHint = () => {
      const parent = select.value ? locationById(select.value, readData()) : null;
      if (!hint) return;
      hint.textContent = parent
        ? `Sublocatie van ${parent.name}. Leeg adres of GPS kan in het locatieoverzicht van de hoofdlocatie worden overgenomen.`
        : 'Als hoofdlocatie kan deze plek zelf sublocaties bevatten.';
    };
    select?.addEventListener('change', updateHint);
    updateHint();
  }

  function queueLocationEditorAugment() {
    if (locationEditorAugmentQueued) return;
    locationEditorAugmentQueued = true;
    requestAnimationFrame(() => {
      locationEditorAugmentQueued = false;
      augmentLocationEditor();
    });
  }


  function generalBackupStatus() {
    const last = readData().settings.lastBackupAt;
    if (!last) return 'Nog geen complete back-up gemaakt.';
    const date = new Date(last);
    if (Number.isNaN(date.getTime())) return 'Laatste complete back-up is vastgelegd.';
    return 'Laatste complete back-up: ' + new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function teardownSettingsPanel() {
    settingsMountToken += 1;
    const content = $('#kmShellSettingsContent');
    if (timeSettingsMounted || content?.querySelector('#timeModuleRoot')) restoreTimeModule();
    if (kmSettingsMounted && content?.querySelector('#app')) restoreKmApp();
    activeSettingsTarget = null;
  }

  function generalSettingsAccordion(id, title, subtitle, body, target = '') {
    const targetAttribute = target ? ` data-settings-target="${target}"` : '';
    return `<details class="km-shell-settings-accordion" id="${id}"${targetAttribute}><summary><span class="km-shell-settings-accordion-title"><strong>${title}</strong><small>${subtitle}</small></span><span class="km-shell-settings-accordion-arrow">›</span></summary><div class="km-shell-settings-accordion-body">${body}</div></details>`;
  }

  function moduleRowIds(host) {
    return $$('.km-shell-module-row[data-module-id]', host).map(row => row.dataset.moduleId);
  }

  function moduleConfigurationFromHost(host) {
    const current = moduleConfiguration();
    const surface = host.dataset.moduleSurface === 'menu' ? 'menu' : 'bottom';
    const orderKey = surface === 'menu' ? 'menuOrder' : 'bottomOrder';
    const byId = new Map(current.map(item => [item.id, { ...item }]));
    moduleRowIds(host).forEach((id, order) => {
      const item = byId.get(id);
      if (item) item[orderKey] = order;
    });
    return current.map(item => byId.get(item.id) || item);
  }

  function bindModuleReordering(host) {
    if (!host || host.dataset.moduleReorderBound === '1') return;
    host.dataset.moduleReorderBound = '1';
    let drag = null;

    const restoreOrder = ids => {
      for (const id of ids) {
        const row = $$('.km-shell-module-row[data-module-id]', host).find(candidate => candidate.dataset.moduleId === id);
        if (row) host.appendChild(row);
      }
    };

    const removeDocumentListeners = () => {
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      document.removeEventListener('pointercancel', handlePointerCancel, true);
    };

    const finishDrag = commit => {
      if (!drag) return;
      const active = drag;
      drag = null;
      removeDocumentListeners();
      if (active.placeholder.parentNode === host) host.insertBefore(active.row, active.placeholder);
      else host.appendChild(active.row);
      active.placeholder.remove();
      active.row.classList.remove('is-dragging');
      active.row.setAttribute('aria-grabbed', 'false');
      if (active.originalStyle === null) active.row.removeAttribute('style');
      else active.row.setAttribute('style', active.originalStyle);
      host.classList.remove('is-reordering');

      if (!commit) {
        restoreOrder(active.initialOrder);
        focusModuleHandle(active.id);
        return;
      }
      const finalOrder = moduleRowIds(host);
      if (finalOrder.join('|') !== active.initialOrder.join('|')) {
        saveModuleConfiguration(moduleConfigurationFromHost(host), active.id);
      } else {
        focusModuleHandle(active.id);
      }
    };

    const updateDrag = (clientY, event) => {
      if (!drag) return;
      event.preventDefault();
      drag.row.style.top = Math.round(clientY - drag.offsetY) + 'px';
      const scroller = host.closest('.km-shell-settings-content');
      if (scroller) {
        const bounds = scroller.getBoundingClientRect();
        const edge = Math.min(72, bounds.height * .18);
        if (clientY < bounds.top + edge) scroller.scrollTop -= 14;
        else if (clientY > bounds.bottom - edge) scroller.scrollTop += 14;
      }
      const candidates = $$('.km-shell-module-row[data-module-id]', host);
      const before = candidates.find(row => {
        const rect = row.getBoundingClientRect();
        return clientY < rect.top + rect.height / 2;
      });
      if (before) host.insertBefore(drag.placeholder, before);
      else host.appendChild(drag.placeholder);
    };

    function handlePointerMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      updateDrag(event.clientY, event);
    }

    function handlePointerUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      finishDrag(true);
    }

    function handlePointerCancel(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      finishDrag(false);
    }

    host.addEventListener('pointerdown', event => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const handle = target?.closest('[data-module-drag-handle]');
      if (!handle || event.button !== 0 || event.isPrimary === false || drag) return;
      const row = handle.closest('.km-shell-module-row[data-module-id]');
      if (!row) return;
      event.preventDefault();
      event.stopPropagation();

      const rect = row.getBoundingClientRect();
      const placeholder = document.createElement('div');
      placeholder.className = 'km-shell-module-placeholder';
      placeholder.style.height = Math.round(rect.height) + 'px';
      placeholder.setAttribute('aria-hidden', 'true');
      host.insertBefore(placeholder, row.nextElementSibling);

      drag = {
        pointerId: event.pointerId,
        id: row.dataset.moduleId,
        row,
        handle,
        placeholder,
        initialOrder: moduleRowIds(host),
        offsetY: event.clientY - rect.top,
        originalStyle: row.getAttribute('style')
      };

      row.classList.add('is-dragging');
      row.setAttribute('aria-grabbed', 'true');
      Object.assign(row.style, {
        position: 'fixed',
        left: Math.round(rect.left) + 'px',
        top: Math.round(rect.top) + 'px',
        width: Math.round(rect.width) + 'px',
        height: Math.round(rect.height) + 'px',
        margin: '0',
        zIndex: '140',
        pointerEvents: 'none',
        transition: 'none',
        boxSizing: 'border-box'
      });
      host.classList.add('is-reordering');
      document.body.appendChild(row);

      document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false });
      document.addEventListener('pointerup', handlePointerUp, { capture: true, passive: false });
      document.addEventListener('pointercancel', handlePointerCancel, { capture: true, passive: true });
    });

    host.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const handle = target?.closest('[data-module-drag-handle]');
      const row = handle?.closest('.km-shell-module-row[data-module-id]');
      if (!row) return;
      const neighbor = event.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
      if (!neighbor?.matches('.km-shell-module-row[data-module-id]')) return;
      event.preventDefault();
      if (event.key === 'ArrowUp') host.insertBefore(row, neighbor);
      else host.insertBefore(row, neighbor.nextElementSibling);
      saveModuleConfiguration(moduleConfigurationFromHost(host), row.dataset.moduleId);
    });
  }

  function renderModuleSettings() {
    const host = $('#kmShellModuleSettings');
    if (!host) return;
    const config = moduleConfiguration();
    const orderList = surface => config
      .slice()
      .sort((a, b) => a[surface === 'bottom' ? 'bottomOrder' : 'menuOrder'] - b[surface === 'bottom' ? 'bottomOrder' : 'menuOrder'])
      .map(item => {
        const module = moduleById(item.id);
        const label = module?.label || item.id;
        const active = moduleSurfaceEnabled(item, surface);
        const surfaceLabel = surface === 'bottom' ? 'onderbalk' : 'zijmenu';
        return `<div class="km-shell-module-row${active ? '' : ' is-off'}" data-module-id="${esc(item.id)}" aria-grabbed="false"><button class="km-shell-module-handle" type="button" data-module-drag-handle aria-label="${esc(label)} verslepen" title="Sleep om te verplaatsen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg></button><div class="km-shell-module-copy"><strong>${esc(label)}</strong><small>${surface === 'bottom' ? 'Onderbalk' : 'Zijmenu'}${module?.placeholder ? ' · in voorbereiding' : ''}</small></div><label class="km-shell-module-toggle"><input type="checkbox" data-module-surface-toggle="${esc(item.id)}" data-surface="${surface}" aria-label="${esc(label)} in ${surfaceLabel} tonen" ${active ? 'checked' : ''}><span aria-hidden="true"></span></label></div>`;
      }).join('');
    const showBottomBar = bottomBarEnabled();
    host.innerHTML = `<div class="km-shell-module-order-group" data-module-surface="bottom"><div class="km-shell-module-order-head"><div class="km-shell-module-order-copy"><strong>Volgorde onderbalk</strong><small>${showBottomBar ? 'Sleep een onderdeel aan de streepjes.' : 'Onderbalk verborgen; de keuzes blijven bewaard.'}</small></div><label class="km-shell-module-toggle"><input type="checkbox" data-bottom-bar-toggle aria-label="Onderbalk tonen" ${showBottomBar ? 'checked' : ''}><span aria-hidden="true"></span></label></div><div class="km-shell-module-order-list" data-module-surface="bottom">${orderList('bottom')}</div></div><div class="km-shell-module-order-group" data-module-surface="menu"><div class="km-shell-module-order-head"><div class="km-shell-module-order-copy"><strong>Volgorde menu</strong><small>Sleep aan de streepjes; deze volgorde staat los van de onderbalk.</small></div></div><div class="km-shell-module-order-list" data-module-surface="menu">${orderList('menu')}</div></div><small class="km-shell-module-help">Minimaal één onderdeel blijft bereikbaar via de ingeschakelde onderbalk of het zijmenu.</small>`;
    $$('.km-shell-module-order-list', host).forEach(bindModuleReordering);
  }

  function renderGeneralSettings() {
    const content = $('#kmShellSettingsContent');
    if (!content) return false;
    teardownSettingsPanel();
    content.dataset.mode = 'general';
    content.scrollTop = 0;
    const title = $('#kmShellSettingsTitle');
    if (title) title.textContent = 'Instellingen';
    content.innerHTML = `
      <section class="km-shell-general-settings">
        <div class="km-shell-general-intro"><p>Alle instellingen van Log staan hier bij elkaar. De onderdelen zijn gegroepeerd op wat je wilt aanpassen.</p></div>
        <section class="km-shell-settings-group" aria-labelledby="kmShellRegistrationSettingsTitle">
          <header class="km-shell-settings-group-head"><h2 id="kmShellRegistrationSettingsTitle">Registratie</h2><p>Instellingen voor de gegevens die je in Log vastlegt.</p></header>
          ${generalSettingsAccordion('kmShellRideSettings', 'Ritten', 'Voertuig, herkenning, navigatie en bediening', '<div class="km-shell-settings-panel-host"></div>', 'rides')}
          ${generalSettingsAccordion('kmShellTimeSettings', 'Tijd en taken', 'Afronding, collega’s en tussenstops', '<div class="km-shell-settings-panel-host"></div>', 'time')}
          ${generalSettingsAccordion('kmShellLocationSettings', 'Locaties', 'Herkenning en verwijderen', '<div class="km-shell-settings-panel-host"></div>', 'locations')}
        </section>
        <section class="km-shell-settings-group" aria-labelledby="kmShellAppSettingsTitle">
          <header class="km-shell-settings-group-head"><h2 id="kmShellAppSettingsTitle">App</h2><p>Bepaal per onderdeel waar het staat en in welke volgorde.</p></header>
          ${generalSettingsAccordion('kmShellModuleSettingsAccordion', 'Onderdelen en volgorde', 'Zet onderbalk en menu per onderdeel aan of uit', '<div id="kmShellModuleSettings" class="km-shell-module-settings"></div>')}
        </section>
        <section class="km-shell-settings-group" aria-labelledby="kmShellDataSettingsTitle">
          <header class="km-shell-settings-group-head"><h2 id="kmShellDataSettingsTitle">Gegevens</h2><p>Back-up en herstel gelden voor de volledige Log-app.</p></header>
          ${generalSettingsAccordion('kmShellDataSettings', 'Back-up en herstel', 'Alle ritten, tijdregistraties, taken en instellingen', `
            <div class="km-shell-general-status" id="kmShellBackupStatus">${esc(generalBackupStatus())}</div>
            <div class="km-shell-general-actions">
              <button type="button" class="btn" data-general-action="backup-export">Complete back-up maken</button>
              <label class="btn" style="text-align:center">Back-up herstellen<input id="kmShellBackupImport" type="file" accept="application/json,.json" hidden></label>
            </div>
            <details class="km-shell-general-advanced">
              <summary>Geavanceerd gegevensbeheer</summary>
              <div class="km-shell-general-actions">
                <label class="btn secondary" style="text-align:center">Kilometergegevens toevoegen<input id="kmShellMergeImport" type="file" accept="application/json,.json" hidden></label>
                <button type="button" class="btn secondary" data-general-action="id-converter">ID-converter</button>
              </div>
            </details>`)}
        </section>
      </section>`;

    renderModuleSettings();
    content.querySelector('#kmShellModuleSettings')?.addEventListener('change', event => {
      const toggle = event.target instanceof HTMLInputElement ? event.target : null;
      if (!toggle) return;
      const config = moduleConfiguration();
      if (toggle.matches('[data-bottom-bar-toggle]')) {
        const showBottomBar = toggle.checked;
        if (!hasReachableModule(config, showBottomBar)) {
          toggle.checked = true;
          return;
        }
        saveModuleConfiguration(config, 'bottom-bar', 'global-bottom', showBottomBar);
        return;
      }
      if (!toggle.matches('[data-module-surface-toggle]')) return;
      const item = config.find(entry => entry.id === toggle.dataset.moduleSurfaceToggle);
      if (!item) return;
      const previous = item.placement;
      let bottomOn = moduleSurfaceEnabled(item, 'bottom');
      let menuOn = moduleSurfaceEnabled(item, 'menu');
      if (toggle.dataset.surface === 'bottom') bottomOn = toggle.checked;
      else menuOn = toggle.checked;
      item.placement = placementForSurfaces(bottomOn, menuOn);
      const showBottomBar = bottomBarEnabled();
      if (!hasReachableModule(config, showBottomBar)) {
        item.placement = previous;
        toggle.checked = !toggle.checked;
        return;
      }
      saveModuleConfiguration(config, item.id, toggle.dataset.surface, showBottomBar);
    });
    content.querySelector('[data-general-action="backup-export"]')?.addEventListener('click', () => {
      const status = $('#kmShellBackupStatus');
      if (status) status.textContent = 'Back-up wordt voorbereid…';
      window.dispatchEvent(new CustomEvent('log-general-backup-export'));
    });
    content.querySelector('#kmShellBackupImport')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) window.dispatchEvent(new CustomEvent('log-general-backup-import', { detail: { file } }));
    });
    content.querySelector('#kmShellMergeImport')?.addEventListener('change', event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) window.dispatchEvent(new CustomEvent('log-general-merge-import', { detail: { file } }));
    });
    content.querySelector('[data-general-action="id-converter"]')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('log-general-id-converter'));
    });

    const accordions = [...content.querySelectorAll('.km-shell-settings-accordion')];
    accordions.forEach(detail => detail.addEventListener('toggle', () => {
      if (!detail.open) {
        if (detail.dataset.settingsTarget && activeSettingsTarget === detail.dataset.settingsTarget) teardownSettingsPanel();
        return;
      }
      accordions.forEach(other => {
        if (other !== detail && other.open) other.open = false;
      });
      if (!detail.dataset.settingsTarget) {
        teardownSettingsPanel();
        return;
      }
      const host = detail.querySelector('.km-shell-settings-panel-host');
      openAccordionSettings(detail.dataset.settingsTarget, host);
      requestAnimationFrame(() => detail.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest'
      }));
    }));
    return true;
  }

  function setSettingsPanelStatus(host, message, state = 'loading', retry = null) {
    if (!host) return null;
    let status = [...host.children].find(child => child.classList?.contains('km-shell-settings-panel-status'));
    if (!status) {
      status = document.createElement('div');
      status.className = 'km-shell-settings-panel-status';
      status.setAttribute('role', 'status');
      host.prepend(status);
    }
    status.dataset.state = state;
    status.replaceChildren();
    const copy = document.createElement('span');
    copy.textContent = message;
    status.appendChild(copy);
    if (typeof retry === 'function') {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Opnieuw proberen';
      button.addEventListener('click', retry);
      status.appendChild(button);
    }
    return status;
  }

  function openAccordionSettings(target, host) {
    if (!ROOT_SECTIONS.has(target) || !host) return;
    teardownSettingsPanel();
    const token = ++settingsMountToken;
    activeSettingsTarget = target;
    host.dataset.settingsTarget = target;
    host.setAttribute('aria-busy', 'true');
    host.innerHTML = '';
    if (target === 'time') setSettingsPanelStatus(host, 'Tijdinstellingen laden…');
    const mounted = target === 'time' ? mountTimeSettings(host, token) : mountKmSettings(host, target);
    if (!mounted) {
      activeSettingsTarget = null;
      host.removeAttribute('aria-busy');
      setSettingsPanelStatus(host, 'Instellingen konden niet worden geladen.', 'error', () => openAccordionSettings(target, host));
      return;
    }
    requestAnimationFrame(() => {
      if (token !== settingsMountToken) return;
      host.classList.remove('km-settings-panel-in');
      void host.offsetWidth;
      host.classList.add('km-settings-panel-in');
    });
  }

  function mountKmSettings(host, target) {
    ensureOriginalMode('kilometers');
    const app = $('#app');
    const topAction = $('#topAction');
    if (!host || !app || !topAction) return false;

    kmAppPlaceholder = document.createComment('km-app-placeholder');
    app.parentNode?.insertBefore(kmAppPlaceholder, app);
    if (!ensureKmView('settings')) {
      kmAppPlaceholder.remove();
      kmAppPlaceholder = null;
      return false;
    }
    host.appendChild(app);
    app.hidden = false;
    kmSettingsMounted = true;
    if (!filterKmSettings(target)) {
      restoreKmApp();
      return false;
    }
    host.querySelector('.km-shell-settings-panel-status')?.remove();
    host.removeAttribute('aria-busy');
    return true;
  }

  function bindExclusiveAccordions(root, selector) {
    const details = [...root.querySelectorAll(selector)];
    for (const detail of details) {
      if (detail.dataset.logExclusiveBound === '1') continue;
      detail.dataset.logExclusiveBound = '1';
      detail.addEventListener('toggle', () => {
        if (!detail.open) return;
        details.forEach(other => {
          if (other !== detail && other.open) other.open = false;
        });
      });
    }
  }

  function filterKmSettings(target) {
    const app = $('#kmShellSettingsContent #app');
    const form = app?.querySelector('#settingsForm');
    if (!app || !form) return false;
    app.dataset.shellSettingsScope = target;
    app.querySelector('.section-title')?.setAttribute('hidden', '');
    app.querySelector('.settings-autosave')?.setAttribute('hidden', '');

    const details = [...app.querySelectorAll('details.accordion')];
    let visibleDetails = 0;
    let firstVisible = null;
    for (const detail of details) {
      const label = detail.querySelector('summary strong')?.textContent?.trim() || '';
      const visible = target === 'locations' ? label === 'Locaties' : label !== 'Locaties';
      detail.hidden = !visible;
      detail.style.display = visible ? '' : 'none';
      const singleLocationPanel = target === 'locations' && label === 'Locaties';
      detail.classList.toggle('km-shell-settings-single', singleLocationPanel);
      const summary = detail.querySelector('summary');
      if (summary) summary.hidden = singleLocationPanel;
      detail.open = false;
      if (visible) {
        visibleDetails += 1;
        firstVisible ||= detail;
      }
    }
    bindExclusiveAccordions(form, 'details.accordion:not([hidden])');
    if (firstVisible) firstVisible.open = true;
    return visibleDetails > 0;
  }

  function mountTimeSettings(host, token) {
    const root = $('#timeModuleRoot');
    const time = window.LogTimeModule;
    if (!host || !root || !time?.showSettings || token !== settingsMountToken) return false;
    timeModulePlaceholder = document.createComment('time-module-placeholder');
    root.parentNode?.insertBefore(timeModulePlaceholder, root);
    host.appendChild(root);
    root.hidden = false;
    timeSettingsMounted = true;
    time.showSettings({ scroll: false });
    const page = root.querySelector('.settings-page');
    if (!page) {
      restoreTimeModule();
      return false;
    }
    bindExclusiveAccordions(page, '.settings-accordion');
    const first = page.querySelector('.settings-accordion');
    if (first && !page.querySelector('.settings-accordion[open]')) first.open = true;
    host.querySelector('.km-shell-settings-panel-status')?.remove();
    host.removeAttribute('aria-busy');
    return true;
  }

  function openSettingsSheet(target = '') {
    const settings = $('#kmShellSettings');
    if (!settings || settings.classList.contains('open')) return;
    if (!renderGeneralSettings()) return;
    settings.classList.add('open');
    document.body.classList.add('km-shell-settings-open');
    document.body.style.overflow = 'hidden';
    if (target) requestAnimationFrame(() => {
      const detail = $(`.km-shell-settings-accordion[data-settings-target="${CSS.escape(target)}"]`, settings);
      if (detail) detail.open = true;
    });
  }

  function restoreKmApp() {
    if (!kmSettingsMounted) return;
    const app = $('#kmShellSettingsContent #app');
    if (app && kmAppPlaceholder?.parentNode) {
      kmAppPlaceholder.parentNode.insertBefore(app, kmAppPlaceholder);
      kmAppPlaceholder.remove();
    } else if (app) {
      const shell = $('.shell');
      const timeRoot = $('#timeModuleRoot');
      if (shell) shell.insertBefore(app, timeRoot || null);
    }
    app?.removeAttribute('data-shell-settings-scope');
    kmAppPlaceholder = null;
    kmSettingsMounted = false;
    ensureKmView('ride');
  }

  function restoreTimeModule() {
    if (!timeSettingsMounted) return;
    const root = $('#timeModuleRoot');
    if (root && timeModulePlaceholder?.parentNode) {
      timeModulePlaceholder.parentNode.insertBefore(root, timeModulePlaceholder);
      timeModulePlaceholder.remove();
    } else if (root) {
      $('.shell')?.appendChild(root);
    }
    timeModulePlaceholder = null;
    timeSettingsMounted = false;
    window.LogTimeModule?.showHome?.({ scroll: false });
    if (root) root.hidden = section !== 'time';
  }

  function closeSettingsSheet() {
    const settings = $('#kmShellSettings');
    if (!settings?.classList.contains('open')) return;
    teardownSettingsPanel();
    settings.classList.remove('open');
    document.body.classList.remove('km-shell-settings-open');
    document.body.style.overflow = '';
    // Het zijpaneel blijft bewust halfopen staan achter de sheet.
    drawerOpen = true;
    drawerPeek = true;
    document.body.classList.add('km-shell-drawer-peek');
    document.body.classList.remove('km-shell-drawer-open');
    $('#kmShellMenuButton')?.setAttribute('aria-expanded', 'true');
    $('#kmShellDrawer')?.classList.add('open');
    $('#kmShellBackdrop')?.classList.add('open');
    localStorage.setItem(DRAWER_KEY, '1');
    showSection();
  }

  function scrollActiveSectionToTop() {
    document.body.classList.remove('km-shell-search-revealed');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function bindGlobalEvents() {
    window.addEventListener('kmreg-test-shell-select-section', event => selectSection(event.detail?.section));
    window.addEventListener('kmreg-test-shell-open-settings', event => openSettingsSheet(event.detail?.target || ''));
    window.addEventListener('log-time-state-change', () => {
      if (section === 'themes') refreshThemesFromStorage();
      syncChrome();
      applyShellSearch();
    });
    let timeRenderQueued = false;
    window.addEventListener('log-time-rendered', () => {
      if (section !== 'time' || timeRenderQueued) return;
      timeRenderQueued = true;
      requestAnimationFrame(() => {
        timeRenderQueued = false;
        syncChrome();
        applyShellSearch();
      });
    });
    window.addEventListener('log-backup-updated', () => {
      const content = $('#kmShellSettingsContent');
      if (content?.dataset.mode === 'general') renderGeneralSettings();
    });
    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;
      const edit = target.closest('[data-shell-edit-location]');
      if (edit) {
        event.preventDefault();
        event.stopPropagation();
        openLocationEditor(edit.dataset.shellEditLocation);
        return;
      }
      const add = target.closest('[data-shell-add-location]');
      if (add) {
        event.preventDefault();
        openLocationEditor(null, null, false);
        return;
      }
      const current = target.closest('[data-shell-current-location]');
      if (current) {
        event.preventDefault();
        openLocationEditor(null, null, true);
        return;
      }
      const child = target.closest('[data-shell-add-child]');
      if (child) {
        event.preventDefault();
        event.stopPropagation();
        openLocationEditor(null, child.dataset.shellAddChild, false);
        return;
      }
      const toggle = target.closest('[data-shell-location-toggle]');
      if (toggle && !target.closest('button')) {
        expandedLocationId = expandedLocationId === toggle.dataset.shellLocationToggle ? null : toggle.dataset.shellLocationToggle;
        renderLocations();
        return;
      }
      if (target.closest('[data-action="location-sort"]') && section === 'locations') setTimeout(renderLocations, 0);
    }, false);

    let observerQueued = false;
    const observer = new MutationObserver(mutations => {
      const searchClasses = new Set(['km-shell-searching', 'km-shell-search-open', 'km-shell-search-revealed']);
      const relevant = mutations.some(mutation => {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
        if (target?.closest?.('#kmShellSearch,#kmShellSearchStatus')) return false;
        if (target?.closest?.('#timeModuleRoot')) return false;
        if (mutation.type === 'attributes' && mutation.target === document.body && mutation.attributeName === 'class') {
          const before = new Set(String(mutation.oldValue || '').split(/\s+/).filter(Boolean));
          const after = new Set(document.body.className.split(/\s+/).filter(Boolean));
          const changed = [...new Set([...before, ...after])].filter(name => before.has(name) !== after.has(name));
          if (changed.length && changed.every(name => searchClasses.has(name))) return false;
        }
        return true;
      });
      if (!relevant || observerQueued) return;
      observerQueued = true;
      requestAnimationFrame(() => {
        observerQueued = false;
        if ($('#locationForm')) queueLocationEditorAugment();
        filterTripLocationSelects();
        const editor = document.body.classList.contains('editor-view');
        const editorClosed = lastEditorState && !editor;
        lastEditorState = editor;
        if (editorClosed && section === 'locations' && !$('#kmShellSettings')?.classList.contains('open')) {
          document.body.classList.add('km-shell-locations-mode');
          renderLocations();
        }
        syncChrome();
        applyShellSearch();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });

    window.addEventListener(KM_STATE_EVENT, event => {
      if (!event.detail?.key || event.detail.key === DATA_KEY) refreshKmState(event.detail);
    });
    window.addEventListener('storage', event => {
      if (event.key === DATA_KEY) {
        refreshKmState();
      } else if (event.key === 'urenregistratie.test.pwa.v1') {
        if (section === 'themes') refreshThemesFromStorage();
        syncChrome();
      }
    });
    const refreshOnResume = () => {
      if (!document.hidden) refreshShellUI();
    };
    window.addEventListener('pageshow', refreshOnResume);
    document.addEventListener('visibilitychange', refreshOnResume);
  }

  function init() {
    injectStyles();
    migrateThemesNavigation();
    installChrome();
    installShellElements();
    const visibleModules = enabledModules();
    if (!visibleModules.some(module => module.id === section)) section = visibleModules[0]?.id || 'rides';
    const searchStatus = document.createElement('div');
    searchStatus.id = 'kmShellSearchStatus';
    searchStatus.className = 'km-shell-search-status';
    searchStatus.hidden = true;
    $('#kmShellSearch')?.insertAdjacentElement('afterend', searchStatus);
    bindGlobalEvents();
    bindHeaderCollapse();
    refreshShellUI();
    refreshMenuDocument();
    filterTripLocationSelects();
    // Na sluiten van Instellingen moet het paneel zichtbaar blijven; normale herlaad start rustig gesloten.
    closeDrawer();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
