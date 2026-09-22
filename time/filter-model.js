(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LogTimeFilterModel = Object.freeze(api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const text = value => String(value ?? '');
  const same = (left, right) => text(left) === text(right);

  function entryMatchesTheme(entry, theme) {
    return same(entry?.themeId, theme?.id)
      || (!entry?.themeId && text(entry?.themeName) === text(theme?.name));
  }

  function entryMatchesSubtheme(entry, subtheme) {
    return same(entry?.subthemeId, subtheme?.id)
      || (!entry?.subthemeId && text(entry?.subthemeName) === text(subtheme?.name));
  }

  function matchesFilter(entry, filterValue, catalog = {}) {
    const value = text(filterValue || 'all');
    if (value === 'all') return true;
    if (value.startsWith('theme:')) {
      const id = value.slice(6);
      const theme = (catalog.themes || []).find(item => same(item?.id, id));
      return same(entry?.themeId, id) || (!entry?.themeId && theme && text(entry?.themeName) === text(theme.name));
    }
    if (value.startsWith('subtheme:')) {
      const id = value.slice(9);
      const subtheme = (catalog.subthemes || []).find(item => same(item?.id, id));
      return same(entry?.subthemeId, id) || (!entry?.subthemeId && subtheme && text(entry?.subthemeName) === text(subtheme.name));
    }
    return true;
  }

  function minutesFor(entries, theme, subtheme = null) {
    return entries.reduce((sum, entry) => {
      if (!entryMatchesTheme(entry, theme)) return sum;
      if (subtheme && !entryMatchesSubtheme(entry, subtheme)) return sum;
      return sum + (Number(entry?.ownMinutes) || 0);
    }, 0);
  }

  function buildOptions({ themes = [], subthemes = [], entries = [] } = {}) {
    const periodEntries = Array.isArray(entries) ? entries : [];
    const records = (Array.isArray(themes) ? themes : [])
      .map(theme => ({ theme, minutes: minutesFor(periodEntries, theme) }))
      .filter(record => record.minutes > 0)
      .sort((a, b) => text(a.theme?.name).localeCompare(text(b.theme?.name), 'nl', { sensitivity: 'base' }))
      .map(record => ({
        ...record,
        children: (Array.isArray(subthemes) ? subthemes : [])
          .filter(subtheme => same(subtheme?.themeId, record.theme?.id))
          .map(subtheme => ({ subtheme, minutes: minutesFor(periodEntries, record.theme, subtheme) }))
          .filter(child => child.minutes > 0)
          .sort((a, b) => text(a.subtheme?.name).localeCompare(text(b.subtheme?.name), 'nl', { sensitivity: 'base' }))
      }));

    return {
      allMinutes: periodEntries.reduce((sum, entry) => sum + (Number(entry?.ownMinutes) || 0), 0),
      records
    };
  }

  function selectionMinutes(entries, filterValue, catalog = {}) {
    return (Array.isArray(entries) ? entries : [])
      .filter(entry => matchesFilter(entry, filterValue, catalog))
      .reduce((sum, entry) => sum + (Number(entry?.ownMinutes) || 0), 0);
  }

  return { buildOptions, matchesFilter, selectionMinutes };
});
