'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'shell-ui-stable.js'), 'utf8');

const requiredRules = [
  ['veilige bovenruimte', 'padding:calc(env(safe-area-inset-top) + 8px) 12px 10px!important'],
  ['vaste drielaags indeling', 'grid-template-columns:44px minmax(0,1fr) 44px!important'],
  ['geen dubbele titelinspringing', 'padding:0!important;text-align:center!important'],
  ['menu-aanraakvlak', '.km-shell-menu-button,.km-shell-search-toggle{z-index:42!important;top:calc(env(safe-area-inset-top) + 8px)!important;width:44px!important;height:44px!important'],
  ['zoekknop in de header', '.km-shell-search-toggle{position:absolute!important;right:12px!important}'],
  ['compacte scrolstatus', 'body.km-shell-scrolled .km-shell-title{font-size:18px!important'],
  ['zoekveld onder compacte header', '.km-shell-search{top:calc(env(safe-area-inset-top) + 60px)!important}']
];

for (const [label, rule] of requiredRules) {
  assert.equal(source.includes(rule), true, `Headerregressie: ${label} ontbreekt`);
}

assert.equal(source.includes('.km-shell-top{position:static!important'), false, 'Headerregressie: oude statische headerregel is teruggekeerd');
assert.equal(source.includes('.km-shell-top-copy{padding-left:44px;padding-right:44px}'), false, 'Headerregressie: dubbele horizontale titelruimte is teruggekeerd');

console.log('Headerregressie geslaagd: veilige zone, uitlijning, 44px-bediening en compacte scrolstatus aanwezig.');
