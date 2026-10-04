<?php
declare(strict_types=1);

const LOG_CONNECTION_MAX_BYTES = 262144;
const LOG_CONNECTION_ALLOWED_ORIGINS = [
    'https://stefan-van-dijk.github.io',
    'https://sharon.life',
    'https://www.sharon.life',
];

function out(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function valid_id(string $value): bool {
    return preg_match('/^[A-Za-z0-9_-]{12}$/', $value) === 1;
}
function header_value(string $name): string {
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string)($_SERVER[$key] ?? ''));
}
function token_hash(string $token): string {
    return hash('sha256', $token);
}
function read_json(string $path): ?array {
    if (!is_file($path)) return null;
    $raw = file_get_contents($path);
    if (!is_string($raw) || $raw === '') return null;
    $value = json_decode($raw, true);
    return is_array($value) ? $value : null;
}
function write_json(string $path, array $value): bool {
    $raw = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($raw)) return false;
    $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $raw . PHP_EOL, LOCK_EX) === false) return false;
    @chmod($tmp, 0600);
    if (!rename($tmp, $path)) { @unlink($tmp); return false; }
    @chmod($path, 0600);
    return true;
}
function auth(array $state, string $token): array {
    if (strlen($token) < 32) return ['ok' => false, 'role' => null, 'personId' => null];
    $hash = token_hash($token);
    if (!empty($state['ownerTokenHash']) && hash_equals((string)$state['ownerTokenHash'], $hash)) {
        return ['ok' => true, 'role' => 'owner', 'personId' => $state['ownerPersonId'] ?? null];
    }
    if (!empty($state['memberTokenHash']) && hash_equals((string)$state['memberTokenHash'], $hash)) {
        return ['ok' => true, 'role' => 'member', 'personId' => $state['memberPersonId'] ?? null];
    }
    return ['ok' => false, 'role' => null, 'personId' => null];
}
function public_state(string $id, array $state, array $authorization): array {
    $result = [
        'ok' => true,
        'connectionId' => $id,
        'revision' => max(0, (int)($state['revision'] ?? 0)),
        'status' => (string)($state['status'] ?? 'pending'),
        'revoked' => (bool)($state['revoked'] ?? false),
        'createdAt' => $state['createdAt'] ?? null,
        'updatedAt' => $state['updatedAt'] ?? null,
    ];
    if ($authorization['ok']) {
        $result['role'] = $authorization['role'];
        $result['ownerPersonId'] = $state['ownerPersonId'] ?? null;
        $result['memberPersonId'] = $state['memberPersonId'] ?? null;
        $result['openInvite'] = empty($state['memberPersonId']);
        if (!(bool)($state['revoked'] ?? false) && is_array($state['payload'] ?? null)) $result['payload'] = $state['payload'];
    }
    return $result;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, LOG_CONNECTION_ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Log-Access-Token');
    header('Access-Control-Max-Age: 600');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    if ($origin !== '' && !in_array($origin, LOG_CONNECTION_ALLOWED_ORIGINS, true)) out(403, ['error' => 'Origin niet toegestaan.']);
    http_response_code(204);
    exit;
}
if ($origin !== '' && !in_array($origin, LOG_CONNECTION_ALLOWED_ORIGINS, true)) out(403, ['error' => 'Origin niet toegestaan.']);

$root = dirname(__DIR__) . '/private/connections';
if (!is_dir($root) && !mkdir($root, 0700, true)) out(500, ['error' => 'Verbindingsmap kon niet worden aangemaakt.']);

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'GET') {
    $id = trim((string)($_GET['id'] ?? ''));
    if (!valid_id($id)) out(422, ['error' => 'ConnectionId moet exact 12 tekens bevatten.']);
    $state = read_json($root . '/' . $id . '.json');
    if ($state === null) out(404, ['error' => 'Verbindingsverzoek niet gevonden.']);
    $authorization = auth($state, header_value('X-Log-Access-Token'));
    if (!$authorization['ok']) out(403, ['error' => 'Geen toegang tot deze verbinding.']);
    out(200, public_state($id, $state, $authorization));
}
if ($method !== 'POST') out(405, ['error' => 'Alleen GET, POST en OPTIONS zijn toegestaan.']);

$length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($length > LOG_CONNECTION_MAX_BYTES) out(413, ['error' => 'Verbindingspayload is te groot.']);
$raw = file_get_contents('php://input');
if (!is_string($raw) || $raw === '' || strlen($raw) > LOG_CONNECTION_MAX_BYTES) out(400, ['error' => 'Geen geldige verbindingspayload ontvangen.']);
try { $body = json_decode($raw, true, 64, JSON_THROW_ON_ERROR); }
catch (Throwable $e) { out(400, ['error' => 'JSON is ongeldig.']); }
if (!is_array($body)) out(400, ['error' => 'Verbindingspayload moet een object zijn.']);

$action = strtolower(trim((string)($body['action'] ?? '')));
$id = trim((string)($body['id'] ?? ''));
if (!valid_id($id)) out(422, ['error' => 'ConnectionId moet exact 12 tekens bevatten.']);
if (!in_array($action, ['create','claim','put','revoke'], true)) out(400, ['error' => 'Onbekende verbindingsactie.']);
$path = $root . '/' . $id . '.json';
$state = read_json($path);
$token = header_value('X-Log-Access-Token');
$now = gmdate('c');

