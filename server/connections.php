<?php
declare(strict_types=1);

// Shared extension of Log's existing connections endpoint. One locked JSON
// document records identity, access grants and chats; no database is required.
final class LogNetworkError extends RuntimeException {
    public function __construct(public readonly string $reason, public readonly int $status = 400) {
        parent::__construct($reason);
    }
}
final class LogNetwork {
    private array $state;
    public function __construct(private string $path, private ?int $clock = null) {}
    public static function token(int $bytes = 32): string {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }
    public static function id(): string { return self::token(9); }
    private function now(): int { return $this->clock ?? time(); }
    private static function validId(mixed $id): string {
        if (!is_string($id) || !preg_match('/\A[A-Za-z0-9_-]{12}\z/', $id)) throw new LogNetworkError('invalid_id');
        return $id;
    }
    private static function hashToken(mixed $token): string {
        if (!is_string($token) || !preg_match('/\A[A-Za-z0-9_-]{43}\z/', $token)) throw new LogNetworkError('invalid_token');
        return hash('sha256', $token);
    }
    private static function emptyState(): array {
        return ['schema'=>'sharon-network-v1','id'=>self::id(),'ownerId'=>null,'bootstrap'=>null,
            'people'=>[],'relations'=>[],'invitations'=>[],'messages'=>[],'nextSeq'=>0,'rates'=>[]];
    }
    private function transaction(callable $change): mixed {
        $directory = dirname($this->path);
        if (!is_dir($directory) && !mkdir($directory,0700,true) && !is_dir($directory)) throw new RuntimeException('Storage unavailable');
        if (is_link($this->path) || is_link($this->path.'.lock')) throw new RuntimeException('Invalid storage');
        $lock = fopen($this->path.'.lock','c');
        if (!$lock) throw new RuntimeException('Lock unavailable');
        @chmod($this->path.'.lock',0600);
        try {
            if (!flock($lock,LOCK_EX)) throw new RuntimeException('Lock unavailable');
            // A sidecar lock stays valid when write_json atomically renames the
            // data file. Never lock only the inode that is about to be replaced.
            $exists = is_file($this->path);
            if ($exists) {
                $raw = file_get_contents($this->path);
                $this->state = json_decode($raw, true, 128, JSON_THROW_ON_ERROR);
                if (($this->state['schema'] ?? '') !== 'sharon-network-v1' ||
                    !is_array($this->state['people'] ?? null) || !is_array($this->state['relations'] ?? null) ||
                    !is_array($this->state['invitations'] ?? null) || !is_array($this->state['messages'] ?? null))
                    throw new RuntimeException('Invalid network document');
            } else $this->state = self::emptyState();
            $before = $this->state;
            $result = $change();
            if (!$exists || $before !== $this->state) {
                $stored=$this->state;
                foreach (['people','relations','invitations','messages','rates'] as $map) $stored[$map]=(object)$stored[$map];
                if (!write_json($this->path,$stored)) throw new RuntimeException('Commit failed');
            }
            return $result;
        } finally { flock($lock,LOCK_UN); fclose($lock); }
    }
    private function grant(string $personId): ?array {
        foreach ($this->state['relations'] as $r) if ($r['type']==='grants-access' && $r['toId']===$personId) return $r;
        return null;
    }
    private function line(string $personId): ?int {
        if ($personId === $this->state['ownerId']) return 0;
        if (!$this->grant($personId)) return null;
        $seen=[]; $current=$personId; $line=0;
        while ($current !== $this->state['ownerId']) {
            if (isset($seen[$current]) || ++$line>3) throw new RuntimeException('Invalid access path');
            $seen[$current]=true; $r=$this->grant($current);
            if (!$r) throw new RuntimeException('Incomplete access path');
            $current=$r['fromId'];
        }
        return $line;
    }
    private function peopleCount(): int {
        return count(array_filter($this->state['relations'],fn($r)=>$r['type']==='grants-access'));
    }
    private function person(mixed $token): array {
        $hash=self::hashToken($token);
        foreach ($this->state['people'] as $p) {
            if (!hash_equals($p['tokenHash'],$hash)) continue;
            $grant=$this->grant($p['id']);
            if ($grant && $grant['status']!=='active') break;
            return $p;
        }
        throw new LogNetworkError('unauthorized',401);
    }
    private function member(array $p): void {
        if ($this->line($p['id'])===null) throw new LogNetworkError('invitation_required',403);
    }
    private function selfData(array $p): array {
        return ['personId'=>$p['id'],'name'=>$p['name'],'networkId'=>$this->state['id'],'line'=>$this->line($p['id'])];
    }
    private function relation(string $from, string $to, string $type): array {
        do { $id=self::id(); } while (isset($this->state['relations'][$id]));
        return ['id'=>$id,'fromId'=>$from,'toId'=>$to,'type'=>$type,'status'=>'active'];
    }
    public function start(): array {
        // Called only after verifying the existing Log publication key.
        return $this->transaction(function () {
            if ($this->state['ownerId']!==null) throw new LogNetworkError('already_activated',409);
            $token=self::token(); $until=$this->now()+900;
            $this->state['bootstrap']=['hash'=>self::hashToken($token),'until'=>$until,'claimedBy'=>null];
            return ['v'=>1,'kind'=>'bootstrap','networkId'=>$this->state['id'],'token'=>$token,'expiresAt'=>$until*1000];
        });
    }
    private function rate(string $bucket, int $limit, int $seconds): void {
        $r=$this->state['rates'][$bucket] ?? null;
        if (!$r || $r['until']<=$this->now()) $r=['count'=>0,'until'=>$this->now()+$seconds];
        if ($r['count'] >= $limit) throw new LogNetworkError('rate_limit',429);
        $r['count']++; $this->state['rates'][$bucket]=$r;
    }
    public function throttle(string $ip, ?string $token, bool $registration): void {
        $this->transaction(function () use ($ip,$token,$registration) {
            foreach ($this->state['rates'] as $key=>$r) if ($r['until']<=$this->now()) unset($this->state['rates'][$key]);
            $this->rate('ip:'.hash('sha256',$ip),600,60);
            if ($registration) $this->rate('registration:'.hash('sha256',$ip),180,3600);
            if ($token) $this->rate('credential:'.hash('sha256',$token),120,60);
        });
    }
    public function handle(string $action, array $in, ?string $auth): array {
        return $this->transaction(function () use ($action,$in,$auth) {
            if ($action==='register') {
                $id=self::validId($in['personId'] ?? null); $hash=self::hashToken($in['deviceToken'] ?? null);
                $name=$in['name'] ?? '';
                if (!is_string($name) || strlen($name)>240 || !preg_match('//u',$name) || trim($name)==='' ||
                    preg_match('/[\x00-\x1f\x7f]/',$name)) throw new LogNetworkError('invalid_name');
                $old=$this->state['people'][$id] ?? null;
                if ($old && !hash_equals($old['tokenHash'],$hash)) throw new LogNetworkError('identity_exists',409);
                if (!$old) {
                    if (count($this->state['people'])>=10000) throw new LogNetworkError('capacity',409);
                    foreach ($this->state['people'] as $p) if (hash_equals($p['tokenHash'],$hash)) throw new LogNetworkError('identity_exists',409);
                    $this->state['people'][$id]=['id'=>$id,'name'=>trim($name),'tokenHash'=>$hash];
                }
                return ['self'=>$this->selfData($this->person($in['deviceToken']))];
            }
            $p=$this->person($auth); $pid=$p['id'];
            if ($action==='bootstrap' || $action==='accept') {
                if (self::validId($in['networkId'] ?? null)!==$this->state['id']) throw new LogNetworkError('wrong_network',403);
                $hash=self::hashToken($in['token'] ?? null);
                if ($action==='bootstrap') {
                    $start=$this->state['bootstrap'];
                    if (!$start || !hash_equals($start['hash'],$hash)) throw new LogNetworkError('invalid_invitation',403);
                    if ($this->state['ownerId']!==null && $this->state['ownerId']!==$pid) throw new LogNetworkError('invitation_used',409);
                    if ($this->state['ownerId']===null) {
                        if ($start['until']<=$this->now()) throw new LogNetworkError('invitation_expired',410);
                        $this->state['ownerId']=$pid; $this->state['bootstrap']['claimedBy']=$pid;
                    }
                } else {
                    $invite=$this->state['invitations'][$hash] ?? null;
                    if (!$invite || ($invite['recipientId']!==null && $invite['recipientId']!==$pid) || $invite['issuerId']===$pid) throw new LogNetworkError('invalid_invitation',403);
                    $issuer=$this->state['people'][$invite['issuerId']] ?? null;
                    $grant=$issuer ? $this->grant($issuer['id']) : null;
                    if (!$issuer || ($grant && $grant['status']!=='active') || $this->line($issuer['id'])===null)
                        throw new LogNetworkError('invalid_invitation',403);
                    if ($invite['claimedAt']===null) {
                        if ($invite['until']<=$this->now()) throw new LogNetworkError('invitation_expired',410);
                        if ($this->line($pid)===null) {
                            if ($this->line($issuer['id'])>=3) throw new LogNetworkError('depth_limit',403);
                            if ($this->peopleCount()>=100) throw new LogNetworkError('capacity',409);
                            $r=$this->relation($issuer['id'],$pid,'grants-access');
                            $this->state['relations'][$r['id']]=$r;
                        }
                        $pair=[$issuer['id'],$pid]; sort($pair,SORT_STRING); $exists=false;
                        foreach ($this->state['relations'] as $r) if ($r['type']==='chat' && [$r['fromId'],$r['toId']]===$pair) $exists=true;
                        if (!$exists) { $r=$this->relation($pair[0],$pair[1],'chat'); $this->state['relations'][$r['id']]=$r; }
                        $this->state['invitations'][$hash]['recipientId']=$pid;
                        $this->state['invitations'][$hash]['claimedAt']=$this->now();
                    }
                }
                $contact=null;
                if ($action==='accept') foreach ($this->state['relations'] as $r) {
                    if ($r['type']==='chat' && in_array($pid,[$r['fromId'],$r['toId']],true) &&
                        in_array($issuer['id'],[$r['fromId'],$r['toId']],true))
                        $contact=['chatId'=>$r['id'],'personId'=>$issuer['id'],'name'=>$issuer['name']];
                }
                return ['self'=>$this->selfData($this->person($auth)),'contact'=>$contact];
            }
            if ($action==='self') return ['self'=>$this->selfData($p)];
            $this->member($p);
            if ($action==='set-access') {
                if ($pid!==$this->state['ownerId']) throw new LogNetworkError('owner_required',403);
                $target=self::validId($in['personId'] ?? null); $status=$in['status'] ?? null;
                if (!in_array($status,['active','revoked'],true)) throw new LogNetworkError('invalid_status');
                $r=$this->grant($target); if (!$r) throw new LogNetworkError('recipient_unknown',404);
                $this->state['relations'][$r['id']]['status']=$status;
                return ['ok'=>true];
            }
            if ($action==='invite') {
                $recipient=isset($in['recipientId']) ? self::validId($in['recipientId']) : null;
                $grant=$recipient ? $this->grant($recipient) : null;
                if ($recipient!==null && ($recipient===$pid || !isset($this->state['people'][$recipient]) || ($grant && $grant['status']!=='active')))
                    throw new LogNetworkError('recipient_unknown',404);
                if ($recipient!==null && $this->line($recipient)===null) {
                    if ($this->line($pid)>=3) throw new LogNetworkError('depth_limit',403);
                    if ($this->peopleCount()>=100) throw new LogNetworkError('capacity',409);
                }
                $token=self::token(); $until=$this->now()+86400;
                $this->state['invitations'][self::hashToken($token)]=['issuerId'=>$pid,'recipientId'=>$recipient,'until'=>$until,'claimedAt'=>null];
                return ['invitation'=>['v'=>1,'kind'=>'invite','networkId'=>$this->state['id'],
                    'token'=>$token,'expiresAt'=>$until*1000,...($recipient ? ['recipientId'=>$recipient] : [])]];
            }
            if ($action==='invite-status') {
                $invite=$this->state['invitations'][self::hashToken($in['token'] ?? null)] ?? null;
                if (!$invite || $invite['issuerId']!==$pid) throw new LogNetworkError('invalid_invitation',403);
                if ($invite['claimedAt']===null) return ['claimed'=>false,'expired'=>$invite['until']<=$this->now()];
                $other=$invite['recipientId']; $grant=$this->grant($other);
                if ($grant && $grant['status']!=='active') throw new LogNetworkError('unauthorized',403);
                foreach ($this->state['relations'] as $r) {
                    if ($r['type']==='chat' && $r['status']==='active' &&
                        in_array($pid,[$r['fromId'],$r['toId']],true) && in_array($other,[$r['fromId'],$r['toId']],true))
                        return ['claimed'=>true,'contact'=>['chatId'=>$r['id'],'personId'=>$other,'name'=>$this->state['people'][$other]['name']]];
                }
                throw new LogNetworkError('chat_forbidden',403);
            }
            if ($action==='contacts') {
                $contacts=[];
                foreach ($this->state['relations'] as $r) {
                    if ($r['type']!=='chat' || $r['status']!=='active' || !in_array($pid,[$r['fromId'],$r['toId']],true)) continue;
                    $other=$r['fromId']===$pid ? $r['toId'] : $r['fromId']; $grant=$this->grant($other);
                    if ($grant && $grant['status']!=='active') continue;
                    $contacts[]=['chatId'=>$r['id'],'personId'=>$other,'name'=>$this->state['people'][$other]['name']];
                }
                usort($contacts,fn($a,$b)=>[$a['name'],$a['personId']]<=>[$b['name'],$b['personId']]);
                return ['contacts'=>$contacts];
            }
            if ($action==='messages' || $action==='send') {
                $chatId=self::validId($in['chatId'] ?? null); $chat=$this->state['relations'][$chatId] ?? null;
                if (!$chat || $chat['type']!=='chat' || $chat['status']!=='active' || !in_array($pid,[$chat['fromId'],$chat['toId']],true))
                    throw new LogNetworkError('chat_forbidden',403);
                $other=$chat['fromId']===$pid ? $chat['toId'] : $chat['fromId']; $grant=$this->grant($other);
                if ($grant && $grant['status']!=='active') throw new LogNetworkError('chat_forbidden',403);
                if ($action==='send') {
                    $id=self::validId($in['id'] ?? null); $text=$in['text'] ?? '';
                    if (!is_string($text) || !preg_match('//u',$text) || trim($text)==='' || strlen($text)>8000 ||
                        preg_match('/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/',$text)) throw new LogNetworkError('invalid_message');
                    $old=$this->state['messages'][$id] ?? null;
                    if ($old && ($old['chatId']!==$chatId || $old['senderId']!==$pid || $old['text']!==$text))
                        throw new LogNetworkError('message_conflict',409);
                    if (!$old) $this->state['messages'][$id]=['id'=>$id,'chatId'=>$chatId,'senderId'=>$pid,
                        'text'=>$text,'seq'=>++$this->state['nextSeq'],'at'=>$this->now()*1000];
                    return ['message'=>$this->state['messages'][$id]];
                }
                $after=$in['after'] ?? 0;
                if (!is_int($after) || $after<0) throw new LogNetworkError('invalid_cursor');
                $messages=array_values(array_filter($this->state['messages'],fn($m)=>$m['chatId']===$chatId && $m['seq']>$after));
                usort($messages,fn($a,$b)=>$a['seq']<=>$b['seq']);
                return ['messages'=>array_slice($messages,0,100)];
            }
            throw new LogNetworkError('unknown_action',404);
        });
    }
}

