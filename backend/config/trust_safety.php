<?php

return [
    'report_sla_hours' => [
        'urgent' => (int) env('REPORT_SLA_URGENT_HOURS', 4),
        'high' => (int) env('REPORT_SLA_HIGH_HOURS', 24),
        'normal' => (int) env('REPORT_SLA_NORMAL_HOURS', 72),
        'low' => (int) env('REPORT_SLA_LOW_HOURS', 168),
    ],
];
