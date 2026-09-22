const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'time/home-layout.js'), 'utf8');
const top = fs.readFileSync(path.join(root, 'time/home-top.js'), 'utf8');
const topStyle = fs.readFileSync(path.join(root, 'time/home-top.css'), 'utf8');
const sharedStyle = fs.readFileSync(path.join(root, 'log-ui.css'), 'utf8');

assert.doesNotMatch(layout, /id="cancelInlineTask"/, 'Het taakformulier mag geen los sluitkruis tonen.');
assert.doesNotMatch(layout, /class="inline-proposal"/, 'Het geselecteerde voorstel mag niet dubbel worden uitgeschreven.');
assert.match(layout, /themeOptions\(selectedThemeId\)/, 'Het voorgestelde thema moet vooraf geselecteerd blijven.');
assert.match(layout, /subthemeOptions\(selectedThemeId, selectedSubId\)/, 'Het voorgestelde subthema moet vooraf geselecteerd blijven.');
assert.match(top, /preparing \? 'Annuleer taak' : 'Taak registreren'/, 'De bovenkaart moet bij invoer een rustige annuleeractie tonen.');
assert.match(top, /time:cancel-inline-task/, 'De annuleeractie moet het taakformulier sluiten.');
assert.match(topStyle, /context-preparing[\s\S]*home-action-button[\s\S]*background:var\(--surface\)!important;[\s\S]*border:0!important;/, 'De annuleeractie moet opgaan in de achtergrond van de kaart.');
assert.match(sharedStyle, /task-cancel-button\{background:var\(--surface\)!important;border:0!important;border-radius:0!important/, 'De gedeelde knopstijl mag geen afwijkend vlak of rand rond annuleren tonen.');
assert.doesNotMatch(layout, /<div class="kicker">Taak registreren<\/div>|<h2>Start je taak<\/h2>/, 'Het taakformulier mag geen dubbele introductiekoppen tonen.');
assert.match(layout, /<label class="inline-label" for="inlineTaskTheme">Thema<\/label>/, 'Thema moet als losse veldkop boven de selectie staan.');
assert.match(layout, /<label class="inline-label" for="inlineTaskSub">Subthema<\/label>/, 'Subthema moet als losse veldkop boven de selectie staan.');
assert.match(layout, /class="inline-task-suggestion">Voorstel:/, 'De voorgestelde keuze moet compact onder de keuzelijsten worden toegelicht.');

console.log('time task entry regression: ok');