if ($action === 'create') {
    if ($state !== null) out(409, ['error' => 'Deze ConnectionId bestaat al.']);
    $ownerPersonId = trim((string)($body['ownerPersonId'] ?? ''));
    $memberPersonId = trim((string)($body['memberPersonId'] ?? ''));
    $memberToken = trim((string)($body['memberToken'] ?? ''));
    $payload = $body['payload'] ?? null;
    if (strlen($token) < 32 || strlen($memberToken) < 32) out(401, ['error' => 'Sterke toegangssleutels zijn vereist.']);
    if (!valid_id($ownerPersonId)) out(422, ['error' => 'Een geldige PersonId van de afzender is vereist.']);
    if ($memberPersonId !== '' && (!valid_id($memberPersonId) || $ownerPersonId === $memberPersonId)) out(422, ['error' => 'De PersonId van de ontvanger is ongeldig.']);
    if (!is_array($payload) || (int)($payload['v'] ?? 0) < 1 || !is_string($payload['data'] ?? null)) out(422, ['error' => 'Versleutelde verbindingsinhoud ontbreekt.']);
    $state = [
        'ownerPersonId' => $ownerPersonId,
        'memberPersonId' => $memberPersonId !== '' ? $memberPersonId : null,
        'ownerTokenHash' => token_hash($token),
        'memberTokenHash' => token_hash($memberToken),
        'revision' => 1,
        'status' => 'pending',
        'revoked' => false,
        'payload' => $payload,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    if (!write_json($path, $state)) out(500, ['error' => 'Verbindingsverzoek kon niet worden opgeslagen.']);
    out(200, public_state($id, $state, auth($state, $token)));
}

if ($state === null) out(404, ['error' => 'Verbindingsverzoek niet gevonden.']);
$authorization = auth($state, $token);
if (!$authorization['ok']) out(403, ['error' => 'Geen toegang tot deze verbinding.']);

if ($action === 'claim') {
    if ((bool)($state['revoked'] ?? false)) out(410, ['error' => 'Deze verbinding is verbroken.']);
    if ($authorization['role'] !== 'member') out(403, ['error' => 'Alleen de ontvanger kan deze uitnodiging bevestigen.']);
    $memberPersonId = trim((string)($body['memberPersonId'] ?? ''));
    if (!valid_id($memberPersonId) || $memberPersonId === (string)($state['ownerPersonId'] ?? '')) out(422, ['error' => 'Een andere geldige PersonId van de ontvanger is vereist.']);
    $currentMember = trim((string)($state['memberPersonId'] ?? ''));
    if ($currentMember !== '' && $currentMember !== $memberPersonId) out(409, ['error' => 'Deze uitnodiging is al door een andere Log-identiteit bevestigd.']);
    if ($currentMember === '') {
        $state['memberPersonId'] = $memberPersonId;
        $state['revision'] = max(0, (int)($state['revision'] ?? 0)) + 1;
        $state['updatedAt'] = $now;
        if (!write_json($path, $state)) out(500, ['error' => 'Ontvanger kon niet aan de verbinding worden gekoppeld.']);
    }
    out(200, public_state($id, $state, auth($state, $token)));
}

if ($action === 'put') {
    if ((bool)($state['revoked'] ?? false)) out(410, ['error' => 'Deze verbinding is verbroken.']);
    $baseRevision = max(0, (int)($body['baseRevision'] ?? 0));
    $currentRevision = max(0, (int)($state['revision'] ?? 0));
    if ($baseRevision !== $currentRevision) out(409, ['error' => 'Er staat inmiddels een nieuwere verbindingsstatus online.', 'revision' => $currentRevision]);
    $payload = $body['payload'] ?? null;
    $status = strtolower(trim((string)($body['status'] ?? '')));
    if (!is_array($payload) || (int)($payload['v'] ?? 0) < 1 || !is_string($payload['data'] ?? null)) out(422, ['error' => 'Versleutelde verbindingsinhoud ontbreekt.']);
    if (!in_array($status, ['pending','connected','rejected'], true)) out(422, ['error' => 'Ongeldige verbindingsstatus.']);
    if ($authorization['role'] === 'owner' && $status === 'connected' && ($state['status'] ?? '') !== 'connected') out(403, ['error' => 'De ontvanger moet de verbinding bevestigen.']);
    if ($authorization['role'] === 'member' && $status === 'connected' && empty($state['memberPersonId'])) out(409, ['error' => 'Bevestig eerst welke Log-identiteit deze uitnodiging accepteert.']);
    $state['payload'] = $payload;
    $state['status'] = $status;
    $state['revision'] = $currentRevision + 1;
    $state['updatedAt'] = $now;
    if (!write_json($path, $state)) out(500, ['error' => 'Verbindingsstatus kon niet worden opgeslagen.']);
    out(200, public_state($id, $state, $authorization));
}

if ($action === 'revoke') {
    $state['revoked'] = true;
    $state['status'] = 'revoked';
    $state['payload'] = null;
    $state['revision'] = max(0, (int)($state['revision'] ?? 0)) + 1;
    $state['revokedByPersonId'] = $authorization['personId'];
    $state['revokedAt'] = $now;
    $state['updatedAt'] = $now;
    if (!write_json($path, $state)) out(500, ['error' => 'Verbinding kon niet worden verbroken.']);
    out(200, public_state($id, $state, $authorization));
}

out(500, ['error' => 'Onverwachte verbindingsstatus.']);
