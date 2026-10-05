<?php
declare(strict_types=1);

// Hold one stable lock across reading, authorization, revision checks and writes.
// Lock the separate lock file: JSON files are replaced with rename().
function log_relay_lock(string $namespace, string $id, bool $write, callable $respond): void {
    if (!preg_match('/^[a-z-]+$/', $namespace) || !preg_match('/^[A-Za-z0-9_-]{12}$/', $id)) {
        $respond(500, ['error' => 'Ongeldige interne locknaam.']);
    }
    $dir = dirname(__DIR__) . '/private/locks';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
        $respond(500, ['error' => 'Lockmap kon niet worden aangemaakt.']);
    }
    $path = $dir . '/' . $namespace . '-' . $id . '.lock';
    $handle = @fopen($path, 'c');
    if ($handle === false) $respond(500, ['error' => 'Objectlock kon niet worden geopend.']);
    @chmod($path, 0600);
    $deadline = microtime(true) + 2;
    $operation = ($write ? LOCK_EX : LOCK_SH) | LOCK_NB;
    while (!flock($handle, $operation)) {
        if (microtime(true) >= $deadline) {
            fclose($handle);
            header('Retry-After: 2');
            $respond(503, ['error' => 'Deze bron is tijdelijk bezig. Probeer over enkele seconden opnieuw.']);
        }
        usleep(10000);
    }
    register_shutdown_function(static function () use ($handle): void {
        flock($handle, LOCK_UN);
        fclose($handle);
    });
}
