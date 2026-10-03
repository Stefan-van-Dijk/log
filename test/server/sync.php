<?php
declare(strict_types=1);

const LOG_SYNC_MAX_BYTES = 6000000;
const LOG_SYNC_ALLOWED_ORIGINS = [
    'https://stefan-van-dijk.github.io',
    'https://sharon.life',
    'https://www.sharon.life',
];
const LOG_SYNC_RIGHTS = ['view','use','write','share','copy','offline','accept'];

function out(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function header_value(string $name): string {
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string)($_SERVER[$key] ?? ''));
}
function valid_id(string $value): bool { return preg_match('/^[A-Za-z0-9_-]{12}$/', $value) === 1; }
function read_json(string $path): ?array {
    if (!is_file($path)) return null;
    $raw = file_get_contents($path);
    if (!is_string($raw) || $raw === '') return null;
    $value = json_decode($raw, true);
    return is_array($value) ? $value : null;
}
function write_json(string $path, array $value, int $mode = 0600): bool {
    $raw = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($raw)) return false;
    $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $raw . PHP_EOL, LOCK_EX) === false) return false;
    @chmod($tmp, $mode);
    if (!rename($tmp, $path)) { @unlink($tmp); return false; }
    @chmod($path, $mode);
    return true;
}
function token_hash(string $token): string { return hash('sha256', $token); }
function normalize_rights($rights): array {
    $input = is_array($rights) ? $rights : [];
    return array_values(array_intersect(LOG_SYNC_RIGHTS, array_values(array_unique(array_map('strval', $input)))));
}
function auth(array $state, string $token): array {
    if ($token === '') return ['ok' => false, 'owner' => false, 'rights' => [], 'memberHash' => null, 'personId' => null];
    $hash = token_hash($token);
    $ownerHash = (string)($state['ownerTokenHash'] ?? '');
    if ($ownerHash !== '' && hash_equals($ownerHash, $hash)) {
        return ['ok' => true, 'owner' => true, 'rights' => LOG_SYNC_RIGHTS, 'memberHash' => null, 'personId' => $state['ownerPersonId'] ?? null];
    }
    $members = is_array($state['members'] ?? null) ? $state['members'] : [];
    $member = $members[$hash] ?? null;
    if (!is_array($member)) return ['ok' => false, 'owner' => false, 'rights' => [], 'memberHash' => null, 'personId' => null];
    return [
        'ok' => true,
        'owner' => false,
        'rights' => normalize_rights($member['rights'] ?? []),
        'memberHash' => $hash,
        'personId' => valid_id((string)($member['personId'] ?? '')) ? (string)$member['personId'] : null,
    ];
}
function require_right(array $auth, string $right): void {
    if (!$auth['ok'] || (!$auth['owner'] && !in_array($right, $auth['rights'], true))) out(403, ['error' => 'Deze handeling is niet toegestaan voor deze deelnemer.']);
}
function acknowledgement_rows(array $state): array {
    $acks = is_array($state['acknowledgements'] ?? null) ? $state['acknowledgements'] : [];
    $members = is_array($state['members'] ?? null) ? $state['members'] : [];
    $rows = [];
    foreach ($acks as $hash => $ack) {
        if (!is_array($ack)) continue;
        $member = $members[$hash] ?? null;
        if (!is_array($member)) continue;
        $personId = (string)($member['personId'] ?? '');
        if (!valid_id($personId)) continue;
        $status = (string)($ack['status'] ?? '');
        if (!in_array($status, ['accepted','rejected'], true)) continue;
        $rows[] = ['personId' => $personId, 'status' => $status, 'at' => $ack['at'] ?? null];
    }
    return $rows;
}
function state_public(string $id, array $state, ?array $payload = null, ?array $authorization = null): array {
    $result = [
        'ok' => true,
        'id' => $id,
        'kind' => (string)($state['kind'] ?? ''),
        'revision' => max(0, (int)($state['revision'] ?? 0)),
        'active' => (bool)($state['active'] ?? false),
        'offline' => (bool)($state['offline'] ?? false),
        'revoked' => (bool)($state['revoked'] ?? false),
        'participantCount' => count(is_array($state['members'] ?? null) ? $state['members'] : []),
        'updatedAt' => $state['updatedAt'] ?? null,
    ];
    if ($payload !== null) $result['payload'] = $payload;
    if (is_array($authorization) && ($authorization['ok'] ?? false)) {
        $result['rights'] = $authorization['owner'] ? LOG_SYNC_RIGHTS : normalize_rights($authorization['rights'] ?? []);
        $result['role'] = $authorization['owner'] ? 'owner' : 'member';
        if ($authorization['owner']) {
            $result['acknowledgements'] = acknowledgement_rows($state);
        } elseif (!empty($authorization['memberHash'])) {
            $ack = $state['acknowledgements'][$authorization['memberHash']] ?? null;
            if (is_array($ack)) $result['acknowledgement'] = ['status' => $ack['status'] ?? null, 'at' => $ack['at'] ?? null];
        }
    }
    return $result;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, LOG_SYNC_ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Log-Access-Token');
    header('Access-Control-Max-Age: 600');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    if ($origin !== '' && !in_array($origin, LOG_SYNC_ALLOWED_ORIGINS, true)) out(403, ['error' => 'Origin niet toegestaan.']);
    http_response_code(204);
    exit;
}
if ($origin !== '' && !in_array($origin, LOG_SYNC_ALLOWED_ORIGINS, true)) out(403, ['error' => 'Origin niet toegestaan.']);

