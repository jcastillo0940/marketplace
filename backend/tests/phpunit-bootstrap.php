<?php

// PHPUnit runs inside containers that may provide production-like DB variables.
// Force the test process onto an in-memory SQLite database before Laravel boots.
// A cached config bakes in production env values and bypasses putenv() entirely.
// Remove it so that env() reads the vars we set below.
$configCachePath = __DIR__ . '/../bootstrap/cache/config.php';
@unlink($configCachePath);

// Rebuild the config cache after the test process exits so production performance
// is not degraded. Uses the real .env (not the testing overrides above).
register_shutdown_function(static function () use ($configCachePath): void {
    if (!file_exists($configCachePath)) {
        shell_exec('php ' . __DIR__ . '/../artisan config:cache 2>/dev/null');
    }
});

foreach ([
    'APP_ENV' => 'testing',
    'DB_CONNECTION' => 'sqlite',
    'DB_DATABASE' => ':memory:',
    'DB_URL' => '',
] as $key => $value) {
    putenv("{$key}={$value}");
    $_ENV[$key] = $value;
    $_SERVER[$key] = $value;
}
