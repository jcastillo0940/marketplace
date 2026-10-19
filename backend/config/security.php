<?php

return [
    'mfa' => [
        // Failed administrative TOTP checks are counted in the shared Redis cache.
        'cache_store' => env('MFA_CACHE_STORE', env('APP_ENV') === 'testing' ? 'array' : 'redis'),
        'account_attempts' => max(1, (int) env('MFA_ACCOUNT_ATTEMPTS', 10)),
        'account_window_seconds' => max(60, (int) env('MFA_ACCOUNT_WINDOW_SECONDS', 900)),
        'ip_attempts' => max(1, (int) env('MFA_IP_ATTEMPTS', 30)),
        'ip_window_seconds' => max(60, (int) env('MFA_IP_WINDOW_SECONDS', 900)),
    ],
    'mfa_recovery' => [
        'ttl_hours' => max(1, min(168, (int) env('MFA_RECOVERY_TTL_HOURS', 72))),
    ],
];
