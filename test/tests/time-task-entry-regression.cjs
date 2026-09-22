const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'time/home-layout.js'), 'utf8');
const top = fs.readFileSync(path.join(root, 'time/home-top.js'), 'utf8');

assert.doesNotMatch(layout, /id="cancelInlineTask"/, 'Het taakformulier mag geen los sluitkruis tonen.');
assert.doesNotMatch(layout, /class="inline-proposal"/, 'Het geselecteerde voorstel mag niet dubbel worden uitgeschreven.');
assert.match(layout, /themeOptions\(selectedThemeId\)/, 'Het voorgestelde thema moet vooraf geselecteerd blijven.');
assert.match(layout, /subthemeOptions\(selectedThemeId, selectedSubId\)/, 'Het voorgestelde subthema moet vooraf geselecteerd blijven.');
assert.match(top, /classList\.toggle\('task-cancel-button', preparing\)/, 'De annuleeractie moet de rustige knopstijl krijgen.');
assert.match(top, /time:cancel-inline-task/, 'De bovenste annuleerknop moet het taakformulier kunnen sluiten.');

console.log('time task entry regression: ok');
