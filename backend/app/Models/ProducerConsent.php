<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProducerConsent extends Model
{
    protected $fillable = ['producer_profile_id', 'consent_type', 'version', 'accepted_at', 'recorded_by'];

    protected function casts(): array
    {
        return ['accepted_at' => 'datetime'];
    }

    public function producer(): BelongsTo
    {
        return $this->belongsTo(ProducerProfile::class, 'producer_profile_id');
    }
}