$root = dirname(__DIR__) . '/private/sync';
$stateDir = $root . '/state';
$payloadDir = $root . '/payload';
if (!is_dir($stateDir) && !mkdir($stateDir, 0700, true)) out(500, ['error' => 'Syncstatus-map kon niet worden aangemaakt.']);
if (!is_dir($payloadDir) && !mkdir($payloadDir, 0700, true)) out(500, ['error' => 'Syncpayload-map kon niet worden aangemaakt.']);

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'GET') {
    $id = trim((string)($_GET['id'] ?? ''));
    if (!valid_id($id)) out(422, ['error' => 'Identifier moet exact 12 toegestane tekens bevatten.']);
    $state = read_json($stateDir . '/' . $id . '.json');
    if ($state === null) out(404, ['error' => 'Synchronisatiebron niet gevonden.']);
    $authorization = auth($state, header_value('X-Log-Access-Token'));
    if ((bool)($state['revoked'] ?? false)) out(200, state_public($id, $state, null, $authorization));
    if ((bool)($state['offline'] ?? false) || !(bool)($state['active'] ?? false)) out(200, state_public($id, $state, null, $authorization));
    $payloadDoc = read_json($payloadDir . '/' . $id . '.json');
    $payload = is_array($payloadDoc['payload'] ?? null) ? $payloadDoc['payload'] : null;
    out(200, state_public($id, $state, $payload, $authorization));
}
if ($method !== 'POST') out(405, ['error' => 'Alleen GET, POST en OPTIONS zijn toegestaan.']);

$length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($length > LOG_SYNC_MAX_BYTES) out(413, ['error' => 'Synchronisatiepayload is te groot.']);
$raw = file_get_contents('php://input');
if (!is_string($raw) || $raw === '' || strlen($raw) > LOG_SYNC_MAX_BYTES) out(400, ['error' => 'Geen geldige synchronisatiepayload ontvangen.']);
try { $body = json_decode($raw, true, 128, JSON_THROW_ON_ERROR); }
catch (Throwable $e) { out(400, ['error' => 'JSON is ongeldig.']); }
if (!is_array($body)) out(400, ['error' => 'Synchronisatiepayload moet een JSON-object zijn.']);

$action = strtolower(trim((string)($body['action'] ?? '')));
$id = trim((string)($body['id'] ?? ''));
if (!valid_id($id)) out(422, ['error' => 'Identifier moet exact 12 toegestane tekens bevatten.']);
if (!in_array($action, ['put','offline','reactivate','revoke','member','remove-member','accept','reject'], true)) out(400, ['error' => 'Onbekende synchronisatieactie.']);
$token = header_value('X-Log-Access-Token');
$statePath = $stateDir . '/' . $id . '.json';
$payloadPath = $payloadDir . '/' . $id . '.json';
$state = read_json($statePath);
$now = gmdate('c');

