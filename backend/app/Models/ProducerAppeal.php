<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProducerAppeal extends Model
{
    protected $fillable = ['producer_profile_id', 'submitted_by', 'reviewed_by', 'reason', 'status', 'resolution_note', 'submitted_at', 'reviewed_at'];

    protected function casts(): array
    {
        return ['submitted_at' => 'datetime', 'reviewed_at' => 'datetime'];
    }

    public function producer(): BelongsTo
    {
        return $this->belongsTo(ProducerProfile::class, 'producer_profile_id');
    }

    public function submitter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
