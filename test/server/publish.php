<?php
declare(strict_types=1);

const LOG_PUBLIC_BASE = 'https://sharon.life/log/config/';
const LOG_MAX_BYTES = 750000;
const LOG_ALLOWED_ORIGINS = [
    'https://stefan-van-dijk.github.io',
    'https://sharon.life',
    'https://www.sharon.life',
];

function json_response(int $status, array $body): never {
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

function read_json_file(string $path): ?array {
    if (!is_file($path)) return null;
    $raw = file_get_contents($path);
    if (!is_string($raw) || $raw === '') return null;
    $value = json_decode($raw, true);
    return is_array($value) ? $value : null;
}

function write_json_file(string $path, array $value, int $mode = 0644): bool {
    $output = json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if (!is_string($output)) return false;
    $tmp = $path . '.' . bin2hex(random_bytes(6)) . '.tmp';
    if (file_put_contents($tmp, $output . PHP_EOL, LOCK_EX) === false) return false;
    @chmod($tmp, $mode);
    if (!rename($tmp, $path)) { @unlink($tmp); return false; }
    @chmod($path, $mode);
    return true;
}

function archive_current(string $path, string $historyRoot, string $id, int $revision): void {
    if (!is_file($path)) return;
    $raw = file_get_contents($path);
    if (!is_string($raw) || $raw === '') return;
    $historyDir = $historyRoot . '/' . $id;
    if (!is_dir($historyDir) && !mkdir($historyDir, 0755, true)) json_response(500, ['error' => 'Versiehistorie kon niet worden aangemaakt.']);
    $historyPath = $historyDir . '/rev-' . str_pad((string)max(1, $revision), 4, '0', STR_PAD_LEFT) . '.json';
    if (!is_file($historyPath) && file_put_contents($historyPath, $raw, LOCK_EX) === false) json_response(500, ['error' => 'Vorige revisie kon niet worden bewaard.']);
    @chmod($historyPath, 0644);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, LOG_ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Log-Publish-Key, X-Log-Collaboration, X-Log-Stop-Sharing');
    header('Access-Control-Max-Age: 600');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    if ($origin !== '' && !in_array($origin, LOG_ALLOWED_ORIGINS, true)) json_response(403, ['error' => 'Origin niet toegestaan.']);
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') json_response(405, ['error' => 'Alleen POST is toegestaan.']);
if ($origin !== '' && !in_array($origin, LOG_ALLOWED_ORIGINS, true)) json_response(403, ['error' => 'Origin niet toegestaan.']);

$secretFile = dirname(__DIR__) . '/private/publish-secret.php';
if (!is_file($secretFile)) json_response(500, ['error' => 'Publicatiesleutel ontbreekt op de server.']);
require $secretFile;
if (!defined('LOG_PUBLISH_KEY') || !is_string(LOG_PUBLISH_KEY) || strlen(LOG_PUBLISH_KEY) < 16) json_response(500, ['error' => 'Publicatiesleutel op de server is ongeldig.']);

$length = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($length > LOG_MAX_BYTES) json_response(413, ['error' => 'Configuratie is te groot.']);
$raw = file_get_contents('php://input');
if (!is_string($raw) || $raw === '' || strlen($raw) > LOG_MAX_BYTES) json_response(400, ['error' => 'Geen geldige configuratie ontvangen.']);
try {
    $data = json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
} catch (Throwable $e) {
    json_response(400, ['error' => 'JSON is ongeldig.']);
}
if (!is_array($data)) json_response(400, ['error' => 'Configuratie moet een JSON-object zijn.']);

$id = (string)($data['id'] ?? '');
if (!preg_match('/^[A-Za-z0-9_-]{12}$/', $id)) json_response(422, ['error' => 'Identifier moet exact 12 toegestane tekens bevatten.']);
if (($data['kind'] ?? '') !== 'log-config') json_response(422, ['error' => 'Alleen Log-configuraties worden geaccepteerd.']);
if (($data['schema'] ?? '') !== 'https://sharon.life/log/config/v1') json_response(422, ['error' => 'Onbekende configuratieversie.']);
$rootType = (string)($data['root']['type'] ?? '');
if (!in_array($rootType, ['location','card','theme','action'], true)) json_response(422, ['error' => 'Onbekend hoofdtype.']);
$objects = $data['objects'] ?? null;
if (!is_array($objects)) json_response(422, ['error' => 'Objectverzameling ontbreekt.']);
foreach (['locations','themes','subthemes','cards','actions'] as $collection) {
    if (!isset($objects[$collection]) || !is_array($objects[$collection])) json_response(422, ['error' => 'Collectie ontbreekt: ' . $collection]);
    if (count($objects[$collection]) > 500) json_response(422, ['error' => 'Te veel objecten in ' . $collection]);
}

$configDir = dirname(__DIR__) . '/config';
$historyRoot = $configDir . '/history';
$privateDir = dirname(__DIR__) . '/private/collaboration';
if (!is_dir($configDir) && !mkdir($configDir, 0755, true)) json_response(500, ['error' => 'Config-map kon niet worden aangemaakt.']);
if (!is_dir($historyRoot) && !mkdir($historyRoot, 0755, true)) json_response(500, ['error' => 'History-map kon niet worden aangemaakt.']);
if (!is_dir($privateDir) && !mkdir($privateDir, 0755, true)) json_response(500, ['error' => 'Samenwerkingsmap kon niet worden aangemaakt.']);

$path = $configDir . '/' . $id . '.json';
$statePath = $privateDir . '/' . $id . '.json';
$state = read_json_file($statePath) ?? [
    'collaboration' => false,
    'stopped' => false,
    'lastRevision' => 0,
    'createdAt' => null,
];

$key = header_value('X-Log-Publish-Key');
$isOwner = $key !== '' && hash_equals(LOG_PUBLISH_KEY, $key);
$collaborationHeader = strtolower(header_value('X-Log-Collaboration'));
$stopSharing = header_value('X-Log-Stop-Sharing') === '1';
if ($collaborationHeader !== '' && !in_array($collaborationHeader, ['on','off'], true)) json_response(400, ['error' => 'Ongeldige samenwerkingsinstelling.']);

if ($stopSharing) {
    if (!$isOwner) json_response(401, ['error' => 'Alleen de deler kan delen stoppen.']);
    $existing = read_json_file($path);
    $revision = is_array($existing) ? max(1, (int)($existing['revision'] ?? 1)) : max(1, (int)($state['lastRevision'] ?? 1));
    archive_current($path, $historyRoot, $id, $revision);
    if (is_file($path) && !unlink($path)) json_response(500, ['error' => 'Delen kon niet worden gestopt.']);
    $state['collaboration'] = false;
    $state['stopped'] = true;
    $state['lastRevision'] = $revision;
    $state['updatedAt'] = gmdate('c');
    if (!write_json_file($statePath, $state, 0600)) json_response(500, ['error' => 'Deelstatus kon niet worden opgeslagen.']);
    json_response(200, ['ok' => true, 'id' => $id, 'stopped' => true]);
}

if ($collaborationHeader !== '' && !$isOwner) json_response(401, ['error' => 'Alleen de deler kan samenwerken aan- of uitzetten.']);

$existingPublic = is_file($path);
$collaborationAllowed = $existingPublic && ($state['collaboration'] ?? false) === true && ($state['stopped'] ?? false) !== true;
if (!$isOwner && !$collaborationAllowed) json_response(401, ['error' => 'Publiceren op deze identifier is niet toegestaan.']);

if ($collaborationHeader === 'on') $state['collaboration'] = true;
if ($collaborationHeader === 'off') $state['collaboration'] = false;
if ($isOwner) $state['stopped'] = false;

$now = gmdate('c');
$old = read_json_file($path);
$oldRevision = is_array($old) ? max(1, (int)($old['revision'] ?? 1)) : max(0, (int)($state['lastRevision'] ?? 0));
$revision = max(1, $oldRevision + 1);
$createdAt = is_array($old) && is_string($old['createdAt'] ?? null)
    ? $old['createdAt']
    : (is_string($state['createdAt'] ?? null) ? $state['createdAt'] : $now);

if (is_file($path)) archive_current($path, $historyRoot, $id, max(1, $oldRevision));

$data['revision'] = $revision;
$data['createdAt'] = $createdAt;
$data['publishedAt'] = $now;
$data['url'] = LOG_PUBLIC_BASE . $id . '.json';
$data['sharing'] = [
    'active' => true,
    'collaboration' => ($state['collaboration'] ?? false) === true,
];

if (!write_json_file($path, $data, 0644)) json_response(500, ['error' => 'Configuratie kon niet definitief worden opgeslagen.']);

$state['stopped'] = false;
$state['lastRevision'] = $revision;
$state['createdAt'] = $createdAt;
$state['updatedAt'] = $now;
if (!write_json_file($statePath, $state, 0600)) json_response(500, ['error' => 'Samenwerkingsstatus kon niet worden opgeslagen.']);

json_response(200, [
    'ok' => true,
    'id' => $id,
    'revision' => $revision,
    'url' => LOG_PUBLIC_BASE . $id . '.json',
    'publishedAt' => $now,
    'collaboration' => ($state['collaboration'] ?? false) === true,
]);
