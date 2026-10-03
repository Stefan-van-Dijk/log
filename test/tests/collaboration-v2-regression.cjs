const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const identity = read('identity-sync.js');
const collaboration = read('collaboration-v2.js');
const consistency = read('collaboration-v2-consistency.js');
const multiparty = read('collaboration-v2-multiparty.js');
const personCard = read('person-card-v2.js');
const personCardDialogGuard = read('person-card-v2-dialog-guard.js');
const bridge = read('shell-backup-archive.js');
const buildUi = read('test-build-ui.js');
const serviceWorker = read('service-worker.js');
const server = read('server/sync.php');

// Syntax: browser/service-worker globals are allowed; parsing catches accidental JS syntax regressions.
assert.doesNotThrow(() => new Function(identity), 'identity-sync.js must parse');
assert.doesNotThrow(() => new Function(collaboration), 'collaboration-v2.js must parse');
assert.doesNotThrow(() => new Function(consistency), 'collaboration-v2-consistency.js must parse');
assert.doesNotThrow(() => new Function(multiparty), 'collaboration-v2-multiparty.js must parse');
assert.doesNotThrow(() => new Function(personCard), 'person-card-v2.js must parse');
assert.doesNotThrow(() => new Function(personCardDialogGuard), 'person-card dialog guard must parse');
assert.doesNotThrow(() => new Function(bridge), 'shell-backup-archive.js must parse');
assert.doesNotThrow(() => new Function(buildUi), 'test-build-ui.js must parse');
assert.doesNotThrow(() => new Function(serviceWorker), 'service-worker.js must parse');

assert.match(identity, /driverPersonId/, 'rides must carry a driver PersonId');
assert.match(identity, /vehicleId/, 'rides must carry a VehicleId');
assert.match(identity, /PBKDF2-SHA256\+A256GCM/, 'personal backup must be encrypted client-side');
assert.match(identity, /person-backup/, 'personal backup sync kind must exist');
assert.match(identity, /ownerToken:token,revision:nextRevision/, 'encrypted backup must retain ownership and next revision for device restore');

assert.match(collaboration, /log-share-v2:/, 'collaboration invitation format must exist');
assert.match(collaboration, /createTaskShare/, 'task collaboration must exist');
assert.match(collaboration, /respondTask/, 'task acceptance/rejection must exist');
assert.match(collaboration, /createVehicleShare/, 'vehicle collaboration must exist');
assert.match(collaboration, /publishVehicle/, 'vehicle registrations must be publishable');
assert.match(collaboration, /createConversation/, 'person-to-person conversation must exist');
assert.match(collaboration, /lockCollaboration/, 'revocation must lock member content');

assert.match(consistency, /item\.status='pending'/, 'changed accepted hours must become pending again');
assert.match(consistency, /Mijn vaste Log PersonId/, 'own PersonId must be protected from contact relinking');
assert.match(multiparty, /addParticipant/, 'owner must be able to add participants');
assert.match(multiparty, /\['vehicle','conversation'\]/, 'multiparty sharing must be limited to shared vehicle/conversation; hours remain person-specific');
assert.match(multiparty, /doc\.participants\.push/, 'new participant must be part of the encrypted collaboration document');

assert.match(personCard, /CODE=\/\^log-person-v1:\(\[A-Za-z0-9_-\]\{12\}\)\$\//, 'person-card QR must carry one 12-character pair code');
assert.match(personCard, /log\.person-card\.v2/, 'person-card encrypted payload schema v2 must exist');
assert.match(personCard, /PAIR12-SHA256\+A256GCM/, '12-character pair code must derive the person-card encryption key');
assert.match(personCard, /pairCode:card\.alias/, 'visible pair code must be the 12-character public alias');
assert.match(personCard, /12-teken code kopiëren/, 'person card UI must expose only the short pair code');
assert.match(personCard, /12-teken persoonscode invoeren/, 'manual fallback must use the same short pair code');
assert.match(personCard, /openScannerFor/, 'person detail must be able to open the shared QR scanner');
assert.match(personCard, /LogIdentitySync\.linkContact/, 'scanned person cards must link through the identity layer');
assert.doesNotMatch(personCard, /log-person-v1:\$\{alias\}\.\$\{/, 'new person-card QR must not append a long decryption key');
assert.match(personCard, /mask\(/, 'raw technical identities must be masked in the visible identity UI');
assert.match(personCardDialogGuard, /dialog\.cards-dialog/, 'person-card async dialogs must keep a visible close control');

assert.match(server, /'accept','reject'/, 'server must support task acknowledgements');
assert.match(server, /LOG_SYNC_RIGHTS/, 'server must enforce explicit rights');
assert.match(server, /ownerTokenHash/, 'server must separate owner authority from visible alias');
assert.match(server, /action === 'revoke'/, 'owner revocation must exist');
assert.match(server, /action === 'offline'/, 'temporary payload removal must exist');
assert.match(server, /\$state\['acknowledgements'\] = \[\]/, 'owner task revision must invalidate prior acknowledgements');

assert.match(bridge, /collaboration-v2-consistency\.js/, 'test loader must include consistency rules');
assert.match(bridge, /collaboration-v2-multiparty\.js/, 'test loader must include multiparty support');
assert.match(bridge, /person-card-v2\.js\?v=\$\{BUILD\}-person12/, 'test loader must bust the person-card cache for the 12-character format');
assert.match(bridge, /person-card-v2-dialog-guard\.js/, 'test loader must include the person-card dialog guard');
assert.doesNotMatch(buildUi, /ensureScript\(`\.\/collaboration\.js/, 'legacy collaboration must not be loaded by the test UI');
assert.match(serviceWorker, /0\.39-test\.3/, 'PWA cache must use the current test build');
assert.match(serviceWorker, /collaboration-v2-consistency\.js/, 'PWA cache must include consistency rules');
assert.match(serviceWorker, /collaboration-v2-multiparty\.js/, 'PWA cache must include multiparty support');

console.log('collaboration-v2 regression checks passed');
