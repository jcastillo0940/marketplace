<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RiskSignal extends Model
{
    protected $fillable = ['signal_key', 'signal_type', 'resource_type', 'resource_id', 'severity', 'explanation', 'evidence', 'status', 'assignee_id', 'reviewed_by', 'resolution_note', 'reviewed_at', 'closed_at', 'first_seen_at', 'last_seen_at'];

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    protected function casts(): array
    {
        return ['evidence' => 'array', 'first_seen_at' => 'datetime', 'last_seen_at' => 'datetime', 'reviewed_at' => 'datetime', 'closed_at' => 'datetime'];
    }
}
