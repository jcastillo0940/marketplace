<?php

// PHPUnit runs inside containers that may provide production-like DB variables.
// Force the test process onto an in-memory SQLite database before Laravel boots.
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
