<?php
declare(strict_types=1);
define('LOG_CONNECTION_LIBRARY_ONLY',true);
require 'server/connections.php';
$temporary=[];
register_shutdown_function(function()use(&$temporary){foreach($temporary as $path){foreach(glob(dirname($path).'/*') as $file)unlink($file);rmdir(dirname($path));}});
$checks=0;
function check(bool $result): void { global $checks; $checks++; if(!$result)throw new RuntimeException('Check '.$checks.' failed'); }
function fails(callable $fn, string $reason): void {
    try { $fn(); } catch(LogNetworkError $e) { check($e->reason===$reason); return; }
    throw new RuntimeException('Expected '.$reason);
}
function fixture(): array {
    global $temporary;
    $dir=sys_get_temp_dir().'/log-json-'.bin2hex(random_bytes(6));mkdir($dir,0700);
    $db=$dir.'/network.json';$temporary[]=$db;
    $s=new LogNetwork($db,1000000);$start=$s->start();
    $owner=['personId'=>LogNetwork::id(),'deviceToken'=>LogNetwork::token(),'name'=>'Eigenaar'];
    $s->handle('register',$owner,null);
    $s->handle('bootstrap',$start,$owner['deviceToken']);
    return [$db,$s,$start,$owner];
}
function person(LogNetwork $s, string $name='Persoon'): array {
    $p=['personId'=>LogNetwork::id(),'deviceToken'=>LogNetwork::token(),'name'=>$name];
    $s->handle('register',$p,null);return $p;
}
function joinPerson(LogNetwork $s, array $issuer, array $recipient): array {
    $invite=$s->handle('invite',['recipientId'=>$recipient['personId']],$issuer['deviceToken'])['invitation'];
    return $s->handle('accept',$invite,$recipient['deviceToken'])['self'];
}
[$db,$s,$start,$owner]=fixture();
check(json_decode(file_get_contents($db),true)['schema']==='sharon-network-v1');
check($s->handle('bootstrap',$start,$owner['deviceToken'])['self']['line']===0);
$bob=person($s,'Bob');$eve=person($s,'<img src=x onerror=alert(1)>');
fails(fn()=>$s->handle('bootstrap',$start,$bob['deviceToken']),'invitation_used');
fails(fn()=>$s->handle('register',[...$owner,'deviceToken'=>LogNetwork::token()],null),'identity_exists');
fails(fn()=>$s->handle('self',[],LogNetwork::token()),'unauthorized');
fails(fn()=>$s->handle('contacts',[],$bob['deviceToken']),'invitation_required');
fails(fn()=>$s->handle('invite',['recipientId'=>LogNetwork::id()],$owner['deviceToken']),'recipient_unknown');
$invite=$s->handle('invite',['recipientId'=>$bob['personId']],$owner['deviceToken'])['invitation'];
fails(fn()=>$s->handle('accept',$invite,$eve['deviceToken']),'invalid_invitation');
fails(fn()=>$s->handle('accept',[...$invite,'networkId'=>LogNetwork::id()],$bob['deviceToken']),'wrong_network');
fails(fn()=>$s->handle('accept',[...$invite,'token'=>LogNetwork::token()],$bob['deviceToken']),'invalid_invitation');
check($s->handle('accept',$invite,$bob['deviceToken'])['self']['line']===1);
check($s->handle('accept',$invite,$bob['deviceToken'])['self']['line']===1);
$contacts=$s->handle('contacts',[],$owner['deviceToken'])['contacts'];
check(count($contacts)===1&&$contacts[0]['personId']===$bob['personId']);
$chat=$contacts[0]['chatId'];
joinPerson($s,$owner,$eve);
fails(fn()=>$s->handle('messages',['chatId'=>$chat],$eve['deviceToken']),'chat_forbidden');
fails(fn()=>$s->handle('send',['chatId'=>$chat,'id'=>LogNetwork::id(),'text'=>'spion'],$eve['deviceToken']),'chat_forbidden');
$id=LogNetwork::id();
$sent=$s->handle('send',['chatId'=>$chat,'id'=>$id,'text'=>'Hallo <script>test</script>'],$owner['deviceToken'])['message'];
check($sent['senderId']===$owner['personId']&&$sent['id']===$id);
check($s->handle('send',['chatId'=>$chat,'id'=>$id,'text'=>$sent['text']],$owner['deviceToken'])['message']===$sent);
fails(fn()=>$s->handle('send',['chatId'=>$chat,'id'=>$id,'text'=>'anders'],$owner['deviceToken']),'message_conflict');
fails(fn()=>$s->handle('send',['chatId'=>$chat,'id'=>$id,'text'=>$sent['text']],$bob['deviceToken']),'message_conflict');
check(count($s->handle('messages',['chatId'=>$chat],$bob['deviceToken'])['messages'])===1);
check($s->handle('messages',['chatId'=>$chat,'after'=>$sent['seq']],$bob['deviceToken'])['messages']===[]);
fails(fn()=>$s->handle('messages',['chatId'=>$chat,'after'=>-1],$bob['deviceToken']),'invalid_cursor');
fails(fn()=>$s->handle('send',['chatId'=>$chat,'id'=>LogNetwork::id(),'text'=>str_repeat('x',8001)],$bob['deviceToken']),'invalid_message');
$second=person($s);$third=person($s);$fourth=person($s);
check(joinPerson($s,$bob,$second)['line']===2);
check(joinPerson($s,$second,$third)['line']===3);
fails(fn()=>$s->handle('invite',['recipientId'=>$fourth['personId']],$third['deviceToken']),'depth_limit');
check(joinPerson($s,$owner,$third)['line']===3); // Connects, never reparents.
$beforeGrant=array_values(array_filter(json_decode(file_get_contents($db),true)['relations'],fn($r)=>$r['type']==='grants-access' && $r['toId']===$bob['personId']))[0]['id'];
fails(fn()=>$s->handle('set-access',['personId'=>$bob['personId'],'status'=>'revoked'],$eve['deviceToken']),'owner_required');
$s->handle('set-access',['personId'=>$bob['personId'],'status'=>'revoked'],$owner['deviceToken']);
$s->handle('set-access',['personId'=>$bob['personId'],'status'=>'active'],$owner['deviceToken']);
check($s->handle('self',[],$bob['deviceToken'])['self']['line']===1);
check(json_decode(file_get_contents($db),true)['relations'][$beforeGrant]['status']==='active');
$s->handle('set-access',['personId'=>$bob['personId'],'status'=>'revoked'],$owner['deviceToken']);
fails(fn()=>$s->handle('messages',['chatId'=>$chat],$bob['deviceToken']),'unauthorized');
fails(fn()=>$s->handle('send',['chatId'=>$chat,'id'=>LogNetwork::id(),'text'=>'hoi'],$owner['deviceToken']),'chat_forbidden');
check($s->handle('self',[],$second['deviceToken'])['self']['line']===2); // No cascade.
fails(fn()=>$s->start(),'already_activated');
$waiting=person($s);$expired=$s->handle('invite',['recipientId'=>$waiting['personId']],$owner['deviceToken'])['invitation'];
$future=new LogNetwork($db,1086401);
fails(fn()=>$future->handle('accept',$expired,$waiting['deviceToken']),'invitation_expired');
check($s->handle('self',[],$waiting['deviceToken'])['self']['line']===null);
[$otherDb,$fresh,$oldStart,$unusedOwner]=fixture();
// Independent, unclaimed JSON network for expiry and first-100 tests.
$state=json_decode(file_get_contents($otherDb),true);$state['ownerId']=null;$state['people']=[];
file_put_contents($otherDb,json_encode($state));$first=$fresh->start();
$new=person($fresh);$futureFresh=new LogNetwork($otherDb,1000900);
fails(fn()=>$futureFresh->handle('bootstrap',$first,$new['deviceToken']),'invitation_expired');
$rotated=$fresh->start();
fails(fn()=>$fresh->handle('bootstrap',$first,$new['deviceToken']),'invalid_invitation');
check($fresh->handle('bootstrap',$rotated,$new['deviceToken'])['self']['line']===0);
for($i=0;$i<100;$i++) {
    $p=person($fresh);
    check(joinPerson($fresh,$new,$p)['line']===1);
}
$overflow=person($fresh);
fails(fn()=>$fresh->handle('invite',['recipientId'=>$overflow['personId']],$new['deviceToken']),'capacity');
$fresh->handle('set-access',['personId'=>$p['personId'],'status'=>'revoked'],$new['deviceToken']);
fails(fn()=>$fresh->handle('invite',['recipientId'=>$overflow['personId']],$new['deviceToken']),'capacity');
for($i=0;$i<120;$i++)$s->throttle('test-ip',str_repeat('a',43),false);
fails(fn()=>$s->throttle('test-ip',str_repeat('a',43),false),'rate_limit');
$state=json_decode(file_get_contents($db),true);
$grants=array_values(array_filter($state['relations'],fn($r)=>$r['type']==='grants-access'));
$chats=array_values(array_filter($state['relations'],fn($r)=>$r['type']==='chat'));
check(count($grants)===4 && count($chats)===5);
foreach($state['relations'] as $r)check(strlen($r['id'])===12 && strlen($r['fromId'])===12 && strlen($r['toId'])===12);
check(!str_contains(file_get_contents($db),$owner['deviceToken']));
$before=file_get_contents($db);
fails(fn()=>$s->handle('send',['chatId'=>$chat,'id'=>LogNetwork::id(),'text'=>'No access'],$owner['deviceToken']),'chat_forbidden');
check(file_get_contents($db)===$before);
file_put_contents($db,'{invalid');
try{$s->handle('self',[],$owner['deviceToken']);throw new RuntimeException('Corruption was ignored');}catch(JsonException $e){check(file_get_contents($db)==='{invalid');}
echo json_encode(['checks'=>$checks,'ok'=>true]);
