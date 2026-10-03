const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const identity = read('identity-sync.js');
const collaboration = read('collaboration-v2.js');
const consistency = read('collaboration-v2-consistency.js');
const multiparty = read('collaboration-v2-multiparty.js');
const people = read('people.js');
const personIdentity = read('person-id-unification.js');
const personCardNetwork = read('people-personcard-network-fix.js');
const bridge = read('shell-backup-archive.js');
const buildUi = read('test-build-ui.js');
const serviceWorker = read('service-worker.js');
const server = read('server/sync.php');

// Syntax: browser/service-worker globals are allowed; parsing catches accidental JS syntax regressions.
assert.doesNotThrow(() => new Function(identity), 'identity-sync.js must parse');
assert.doesNotThrow(() => new Function(collaboration), 'collaboration-v2.js must parse');
assert.doesNotThrow(() => new Function(consistency), 'collaboration-v2-consistency.js must parse');
assert.doesNotThrow(() => new Function(multiparty), 'collaboration-v2-multiparty.js must parse');
assert.doesNotThrow(() => new Function(people), 'people.js must parse');
assert.doesNotThrow(() => new Function(personIdentity), 'person-id-unification.js must parse');
assert.doesNotThrow(() => new Function(personCardNetwork), 'people-personcard-network-fix.js must parse');
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

// Person-card support lives inside People; the visible QR is now exactly the 12-character person code.
assert.match(people, /CODE=\/\^log-person-v1:\(\[A-Za-z0-9_-\]\{12\}\)\$\//, 'People must still understand the legacy typed person-card payload');
assert.match(people, /log\.person-card\.v2/, 'People must publish person-card payload schema v2');
assert.match(people, /PAIR12-SHA256\+A256GCM/, '12-character person code must derive the person-card encryption key');
assert.match(people, /Mijn persoonskaart tonen/, 'own person detail must expose the person card');
assert.match(people, /Persoonskaart scannen/, 'other person detail must expose person-card scanning');
assert.match(people, /12-teken persoonscode invoeren/, 'manual fallback must use the same 12-character person code');
assert.match(people, /LogIdentitySync\.linkContact/, 'scanned person cards must link through the identity layer');
assert.doesNotMatch(people, /log-person-v1:\$\{[^}]+\}\.\$\{/, 'person-card QR must not append a long decryption key');
assert.match(personCardNetwork, /function makeCode\(pairCode\)\{return String\(pairCode\|\|''\);\}/, 'visible person-card QR must contain only the 12-character code');
assert.match(personCardNetwork, /hideLocalIdentifiers/, 'local implementation identifiers must stay hidden');

// A person always has one 12-character PersonId. Unlinked people are provisional and merge into a real PersonId later.
assert.match(personIdentity, /identityStatus='provisional'/, 'unlinked people must be marked provisional');
assert.match(personIdentity, /identityStatus='linked'/, 'linked people must use linked identity status');
assert.match(personIdentity, /log-test-person-id-aliases-v1/, 'old and provisional identifiers must retain an alias translation map');
assert.match(personIdentity, /setAlias\(current,realPersonId\)/, 'provisional PersonId must alias to the real PersonId during merge');
assert.match(personIdentity, /remapStoredReferences\(current,realPersonId\)/, 'existing references must be translated to the real PersonId');
assert.match(personIdentity, /wrapped.__personIdUnified=true/, 'identity linking must trigger PersonId merge without replacing the People UI path');

assert.match(server, /'accept','reject'/, 'server must support task acknowledgements');
assert.match(server, /LOG_SYNC_RIGHTS/, 'server must enforce explicit rights');
assert.match(server, /ownerTokenHash/, 'server must separate owner authority from visible alias');
assert.match(server, /action === 'revoke'/, 'owner revocation must exist');
assert.match(server, /action === 'offline'/, 'temporary payload removal must exist');
assert.match(server, /\$state\['acknowledgements'\] = \[\]/, 'owner task revision must invalidate prior acknowledgements');

assert.match(bridge, /collaboration-v2-consistency\.js/, 'test loader must include consistency rules');
assert.match(bridge, /collaboration-v2-multiparty\.js/, 'test loader must include multiparty support');
assert.doesNotMatch(buildUi, /v2-feature-loader\.js/, 'general v2 feature loader must stay out of the critical UI path');
assert.match(buildUi, /person-id-unification\.js/, 'test UI must load the isolated PersonId migration layer');
assert.doesNotMatch(buildUi, /ensureScript\(`\.\/collaboration\.js/, 'legacy collaboration must not be loaded by the test UI');
assert.match(serviceWorker, /0\.39-test\.3/, 'PWA cache must keep the stable current test build');
assert.match(serviceWorker, /PEOPLE_ASSET='0\.39-test\.3-personcard1'/, 'People module must have its own person-card cache revision');
assert.match(serviceWorker, /collaboration-v2-consistency\.js/, 'PWA cache must include consistency rules');
assert.match(serviceWorker, /collaboration-v2-multiparty\.js/, 'PWA cache must include multiparty support');

console.log('collaboration-v2 regression checks passed');
