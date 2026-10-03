const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const awareness = read('collaboration-v2-awareness.js');
const bridge = read('shell-backup-archive.js');

assert.doesNotThrow(() => new Function(awareness), 'collaboration-v2-awareness.js must parse');
assert.match(awareness, /Nieuwe update beschikbaar/, 'remote revision must have a visible update label');
assert.match(awareness, /log-c2-awareness-dot/, 'remote revision must have a visible status dot');
assert.match(awareness, /remoteAuthored/, 'own and remote revisions must be distinguished');
assert.match(awareness, /markSeen/, 'opening a collaboration must be able to clear the unread state');
assert.match(awareness, /background:var\(--warn/, 'unread update indicator must use the warning/orange state');
assert.match(bridge, /collaboration-v2-awareness\.js/, 'test loader must load the awareness bridge');

console.log('collaboration-v2 awareness regression checks passed');