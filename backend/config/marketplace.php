<?php

return [
    // Version identifiers are controlled by the application, not the client.
    // Replace only alongside the corresponding policy text and approval record.
    'consent_versions' => [
        'terms' => 'terms-2026-10',
        'privacy' => 'privacy-2026-10',
        'assisted_registration' => 'assisted-2026-10',
    ],
    // Public offers must be renewed periodically so the catalog reflects
    // current availability. Set to zero only when product freshness is handled elsewhere.
    'listing_ttl_days' => max(0, (int) env('LISTING_TTL_DAYS', 90)),
];
