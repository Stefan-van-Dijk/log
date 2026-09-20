(function () {
  'use strict';

  const BUILD = '0.31.10-test.63';
  const SHELL_VERSION = (() => {
    try {
      const script = document.currentScript || [...document.scripts].find(item => item.src.includes('shell-ui.js'));
      return new URL(script?.src || location.href).searchParams.get('v') || BUILD;
    } catch (_) {
      return BUILD;
    }
  })();
  const DATA_KEY = 'kmreg-test-v4-data';
  const MODE_KEY = 'kmreg-test-active-app-v1';
  const SECTION_KEY = 'kmreg-test-shell-section-v1';
  const DRAWER_KEY = 'kmreg-test-shell-drawer-v1';
  const MENU_DOCUMENT_URL = './config/modules.json';
  const MENU_DOCUMENT_CACHE_KEY = 'log-menu-document-v1';
  const MENU_SCHEMA_VERSION = 1;
  const FALLBACK_MENU_DOCUMENT = {
    schemaVersion: MENU_SCHEMA_VERSION,
    modules: [
      { id: 'rides', label: 'Ritten', shortLabel: 'Ritten', subtitle: 'Ritten registreren en terugvinden', icon: 'rides', available: true, defaultEnabled: true, order: 10, view: 'rides', settingsTarget: 'rides' },
      { id: 'time', label: 'Tijd en taken', shortLabel: 'Tijd/taken', subtitle: 'Tijd en werkzaamheden registreren', icon: 'time', available: true, defaultEnabled: true, order: 20, view: 'time', settingsTarget: 'time' },
      { id: 'locations', label: 'Locaties', shortLabel: 'Locaties', subtitle: 'Adressen en herkenning beheren', icon: 'locations', available: true, defaultEnabled: true, order: 30, view: 'locations', settingsTarget: 'locations' },
      { id: 'themes', label: 'Thema’s', shortLabel: 'Thema’s', subtitle: 'Thema’s en categorieën beheren', icon: 'themes', available: true, defaultEnabled: false, order: 40, view: 'placeholder', settingsTarget: null },
      { id: 'barcodes', label: 'Barcodekaarten', shortLabel: 'Kaarten', subtitle: 'Barcodekaarten scannen en beheren', icon: 'barcodes', available: true, defaultEnabled: false, order: 50, view: 'placeholder', settingsTarget: null }
    ]
  };
  const ROOT_SECTIONS = new Set();
  let MODULE_CATALOG = [];

  function normalizeMenuDocument(value) {
    if (!value || value.schemaVersion !== MENU_SCHEMA_VERSION || !Array.isArray(value.modules)) return null;
    const icons = new Set(['rides', 'time', 'locations', 'themes', 'barcodes']);
    const views = new Set(['rides', 'time', 'locations', 'placeholder']);
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
        enabled: source.defaultEnabled !== false,
        order: Number.isFinite(Number(source.order)) ? Number(source.order) : modules.length * 10,
        view,
        settingsTarget: settingsTargets.has(source.settingsTarget) ? source.settingsTarget : null,
        placeholder: view === 'placeholder'
      });
    }
    return modules.length ? modules.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'nl')) : null;
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
  let expandedLocationId = null;
  let locationSwipe = null;
  let pendingParentForNew = null;
  let pendingParentSave = null;
  let pendingHierarchyReload = false;
  let kmSettingsMounted = false;
  let timeSettingsMounted = false;
  let kmAppPlaceholder = null;
  let timeModulePlaceholder = null;
  let lastEditorState = document.body.classList.contains('editor-view');
  let locationEditorAugmentQueued = false;
  let activeSettingsTarget = null;
  let settingsMountToken = 0;
  let sectionTransitioning = false;
  const windowScrollState = { top: Math.max(0, window.scrollY || 0), reverse: 0 };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

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

  function moduleById(id) {
    return MODULE_CATALOG.find(module => module.id === id) || null;
  }

  function moduleConfiguration(snapshot = readData()) {
    const saved = Array.isArray(snapshot.settings?.navigationModules) ? snapshot.settings.navigationModules : [];
    const savedById = new Map(saved.filter(item => item && ROOT_SECTIONS.has(item.id)).map(item => [item.id, item]));
    const orderedIds = saved.map(item => item?.id).filter(id => ROOT_SECTIONS.has(id));
    MODULE_CATALOG.forEach(module => {
      if (!orderedIds.includes(module.id)) orderedIds.push(module.id);
    });
    const config = orderedIds.map((id, order) => {
      const module = moduleById(id);
      const stored = savedById.get(id);
      return { id, enabled: stored ? stored.enabled !== false : module.enabled, order };
    });
    if (!config.some(item => item.enabled) && config[0]) config[0].enabled = true;
    return config;
  }

  function enabledModules(snapshot = readData()) {
    return moduleConfiguration(snapshot).filter(item => item.enabled).map(item => moduleById(item.id)).filter(Boolean);
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

  function focusModuleHandle(id) {
    if (!id) return;
    requestAnimationFrame(() => {
      const host = $('#kmShellModuleSettings');
      const row = host ? $$('.km-shell-module-row[data-module-id]', host)
        .find(candidate => candidate.dataset.moduleId === id) : null;
      row?.querySelector('[data-module-drag-handle]')?.focus({ preventScroll: true });
    });
  }

  function saveModuleConfiguration(config, focusId = '') {
    const normalized = config.map((item, order) => ({ id: item.id, enabled: item.enabled !== false, order }));
    let raw = {};
    try { raw = JSON.parse(localStorage.getItem(DATA_KEY) || '{}'); } catch (_) {}
    if (!raw || typeof raw !== 'object') raw = {};
    if (!raw.settings || typeof raw.settings !== 'object') raw.settings = {};
    raw.settings.navigationModules = normalized;
    localStorage.setItem(DATA_KEY, JSON.stringify(raw));
    window.dispatchEvent(new CustomEvent('log-navigation-modules-change', { detail: { modules: normalized } }));
    refreshShellUI();
    focusModuleHandle(focusId);
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

  function renderNavigation() {
    const modules = enabledModules();
    const nav = $('#kmShellDrawerNav');
    if (nav) {
      nav.innerHTML = modules.map(module => `<button class="km-shell-nav-button" type="button" data-shell-section="${module.id}"><span class="icon">${moduleIcon(module.id)}</span><span>${esc(module.label)}</span></button>`).join('');
    }
    const tabbar = $('#kmShellTabBar');
    if (tabbar) {
      const hasMore = modules.length > 5;
      const primary = hasMore ? modules.slice(0, 4) : modules;
      const moreButton = hasMore
        ? '<button class="km-shell-tab-button km-shell-tab-more" type="button" data-shell-more aria-label="Meer onderdelen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg><span>Meer</span></button>'
        : '';
      tabbar.style.setProperty('--km-tab-count', String(Math.max(1, primary.length + (hasMore ? 1 : 0))));
      tabbar.innerHTML = primary.map(module => `<button class="km-shell-tab-button" type="button" data-shell-tab="${module.id}" aria-label="${esc(module.label)}">${moduleIcon(module.id)}<span>${esc(module.shortLabel)}</span></button>`).join('') + moreButton;
      tabbar.hidden = modules.length === 0;
    }
    syncDrawerSelection();
  }

  function locationById(id, snapshot = readData()) {
    return snapshot.locations.find(location => location.id === id) || null;
  }

  function typeLabel(type) {
    return ({ home: 'Thuis', work: 'Werk', business: 'Zakelijk', private: 'Privé', other: 'Overig' })[type] || 'Overig';
  }

  function locationGlyph(type) {
    return ({ home: '⌂', work: '▣', business: '▦', private: '●', other: '⌖' })[type] || '⌖';
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
      .km-shell-top-copy{text-align:center;overflow:hidden}.km-shell-top-copy .eyebrow{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.km-shell-title{margin-top:3px;font-size:20px;font-weight:850;letter-spacing:-.025em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.km-shell-meta{margin-top:3px;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .km-shell-legacy{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important}
      .km-shell-backdrop{position:fixed;z-index:95;inset:0;background:rgba(0,0,0,.42);opacity:0;pointer-events:none;transition:opacity .22s ease}
      .km-shell-backdrop.open{opacity:1;pointer-events:auto}
      .km-shell-drawer{position:fixed;z-index:100;inset:0 auto 0 0;width:min(82vw,330px);display:flex;flex-direction:column;padding:calc(18px + env(safe-area-inset-top)) 14px calc(12px + env(safe-area-inset-bottom));border-right:1px solid var(--line);background:rgba(17,21,26,.97);box-shadow:18px 0 52px rgba(0,0,0,.34);transform:translateX(-102%);transition:transform .24s cubic-bezier(.2,.8,.2,1);-webkit-backdrop-filter:blur(26px) saturate(165%);backdrop-filter:blur(26px) saturate(165%)}
      .km-shell-drawer.open{transform:translateX(0)}
      .km-shell-drawer-head{padding:4px 8px 17px}.km-shell-drawer-head strong{display:block;font-size:19px;letter-spacing:-.02em}.km-shell-drawer-head small{display:block;margin-top:4px;color:var(--muted);font-size:11px}
      .km-shell-nav{display:grid;gap:4px}.km-shell-nav-button{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:9px 11px;border:0;border-radius:12px;background:transparent;color:var(--text);font-weight:760;text-align:left;cursor:pointer}.km-shell-nav-button .icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid var(--line);border-radius:9px;color:var(--muted);font-size:15px}.km-shell-nav-button.active{background:var(--card2)}.km-shell-nav-button.active .icon{border-color:rgba(77,163,255,.45);color:var(--accent);background:rgba(77,163,255,.09)}
      .km-shell-drawer-spacer{flex:1}.km-shell-drawer-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 4px 2px;border-top:1px solid var(--line)}.km-shell-version{display:inline-flex!important;align-items:center;gap:7px;flex:0 0 auto;min-width:0;padding:6px 9px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line));border-radius:10px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--text)!important;font-size:11px;font-weight:750;line-height:1;white-space:nowrap;visibility:visible!important;opacity:1!important}.km-shell-version-label{color:var(--accent);font-size:9px;font-weight:850;letter-spacing:.08em}.km-shell-version-number{overflow:hidden;text-overflow:ellipsis}.km-shell-settings-button{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;border:0;border-radius:14px;background:transparent;color:var(--text);font-size:23px;cursor:pointer}.km-shell-settings-button:active{background:var(--card2)}
      .km-shell-tabbar{--km-tab-count:3;position:fixed;z-index:80;left:50%;bottom:calc(9px + env(safe-area-inset-bottom));width:min(520px,calc(100vw - 20px));height:74px;display:grid;grid-template-columns:repeat(var(--km-tab-count),minmax(0,1fr));gap:5px;padding:6px;border:1px solid color-mix(in srgb,#fff 62%,var(--line));border-radius:29px;background:color-mix(in srgb,var(--card) 58%,transparent);box-shadow:0 14px 42px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.72),inset 0 -1px 0 color-mix(in srgb,var(--line) 75%,transparent);-webkit-backdrop-filter:blur(34px) saturate(210%);backdrop-filter:blur(34px) saturate(210%);transform:translateX(-50%);transition:opacity .2s ease,transform .28s cubic-bezier(.22,1,.36,1);isolation:isolate;overflow:hidden}
      .km-shell-tabbar::before{content:"";position:absolute;z-index:0;inset:0;background:linear-gradient(145deg,rgba(255,255,255,.34),transparent 44%,color-mix(in srgb,var(--accent) 9%,transparent));pointer-events:none}
      .km-shell-tab-button{position:relative;z-index:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:5px 3px;border:1px solid transparent;border-radius:22px;background:transparent;color:color-mix(in srgb,var(--text) 66%,var(--muted));font:inherit;font-size:10px;font-weight:760;line-height:1;letter-spacing:-.015em;cursor:pointer;touch-action:manipulation;transition:color .18s ease,background .24s cubic-bezier(.22,1,.36,1),border-color .2s ease,box-shadow .24s ease,transform .16s ease}
      .km-shell-tab-button svg,.km-shell-nav-button svg{width:23px;height:23px;display:block;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;transition:transform .24s cubic-bezier(.22,1,.36,1)}
      .km-shell-nav-button .icon svg{width:18px;height:18px}
      .km-shell-tab-button.active{border-color:color-mix(in srgb,var(--accent) 52%,transparent);background:color-mix(in srgb,var(--accent) 25%,var(--card));box-shadow:0 5px 16px color-mix(in srgb,var(--accent) 23%,transparent),inset 0 1px 0 rgba(255,255,255,.58);color:var(--accent)}
      .km-shell-tab-button.active::after{content:"";position:absolute;bottom:4px;width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}
      .km-shell-tab-button.active svg{transform:translateY(-2px) scale(1.08);stroke-width:2.25}
      .km-shell-tab-button:active{transform:scale(.94)}
      .km-shell-module-settings{display:grid;gap:8px}.km-shell-module-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:58px;padding:8px 10px;border:.5px solid var(--line);border-radius:14px;background:var(--card);transition:background .16s ease,box-shadow .16s ease,transform .16s ease}.km-shell-module-handle{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;border:0;border-radius:10px;background:transparent;color:var(--muted);touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}.km-shell-module-handle:active,.km-shell-module-row.is-dragging .km-shell-module-handle{cursor:grabbing;background:var(--card2);color:var(--accent)}.km-shell-module-handle svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}.km-shell-module-row.is-dragging{position:fixed;z-index:140;background:color-mix(in srgb,var(--accent) 12%,var(--card));box-shadow:0 16px 38px rgba(0,0,0,.28);transform:scale(1.015);pointer-events:none}.km-shell-module-placeholder{min-height:58px;border:1px dashed color-mix(in srgb,var(--accent) 55%,var(--line));border-radius:12px;background:color-mix(in srgb,var(--accent) 8%,transparent)}.km-shell-module-copy strong,.km-shell-module-copy small{display:block}.km-shell-module-copy strong{font-size:13px}.km-shell-module-copy small{margin-top:3px;color:var(--muted);font-size:10px}.km-shell-module-controls{display:flex;align-items:center;gap:5px}.km-shell-module-toggle{display:inline-flex;align-items:center;margin-left:3px}.km-shell-module-toggle input{width:38px;height:22px;accent-color:var(--accent)}
      .km-shell-placeholder{padding:4px 0 28px}.km-shell-placeholder-hero{padding:22px 18px;border:.5px solid color-mix(in srgb,var(--accent) 24%,var(--line));border-radius:20px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 12%,var(--card)),var(--card));box-shadow:0 10px 28px rgba(0,0,0,.08)}.km-shell-placeholder-hero svg{width:34px;height:34px;color:var(--accent);fill:none;stroke:currentColor;stroke-width:1.7}.km-shell-placeholder-hero h2{margin:14px 0 6px;font-size:25px}.km-shell-placeholder-hero p{margin:0;color:var(--muted);font-size:13px;line-height:1.5}.km-shell-placeholder-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.km-shell-placeholder-card{min-height:92px;padding:14px;border:.5px solid var(--line);border-radius:16px;background:var(--card)}.km-shell-placeholder-card strong,.km-shell-placeholder-card small{display:block}.km-shell-placeholder-card small{margin-top:6px;color:var(--muted);font-size:11px;line-height:1.4}.km-shell-placeholder-mode #app,.km-shell-placeholder-mode #timeModuleRoot,.km-shell-placeholder-mode .km-shell-locations{display:none!important}.km-shell-placeholder-mode .km-shell-search{display:none!important}
      body.km-shell-drawer-open .km-shell-tabbar,body.km-shell-settings-open .km-shell-tabbar,body.editor-view .km-shell-tabbar{opacity:0;transform:translate(-50%,18px) scale(.98);pointer-events:none}
      .shell{padding-bottom:calc(108px + env(safe-area-inset-bottom))!important}
      @keyframes kmTabPageIn{from{opacity:.72;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
      body.km-shell-tab-transition .shell{animation:kmTabPageIn .22s cubic-bezier(.22,1,.36,1) both}
      .km-shell-settings{position:fixed;z-index:120;inset:0;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.38);opacity:0;pointer-events:none;transition:opacity .22s ease}.km-shell-settings.open{opacity:1;pointer-events:auto}
      .km-shell-settings-surface{width:100%;height:min(94dvh,900px);display:flex;flex-direction:column;border-radius:24px 24px 0 0;border:1px solid var(--line);border-bottom:0;background:var(--bg);box-shadow:0 -18px 52px rgba(0,0,0,.34);transform:translateY(104%);transition:transform .46s cubic-bezier(.22,1,.36,1);overflow:hidden;will-change:transform}.km-shell-settings.open .km-shell-settings-surface{transform:translateY(0)}
      .km-shell-settings-head{position:relative;display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;flex:0 0 auto;padding:calc(10px + env(safe-area-inset-top)) 14px 10px;border-bottom:1px solid var(--line);background:rgba(13,17,23,.92);-webkit-backdrop-filter:blur(22px) saturate(165%);backdrop-filter:blur(22px) saturate(165%)}.km-shell-settings-title{text-align:center;font-size:16px;font-weight:850}.km-shell-settings-close{position:absolute;right:14px;top:calc(10px + env(safe-area-inset-top));display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:0;border-radius:50%;background:var(--card2);color:var(--text);font-size:25px;cursor:pointer}.km-shell-settings-content{position:relative;flex:1;min-height:0;overflow:auto;padding:8px 16px calc(24px + env(safe-area-inset-bottom))}.km-shell-settings-content #app,.km-shell-settings-content #timeModuleRoot{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important;width:100%;max-width:760px;margin:0 auto}body.time-mode #kmShellSettingsContent #app,body.km-shell-locations-mode #kmShellSettingsContent #app,body.km-shell-placeholder-mode #kmShellSettingsContent #app{display:block!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}
      .km-shell-settings-back{position:absolute;left:14px;top:calc(10px + env(safe-area-inset-top));display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border:0;border-radius:50%;background:transparent;color:var(--accent);font-size:22px;font-weight:800;cursor:pointer}.km-shell-settings-back[hidden]{display:none!important}.km-shell-settings-back:active{background:var(--card2)}
      .km-shell-general-settings{max-width:760px;margin:0 auto;padding:8px 0 24px}.km-shell-general-intro{padding:8px 1px 16px;border-bottom:1px solid var(--line)}.km-shell-general-intro h2{margin:3px 0 5px;font-size:28px;letter-spacing:-.035em}.km-shell-general-intro p{margin:0;color:var(--muted);font-size:12px;line-height:1.45}
      .km-shell-general-card{padding:17px 1px;border-bottom:1px solid var(--line)}.km-shell-general-card>strong,.km-shell-general-card>small{display:block}.km-shell-general-card>strong{font-size:17px}.km-shell-general-card>small{margin-top:4px;color:var(--muted);font-size:11px;line-height:1.4}.km-shell-general-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:13px}.km-shell-general-actions .btn{width:100%;margin:0;text-align:center}.km-shell-general-nav{display:grid;gap:2px;margin-top:10px}.km-shell-general-nav button{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:48px;padding:10px 1px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--text);font-weight:760;text-align:left}.km-shell-general-nav button span:last-child{color:var(--muted);font-size:21px}.km-shell-general-advanced{margin-top:12px}.km-shell-general-advanced summary{color:var(--muted);font-size:12px;font-weight:750;cursor:pointer}.km-shell-general-status{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.4}
      @keyframes kmSettingsForwardIn{from{opacity:.35;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}@keyframes kmSettingsBackIn{from{opacity:.35;transform:translateX(-24px)}to{opacity:1;transform:translateX(0)}}
      .km-shell-settings-content.km-settings-forward-in>*{animation:kmSettingsForwardIn .24s cubic-bezier(.22,1,.36,1) both}.km-shell-settings-content.km-settings-back-in>*{animation:kmSettingsBackIn .24s cubic-bezier(.22,1,.36,1) both}
      @media(max-width:480px){.km-shell-general-actions{grid-template-columns:1fr}}
      .shell>#timeModuleRoot{position:relative;z-index:0}.km-shell-drawer-open .shell>#timeModuleRoot{pointer-events:none!important}.editor-view>.km-shell-menu-button{display:none!important}
      .km-shell-locations{padding:2px 0 28px}.km-shell-locations-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:8px 1px 10px}.km-shell-locations-head h2{margin:2px 0 0;font-size:28px;letter-spacing:-.035em}.km-shell-location-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:5px 0 16px}.km-shell-location-actions button{min-height:44px}
      .km-shell-location-sort{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:4px;margin-bottom:8px;border:1px solid var(--line);border-radius:12px;background:var(--card)}.km-shell-location-sort button{min-height:34px;border:0;border-radius:8px;background:transparent;color:var(--muted);font-size:11px;font-weight:800}.km-shell-location-sort button.active{background:var(--card2);color:var(--text)}
      .km-shell-location-tree{border-top:1px solid var(--line)}.km-shell-location-node{--depth:0;margin-left:calc(var(--depth) * 20px)}.km-shell-location-swipe-row{position:relative;overflow:hidden;background:var(--card)}.km-shell-location-swipe-actions{position:absolute;z-index:0;inset:0 0 0 auto;display:flex;justify-content:flex-end}.km-shell-location-swipe-action{width:84px;padding:0;border:0;border-radius:0;color:#fff;font-size:11px;font-weight:800}.km-shell-location-swipe-delete{background:#9b3037}.km-shell-location-swipe-edit{background:#2869b6}.km-shell-location-swipe-surface{position:relative;z-index:1;background:var(--card);touch-action:pan-y;transition:transform .18s ease;user-select:none;-webkit-user-select:none;cursor:pointer}.km-shell-location-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:58px;padding:10px 2px;border-bottom:1px solid var(--line)}.km-shell-location-node[data-depth="1"] .km-shell-location-row{position:relative}.km-shell-location-node[data-depth="1"] .km-shell-location-row::before{content:"";position:absolute;left:-12px;top:0;bottom:50%;width:9px;border-left:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0 0 0 6px}.km-shell-location-icon{display:flex;align-items:center;justify-content:center;width:27px;height:27px;border:1px solid var(--line);border-radius:9px;color:var(--muted);font-size:15px}.km-shell-location-copy{min-width:0}.km-shell-location-copy strong,.km-shell-location-copy small{display:block}.km-shell-location-copy strong{font-size:14px}.km-shell-location-copy small{margin-top:3px;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.km-shell-location-buttons{display:flex;align-items:center;gap:3px}.km-shell-location-buttons button{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;border:0;border-radius:9px;background:transparent;color:var(--muted);font-size:19px}.km-shell-location-buttons button:active{background:var(--card2);color:var(--text)}.km-shell-location-chevron{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;color:var(--muted);font-size:19px}.km-shell-location-details{padding:10px 2px 12px 37px;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px;line-height:1.5}.km-shell-location-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.km-shell-location-detail{padding:8px 0}.km-shell-location-detail span,.km-shell-location-detail strong{display:block}.km-shell-location-detail span{font-size:9px;text-transform:uppercase;letter-spacing:.06em}.km-shell-location-detail strong{margin-top:2px;color:var(--text);font-size:11px}.km-shell-child-add{margin-top:7px;padding:4px 0;border:0;background:transparent;color:var(--accent);font-size:11px;font-weight:800}.km-shell-empty{padding:24px 2px;color:var(--muted);font-size:13px}
      .km-shell-parent-section select{width:100%;min-height:38px;padding:6px 0 7px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent;color:var(--text);font-size:15px;outline:none}.km-shell-parent-hint{margin-top:6px;color:var(--muted);font-size:10px;line-height:1.4}
      body.km-shell-locations-mode #app,body.km-shell-locations-mode #timeModuleRoot{display:none!important}body.km-shell-locations-mode #kmShellLocationsView{display:block!important}
      body.editor-view #kmShellLocationsView{display:none!important}
      /* Eén visuele taal voor Ritten, Tijd/taken en Locaties. */
      .km-shell-settings-head{display:flex!important;align-items:center!important;justify-content:center!important;min-height:59px}.km-shell-settings-title{padding:0 46px}
      body:not(.time-mode) #app .hero,body:not(.time-mode) #app .summary,body:not(.time-mode) #app .notice,body:not(.time-mode) #app .empty{border:1px solid var(--line)!important;border-radius:16px!important;background:var(--card)!important;box-shadow:none!important}
      body:not(.time-mode) #app .list{overflow:hidden;border:1px solid var(--line);border-radius:16px;background:var(--card)}
      body:not(.time-mode) #app .list .list-item{margin:0!important;border:0!important;border-bottom:1px solid var(--line)!important;border-radius:0!important;background:var(--card)!important}
      body:not(.time-mode) #app .list .trip-entry:last-child .list-item{border-bottom:0!important}
      body:not(.time-mode) #app .btn,.km-shell-locations .btn{border-radius:12px!important;box-shadow:none!important}
      .km-shell-location-tree{overflow:hidden;border:1px solid var(--line)!important;border-radius:16px;background:var(--card)}
      .km-shell-location-row{padding-left:12px!important;padding-right:8px!important}
      @media(max-width:520px){.km-shell-location-swipe-action{width:78px}}
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
      .km-shell-drawer-head{padding:7px 12px 18px!important}.km-shell-drawer-head strong{font-size:32px!important;font-weight:780!important;letter-spacing:-.035em!important}.km-shell-drawer-head small{font-size:12px!important}
      .km-shell-nav{overflow:hidden;gap:0!important;border:.5px solid var(--line);border-radius:16px;background:var(--card)}
      .km-shell-nav-button{position:relative;min-height:55px!important;padding:8px 13px!important;border-radius:0!important;font-size:16px!important;font-weight:600!important}
      .km-shell-nav-button:not(:last-child)::after{content:"";position:absolute;left:52px;right:0;bottom:0;height:.5px;background:var(--line)}
      .km-shell-nav-button .icon{width:29px!important;height:29px!important;border:0!important;border-radius:50%!important;background:color-mix(in srgb,var(--accent) 14%,transparent)!important;color:var(--accent)!important;font-size:15px!important}
      .km-shell-nav-button.active{background:color-mix(in srgb,var(--accent) 11%,var(--card))!important;color:var(--accent)!important}.km-shell-nav-button.active .icon{background:var(--accent)!important;color:#fff!important}
      .km-shell-drawer-footer{border-top:0!important;padding:12px 4px 2px!important}.km-shell-settings-button{margin-left:auto;border-radius:50%!important;background:var(--card)!important;color:var(--accent)!important}
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
      body:not(.time-mode) #app .btn:active,.km-shell-locations button:active{opacity:.68}
      .km-shell-locations-head{padding:7px 2px 12px!important}.km-shell-locations-head h2{font-size:22px!important;font-weight:720!important;letter-spacing:-.025em!important}
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
      /* Zoeken, compacte navigatie en eenduidige invoerschermen. */
      .km-shell-search{position:sticky;top:calc(59px + env(safe-area-inset-top));z-index:39;display:flex;align-items:center;gap:7px;min-height:38px;margin:0 0 12px;padding:0 11px;border-radius:12px;background:color-mix(in srgb,var(--muted) 14%,var(--bg));color:var(--muted);transform:translateY(0);opacity:1;transition:transform .2s cubic-bezier(.22,1,.36,1),opacity .14s ease,box-shadow .2s ease;-webkit-backdrop-filter:blur(20px) saturate(170%);backdrop-filter:blur(20px) saturate(170%)}
      body.km-shell-scrolled:not(.km-shell-search-revealed) .km-shell-search{transform:translateY(calc(-100% - 14px));opacity:0;pointer-events:none}
      body.km-shell-search-revealed .km-shell-search{box-shadow:0 7px 18px color-mix(in srgb,#000 14%,transparent)}
      .km-shell-search>span{font-size:20px;line-height:1;transform:rotate(-15deg)}
      .km-shell-search input{flex:1;min-width:0;height:38px;padding:0;border:0;outline:0;background:transparent;color:var(--text);font:inherit;font-size:16px}
      .km-shell-search input::placeholder{color:var(--muted)}
      .km-shell-search input::-webkit-search-cancel-button{display:none}
      .km-shell-search button{width:25px;height:25px;padding:0;border:0;border-radius:50%;background:color-mix(in srgb,var(--muted) 28%,transparent);color:var(--bg);font-size:18px;line-height:1}
      .km-shell-search-status{margin:-3px 0 14px;padding:20px 2px;color:var(--muted);font-size:13px;text-align:center}
      body.km-shell-scrolled .top.km-shell-top{min-height:59px!important;padding-top:calc(9px + env(safe-area-inset-top))!important;padding-bottom:9px!important}
      .top.km-shell-top,.km-shell-title,.km-shell-meta{transition:min-height .22s ease,padding .22s ease,font-size .22s ease,opacity .18s ease,margin .22s ease}
      body.km-shell-scrolled .km-shell-title{font-size:18px!important;letter-spacing:-.015em!important}
      body.km-shell-scrolled .km-shell-meta{height:0;margin:0!important;opacity:0;overflow:hidden}
      body.editor-view .km-shell-top,body.editor-view .km-shell-search,body.editor-view .km-shell-search-status{display:none!important}
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
      .km-shell-module-settings{gap:0;overflow:hidden;border:.5px solid var(--line);border-radius:14px;background:var(--card)}
      .km-shell-module-row{grid-template-columns:44px minmax(0,1fr) auto;min-height:64px;padding:9px 10px 9px 7px;border:0;border-radius:0;background:transparent}
      .km-shell-module-row:not(:last-child){border-bottom:.5px solid var(--line)}
      .km-shell-module-row.is-dragging{border-radius:12px;border-bottom-color:transparent}
      .km-shell-module-handle{display:inline-flex}
      .km-shell-module-copy strong{font-size:15px;font-weight:620}
      .km-shell-module-copy small{font-size:11px;line-height:1.35}
      .km-shell-module-toggle input{width:42px;height:24px}
      @media(max-width:390px){.km-shell-tab-button{font-size:9px}.km-shell-tab-button svg{width:21px;height:21px}.km-shell-title{font-size:29px!important}}
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

    const spacer = document.createElement('span');
    spacer.className = 'km-shell-top-spacer';
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
    top.append(menuSlot, copy, spacer, legacy);

    const search = document.createElement('div');
    search.id = 'kmShellSearch';
    search.className = 'km-shell-search';
    search.innerHTML = '<span aria-hidden="true">⌕</span><input id="kmShellSearchInput" type="search" autocomplete="off" enterkeyhint="search" aria-label="Zoeken"><button id="kmShellSearchClear" type="button" aria-label="Zoekopdracht wissen" hidden>×</button>';
    top.insertAdjacentElement('afterend', search);
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

    document.body.appendChild(menu);
    menu.addEventListener('click', () => {
      if (drawerOpen) closeDrawer();
      else openDrawer();
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
      <div class="km-shell-drawer-footer"><span class="km-shell-version" aria-label="Geladen testversie ${SHELL_VERSION}"><span class="km-shell-version-label">TEST</span><span class="km-shell-version-number">${SHELL_VERSION}</span></span><button id="kmShellSettingsButton" class="km-shell-settings-button" type="button" aria-label="Instellingen">⚙︎</button></div>`;

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
    const placeholderView = document.createElement('main');
    placeholderView.id = 'kmShellPlaceholderView';
    placeholderView.className = 'km-shell-placeholder';
    placeholderView.hidden = true;
    const shell = $('.shell');
    if (shell) shell.append(locationsView, placeholderView);

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

  function openDrawer() {
    if ($('#kmShellSettings')?.classList.contains('open')) return;
    drawerOpen = true;
    localStorage.setItem(DRAWER_KEY, '1');
    document.body.classList.add('km-shell-drawer-open');
    $('#kmShellMenuButton')?.setAttribute('aria-expanded', 'true');
    $('#kmShellDrawer')?.classList.add('open');
    $('#kmShellBackdrop')?.classList.add('open');
    syncDrawerSelection();
  }

  function closeDrawer() {
    drawerOpen = false;
    localStorage.removeItem(DRAWER_KEY);
    document.body.classList.remove('km-shell-drawer-open');
    $('#kmShellMenuButton')?.setAttribute('aria-expanded', 'false');
    $('#kmShellDrawer')?.classList.remove('open');
    $('#kmShellBackdrop')?.classList.remove('open');
  }

  function syncDrawerSelection() {
    $('.km-shell-nav-button').forEach(button => {
      const active = button.dataset.shellSection === section;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const directTabs = $('.km-shell-tab-button[data-shell-tab]');
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
    const labels = { rides: 'Zoek in ritten', time: 'Zoek in tijd en taken', locations: 'Zoek in locaties' };
    input.placeholder = labels[section] || `Zoek in ${moduleById(section)?.label?.toLocaleLowerCase('nl-NL') || 'onderdelen'}`;
  }

  function resetShellSearch() {
    const input = $('#kmShellSearchInput');
    if (input) input.value = '';
    const clear = $('#kmShellSearchClear');
    if (clear) clear.hidden = true;
    document.body.classList.remove('km-shell-searching');
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
    document.body.classList.toggle('km-shell-searching', Boolean(query));
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
    } else {
      visible = setSearchMatches($$('#timeModuleRoot .activity-entry-shell'), query);
    }
    const status = $('#kmShellSearchStatus');
    if (status) {
      status.hidden = !query || visible > 0;
      status.textContent = query && visible === 0 ? 'Geen resultaten gevonden.' : '';
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
      updateScrollChrome(window.scrollY, windowScrollState);
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

    const openedFromDrawer = drawerOpen;
    closeDrawer();
    section = next;
    document.body.classList.remove('km-shell-scrolled', 'km-shell-search-revealed', 'km-shell-tab-transition');
    windowScrollState.top = Math.max(0, window.scrollY || 0);
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

    if (!openedFromDrawer) {
      void $('.shell')?.offsetWidth;
      document.body.classList.add('km-shell-tab-transition');
      setTimeout(() => document.body.classList.remove('km-shell-tab-transition'), 240);
    }
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
    const placeholder = $('#kmShellPlaceholderView');
    document.body.classList.toggle('km-shell-placeholder-mode', Boolean(moduleById(section)?.placeholder));
    if (document.body.classList.contains('editor-view')) {
      document.body.classList.remove('km-shell-locations-mode', 'km-shell-placeholder-mode');
      if (locations) locations.hidden = true;
      if (placeholder) placeholder.hidden = true;
      syncChrome();
      notifyActiveViewRefresh();
      return;
    }

    if (section === 'locations') {
      ensureOriginalMode('kilometers');
      ensureKmView('ride');
      document.body.classList.add('km-shell-locations-mode');
      if (locations) locations.hidden = false;
      if (placeholder) placeholder.hidden = true;
      renderLocations();
    } else if (moduleById(section)?.placeholder) {
      ensureOriginalMode('kilometers');
      ensureKmView('ride');
      document.body.classList.remove('km-shell-locations-mode');
      if (locations) locations.hidden = true;
      if (placeholder) placeholder.hidden = false;
      renderPlaceholderModule();
    } else {
      document.body.classList.remove('km-shell-locations-mode');
      if (locations) locations.hidden = true;
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
      } else {
        wantedMeta = moduleById(section)?.subtitle || 'Onderdeel in voorbereiding';
      }
      if (meta.textContent !== wantedMeta) meta.textContent = wantedMeta;
    }
    updateSearchPlaceholder();
    syncDrawerSelection();
  }

  function filterTripLocationSelects() {
    const snapshot = readData();
    const childToParent = new Map(snapshot.locations.filter(location => location.parentId).map(location => [String(location.id), String(location.parentId)]));
    if (!childToParent.size) return;
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
      const isEditor = Boolean(select.closest('#tripEditForm'));
      const selectedBefore = select.value;
      const selectedId = isArrival && selectedBefore.startsWith('known:') ? selectedBefore.slice(6) : selectedBefore;
      const parentId = childToParent.get(selectedId);
      if (parentId && !isEditor) {
        const parentValue = isArrival ? `known:${parentId}` : parentId;
        if ([...select.options].some(option => option.value === parentValue)) select.value = parentValue;
      }
      for (const option of [...select.options]) {
        const optionId = isArrival && option.value.startsWith('known:') ? option.value.slice(6) : option.value;
        if (!childToParent.has(optionId)) continue;
        if (isEditor && option.value === selectedBefore) continue;
        option.remove();
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

  function orderedRoots(snapshot) {
    const roots = snapshot.locations.filter(location => !location.parentId || !snapshot.locations.some(candidate => candidate.id === location.parentId));
    const smart = snapshot.settings.locationSortMode !== 'alpha';
    return roots.sort((a, b) => smart
      ? locationTripCount(b, snapshot) - locationTripCount(a, snapshot) || String(a.name).localeCompare(String(b.name), 'nl', { sensitivity: 'base' })
      : String(a.name).localeCompare(String(b.name), 'nl', { sensitivity: 'base' }));
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
    return `
      <div class="km-shell-location-node" data-shell-location-node="${esc(location.id)}" data-depth="${depth}" style="--depth:${depth}">
        <div class="km-shell-location-swipe-row" data-shell-location-swipe="${esc(location.id)}">
          <div class="km-shell-location-swipe-actions">
            ${canDelete ? `<button type="button" class="km-shell-location-swipe-action km-shell-location-swipe-delete" data-shell-location-swipe-action="delete" data-location-id="${esc(location.id)}">Verwijder</button>` : ''}
            <button type="button" class="km-shell-location-swipe-action km-shell-location-swipe-edit" data-shell-location-swipe-action="edit" data-location-id="${esc(location.id)}">Bewerk</button>
          </div>
          <div class="km-shell-location-row km-shell-location-swipe-surface" data-shell-location-toggle="${esc(location.id)}" role="button" tabindex="0" aria-expanded="${expanded}">
            <span class="km-shell-location-icon">${locationGlyph(location.type)}</span>
            <div class="km-shell-location-copy"><strong>${esc(location.name || 'Locatie')}</strong><small>${esc(subtitle)}</small></div>
            <div class="km-shell-location-buttons">
              <button type="button" data-shell-edit-location="${esc(location.id)}" aria-label="${esc(location.name)} bewerken">•••</button>
              <span class="km-shell-location-chevron" aria-hidden="true">${expanded ? '⌄' : '›'}</span>
            </div>
          </div>
        </div>
        ${expanded ? `<div class="km-shell-location-details"><div class="km-shell-location-detail-grid"><div class="km-shell-location-detail"><span>Type</span><strong>${esc(typeLabel(location.type))}</strong></div><div class="km-shell-location-detail"><span>Ritten</span><strong>${count}</strong></div><div class="km-shell-location-detail"><span>GPS</span><strong>${esc(gps)}${inherited ? ' · geërfd' : ''}</strong></div><div class="km-shell-location-detail"><span>Niveau</span><strong>${depth ? 'Sublocatie' : 'Hoofdlocatie'}</strong></div></div>${depth === 0 ? `<button type="button" class="km-shell-child-add" data-shell-add-child="${esc(location.id)}">+ Sublocatie toevoegen</button>` : ''}</div>` : ''}
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
    row.classList.remove('swipe-open');
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

  function bindLocationInteractions(root) {
    root.onclick = event => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (!target) return;
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
        expandedLocationId = expandedLocationId === toggle.dataset.shellLocationToggle ? null : toggle.dataset.shellLocationToggle;
        renderLocations();
      }
    };

    root.onkeydown = event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const target = event.target instanceof Element ? event.target : null;
      const toggle = target?.closest('[data-shell-location-toggle]');
      if (!toggle || target.closest('button')) return;
      event.preventDefault();
      expandedLocationId = expandedLocationId === toggle.dataset.shellLocationToggle ? null : toggle.dataset.shellLocationToggle;
      renderLocations();
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
        if (Math.abs(rawY) > 10 && Math.abs(rawY) > Math.abs(rawX)) {
          gesture.cancelled = true;
          return;
        }
        if (Math.abs(rawX) > 8 && Math.abs(rawX) > Math.abs(rawY)) gesture.horizontal = true;
        else return;
      }
      if (event.cancelable) event.preventDefault();
      const actionWidth = innerWidth <= 520 ? 78 : 84;
      const actionCount = gesture.row.querySelectorAll('.km-shell-location-swipe-action').length || 1;
      const maxDistance = actionCount * actionWidth;
      const dx = Math.max(-maxDistance, Math.min(0, rawX));
      gesture.maxDistance = maxDistance;
      gesture.dx = dx;
      gesture.surface.style.transition = 'none';
      gesture.surface.style.transform = `translateX(${dx}px)`;
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
      if (gesture.dx <= -36) {
        gesture.surface.style.transition = 'transform .18s cubic-bezier(.2,.8,.2,1)';
        gesture.surface.style.transform = `translateX(-${gesture.maxDistance}px)`;
        gesture.surface.dataset.swipeOpen = '1';
        gesture.row.classList.add('swipe-open');
        return;
      }
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
    const sortMode = snapshot.settings.locationSortMode === 'alpha' ? 'alpha' : 'smart';
    const roots = orderedRoots(snapshot);
    root.innerHTML = `
      <div class="km-shell-location-actions"><button type="button" class="btn secondary" data-shell-current-location>Huidige locatie</button><button type="button" class="btn" data-shell-add-location>Nieuwe locatie</button></div>
      <div class="km-shell-location-sort" aria-label="Locaties sorteren"><button type="button" class="${sortMode === 'smart' ? 'active' : ''}" data-action="location-sort" data-mode="smart">◎ Logisch</button><button type="button" class="${sortMode === 'alpha' ? 'active' : ''}" data-action="location-sort" data-mode="alpha">A–Z Naam</button></div>
      ${roots.length ? `<div class="km-shell-location-tree">${roots.map(location => locationNodeHtml(location, 0, snapshot)).join('')}</div>` : '<div class="km-shell-empty">Nog geen locaties opgeslagen.</div>'}`;
    bindLocationInteractions(root);
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
    sectionEl.innerHTML = `<div class="edit-section-head"><strong>Onder locatie</strong><small>Hoofdlocatie of sublocatie</small></div><div class="form-group"><label>Onder locatie</label><select id="kmShellParentId">${parentOptions(id, selectedParent, snapshot)}</select><div id="kmShellParentHint" class="km-shell-parent-hint"></div></div>`;
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

  function installStorageHierarchyPatch() {
    if (Storage.prototype.__kmShellParentPatch) return;
    const nativeSetItem = Storage.prototype.setItem;
    Object.defineProperty(Storage.prototype, '__kmShellParentPatch', { value: true, configurable: false });
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === DATA_KEY && pendingParentSave) {
        try {
          const payload = JSON.parse(String(value));
          if (Array.isArray(payload.locations)) {
            let target = pendingParentSave.id ? payload.locations.find(location => location.id === pendingParentSave.id) : null;
            if (!target) target = payload.locations.find(location => location.id && !pendingParentSave.beforeIds.has(location.id));
            if (target) {
              if (pendingParentSave.parentId) target.parentId = pendingParentSave.parentId;
              else delete target.parentId;
              const previous = pendingParentSave.previousParentId || '';
              if (previous !== (pendingParentSave.parentId || '')) pendingHierarchyReload = true;
              value = JSON.stringify(payload);
            }
          }
        } catch (error) {
          console.warn('Sublocatie kon niet in opslag worden aangevuld.', error);
        }
      }
      return nativeSetItem.call(this, key, value);
    };
  }

  function captureParentBeforeSave() {
    const form = $('#locationForm');
    const select = $('#kmShellParentId', form);
    if (!form || !select) return;
    const snapshot = readData();
    const id = form.elements.id?.value || '';
    const stored = id ? locationById(id, snapshot) : null;
    pendingParentSave = {
      id,
      parentId: select.value || '',
      previousParentId: stored?.parentId || '',
      beforeIds: new Set(snapshot.locations.map(location => location.id))
    };
    setTimeout(() => { pendingParentSave = null; }, 2500);
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
    const remaining = new Map(current.map(item => [item.id, item]));
    const ordered = [];
    for (const id of moduleRowIds(host)) {
      const item = remaining.get(id);
      if (!item) continue;
      ordered.push({ ...item, order: ordered.length });
      remaining.delete(id);
    }
    for (const item of current) {
      if (remaining.has(item.id)) ordered.push({ ...item, order: ordered.length });
    }
    return ordered;
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
    host.innerHTML = config.map(item => {
      const module = moduleById(item.id);
      const label = module?.label || item.id;
      return `<div class="km-shell-module-row" data-module-id="${esc(item.id)}" aria-grabbed="false"><button class="km-shell-module-handle" type="button" data-module-drag-handle aria-label="${esc(label)} verplaatsen" title="Sleep om te verplaatsen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg></button><div class="km-shell-module-copy"><strong>${esc(label)}</strong><small>${esc(module?.subtitle || '')}${module?.placeholder ? ' · in voorbereiding' : ''}</small></div><div class="km-shell-module-controls"><label class="km-shell-module-toggle" aria-label="${esc(label)} tonen"><input type="checkbox" data-module-toggle="${esc(item.id)}" ${item.enabled ? 'checked' : ''}></label></div></div>`;
    }).join('');
    bindModuleReordering(host);
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
          ${generalSettingsAccordion('kmShellTimeSettings', 'Tijd en taken', 'Afronding, thema’s, collega’s en tussenstops', '<div class="km-shell-settings-panel-host"></div>', 'time')}
          ${generalSettingsAccordion('kmShellLocationSettings', 'Locaties', 'Herkenning en verwijderen', '<div class="km-shell-settings-panel-host"></div>', 'locations')}
        </section>
        <section class="km-shell-settings-group" aria-labelledby="kmShellAppSettingsTitle">
          <header class="km-shell-settings-group-head"><h2 id="kmShellAppSettingsTitle">App</h2><p>Bepaal welke onderdelen zichtbaar zijn en in welke volgorde.</p></header>
          ${generalSettingsAccordion('kmShellModuleSettingsAccordion', 'Onderdelen en volgorde', 'Kies wat zichtbaar is en sleep aan het handvat voor de volgorde', '<div id="kmShellModuleSettings" class="km-shell-module-settings"></div>')}
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
      const toggle = event.target.closest('[data-module-toggle]');
      if (!toggle) return;
      const config = moduleConfiguration();
      const item = config.find(entry => entry.id === toggle.dataset.moduleToggle);
      if (!item) return;
      item.enabled = toggle.checked;
      if (!config.some(entry => entry.enabled)) {
        item.enabled = true;
        toggle.checked = true;
        return;
      }
      saveModuleConfiguration(config);
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
    // Het zijpaneel blijft bewust open staan achter de sheet.
    drawerOpen = true;
    document.body.classList.add('km-shell-drawer-open');
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
      syncChrome();
      applyShellSearch();
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
      if (target.closest('[data-action="save-location"]')) captureParentBeforeSave();
      if (target.closest('[data-action="location-sort"]') && section === 'locations') setTimeout(renderLocations, 0);
    }, false);

    const observer = new MutationObserver(() => {
      if ($('#locationForm')) queueLocationEditorAugment();
      filterTripLocationSelects();
      const editor = document.body.classList.contains('editor-view');
      const editorClosed = lastEditorState && !editor;
      lastEditorState = editor;
      if (editorClosed && section === 'locations' && !$('#kmShellSettings')?.classList.contains('open')) {
        document.body.classList.add('km-shell-locations-mode');
        renderLocations();
      }
      if (!editor && pendingHierarchyReload) {
        pendingHierarchyReload = false;
        localStorage.setItem(SECTION_KEY, 'locations');
        setTimeout(() => location.reload(), 60);
      }
      syncChrome();
      applyShellSearch();
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    window.addEventListener('storage', event => {
      if (event.key === DATA_KEY) {
        renderLocations();
        refreshShellUI();
      } else if (event.key === 'urenregistratie.test.pwa.v1') {
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
    installStorageHierarchyPatch();
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