if ($action === 'put' && $state === null) {
    if (strlen($token) < 32) out(401, ['error' => 'Een sterke toegangssleutel is vereist om deze bron aan te maken.']);
    $kind = trim((string)($body['kind'] ?? ''));
    if (!in_array($kind, ['person-backup','collaboration','task','vehicle','conversation'], true)) out(422, ['error' => 'Onbekend synchronisatietype.']);
    $payload = $body['payload'] ?? null;
    if (!is_array($payload) || (int)($payload['v'] ?? 0) < 1 || !is_string($payload['data'] ?? null)) out(422, ['error' => 'Versleutelde payload ontbreekt of is ongeldig.']);
    $state = [
        'kind' => $kind,
        'ownerPersonId' => valid_id((string)($body['ownerPersonId'] ?? '')) ? (string)$body['ownerPersonId'] : null,
        'ownerTokenHash' => token_hash($token),
        'members' => [],
        'acknowledgements' => [],
        'revision' => 1,
        'active' => true,
        'offline' => false,
        'revoked' => false,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    if (!write_json($payloadPath, ['revision' => 1, 'payload' => $payload, 'updatedAt' => $now])) out(500, ['error' => 'Versleutelde payload kon niet worden opgeslagen.']);
    if (!write_json($statePath, $state)) out(500, ['error' => 'Synchronisatiestatus kon niet worden opgeslagen.']);
    out(200, state_public($id, $state, null, auth($state, $token)));
}
if ($state === null) out(404, ['error' => 'Synchronisatiebron niet gevonden.']);
if ((bool)($state['revoked'] ?? false)) out(410, ['error' => 'Deze samenwerking of back-up is ingetrokken.']);
$authorization = auth($state, $token);

if ($action === 'put') {
    require_right($authorization, 'write');
    $baseRevision = max(0, (int)($body['baseRevision'] ?? 0));
    $currentRevision = max(0, (int)($state['revision'] ?? 0));
    if ($baseRevision !== $currentRevision) out(409, ['error' => 'Er staat inmiddels een nieuwere revisie online.', 'revision' => $currentRevision]);
    $payload = $body['payload'] ?? null;
    if (!is_array($payload) || (int)($payload['v'] ?? 0) < 1 || !is_string($payload['data'] ?? null)) out(422, ['error' => 'Versleutelde payload ontbreekt of is ongeldig.']);
    $revision = $currentRevision + 1;
    if (!write_json($payloadPath, ['revision' => $revision, 'payload' => $payload, 'updatedAt' => $now])) out(500, ['error' => 'Versleutelde payload kon niet worden opgeslagen.']);
    $state['revision'] = $revision;$state['active'] = true;$state['offline'] = false;$state['updatedAt'] = $now;
    if (!write_json($statePath, $state)) out(500, ['error' => 'Synchronisatiestatus kon niet worden opgeslagen.']);
    out(200, state_public($id, $state, null, $authorization));
}
if ($action === 'offline') {
    require_right($authorization, 'offline');
    if (is_file($payloadPath) && !unlink($payloadPath)) out(500, ['error' => 'Online payload kon niet worden verwijderd.']);
    $state['active'] = false;$state['offline'] = true;$state['updatedAt'] = $now;
    if (!write_json($statePath, $state)) out(500, ['error' => 'Synchronisatiestatus kon niet worden opgeslagen.']);
    out(200, state_public($id, $state, null, $authorization));
}
if ($action === 'reactivate') {
    require_right($authorization, 'write');
    out(409, ['error' => 'Heractiveren vereist een nieuwe versleutelde payload via action=put.']);
}
if ($action === 'revoke') {
    if (!$authorization['owner']) out(403, ['error' => 'Alleen de eigenaar kan de volledige samenwerking beëindigen.']);
    if (is_file($payloadPath)) @unlink($payloadPath);
    $state['active'] = false;$state['offline'] = false;$state['revoked'] = true;$state['members'] = [];$state['updatedAt'] = $now;
    if (!write_json($statePath, $state)) out(500, ['error' => 'Intrekking kon niet worden opgeslagen.']);
    out(200, state_public($id, $state, null, $authorization));
}
if ($action === 'member') {
    if (!$authorization['owner']) out(403, ['error' => 'Alleen de eigenaar kan deelnemers toevoegen of rechten wijzigen.']);
    $memberToken = trim((string)($body['memberToken'] ?? ''));
    $personId = trim((string)($body['personId'] ?? ''));
    if (strlen($memberToken) < 32 || !valid_id($personId)) out(422, ['error' => 'Geldige deelnemer en toegangssleutel zijn vereist.']);
    $rights = normalize_rights($body['rights'] ?? []);
    $hash = token_hash($memberToken);
    $state['members'] = is_array($state['members'] ?? null) ? $state['members'] : [];
    $state['members'][$hash] = ['personId' => $personId, 'rights' => $rights, 'updatedAt' => $now];
    $state['updatedAt'] = $now;
    if (!write_json($statePath, $state)) out(500, ['error' => 'Deelnemer kon niet worden opgeslagen.']);
    out(200, state_public($id, $state, null, $authorization));
}
if ($action === 'remove-member') {
    if (!$authorization['owner']) out(403, ['error' => 'Alleen de eigenaar kan deelnemers verwijderen.']);
    $personId = trim((string)($body['personId'] ?? ''));
    if (!valid_id($personId)) out(422, ['error' => 'Ongeldige PersonId.']);
    $members = is_array($state['members'] ?? null) ? $state['members'] : [];
    $acks = is_array($state['acknowledgements'] ?? null) ? $state['acknowledgements'] : [];
    foreach ($members as $hash => $member) {
        if (is_array($member) && (string)($member['personId'] ?? '') === $personId) { unset($members[$hash]); unset($acks[$hash]); }
    }
    $state['members'] = $members;$state['acknowledgements'] = $acks;$state['updatedAt'] = $now;
    if (!write_json($statePath, $state)) out(500, ['error' => 'Deelnemer kon niet worden verwijderd.']);
    out(200, state_public($id, $state, null, $authorization));
}
if ($action === 'accept' || $action === 'reject') {
    require_right($authorization, 'accept');
    if ($authorization['owner'] || empty($authorization['memberHash'])) out(409, ['error' => 'Acceptatie is bedoeld voor een deelnemer aan deze registratie.']);
    $state['acknowledgements'] = is_array($state['acknowledgements'] ?? null) ? $state['acknowledgements'] : [];
    $state['acknowledgements'][$authorization['memberHash']] = ['status' => $action === 'accept' ? 'accepted' : 'rejected', 'at' => $now];
    $state['updatedAt'] = $now;
    if (!write_json($statePath, $state)) out(500, ['error' => 'Acceptatiestatus kon niet worden opgeslagen.']);
    out(200, state_public($id, $state, null, $authorization));
}

out(500, ['error' => 'Onverwachte synchronisatiestatus.']);