function log_network_request(array $body, string $root, string $raw): never {
    ini_set('display_errors','0');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    $secure=in_array($_SERVER['HTTPS'] ?? '',['on','1'],true);
    $local=PHP_SAPI==='cli-server' && in_array($_SERVER['REMOTE_ADDR'] ?? '',['127.0.0.1','::1'],true);
    if (!$secure && !$local) out(400,['error'=>'https_required']);
    if (strlen($raw)>16384) out(413,['error'=>'request_too_large']);
    if (strtolower(trim(explode(';',$_SERVER['CONTENT_TYPE'] ?? '')[0]))!=='application/json') out(415,['error'=>'json_required']);
    if (!is_string($body['action'] ?? null)) out(400,['error'=>'unknown_action']);
    try {
        // The existing private directory must not be served by the webserver.
        // Strato uses Apache; add the deny rule without replacing existing rules.
        $deny=$root.'/.htaccess';
        if (!is_file($deny) && file_put_contents($deny,"Require all denied\n",LOCK_EX)===false) throw new RuntimeException('Private storage unavailable');
        $service=new LogNetwork($root.'/network-v1.json');
        $token=header_value('X-Log-Access-Token') ?: null;
        $service->throttle($_SERVER['REMOTE_ADDR'] ?? 'unknown',$token,$body['action']==='register');
        if ($body['action']==='start') {
            $secret=dirname(__DIR__).'/private/publish-secret.php';
            if (!is_file($secret)) out(503,['error'=>'not_configured']);
            require_once $secret;
            $key=header_value('X-Log-Publish-Key');
            if (!defined('LOG_PUBLISH_KEY') || !is_string(LOG_PUBLISH_KEY) || strlen(LOG_PUBLISH_KEY)<16) out(503,['error'=>'not_configured']);
            if ($key==='' || !hash_equals(LOG_PUBLISH_KEY,$key)) out(401,['error'=>'invalid_publish_key']);
            out(200,['invitation'=>$service->start()]);
        }
        out(200,$service->handle($body['action'],$body,$token));
    } catch (LogNetworkError $e) { out($e->status,['error'=>$e->reason]); }
    catch (Throwable $e) { out(503,['error'=>'service_unavailable']); }
}


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

if (defined('LOG_CONNECTION_LIBRARY_ONLY')) return;

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, LOG_CONNECTION_ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Log-Access-Token, X-Log-Publish-Key');
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

if (($body['protocol'] ?? '') === 'sharon-network-v1') log_network_request($body,$root,$raw);

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
