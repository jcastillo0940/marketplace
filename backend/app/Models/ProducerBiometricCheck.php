<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProducerBiometricCheck extends Model
{
    public const CONSENT_TYPE = 'biometric';

    public const CONSENT_VERSION = 'biometric-2026-11';

    protected $fillable = ['producer_profile_id', 'status', 'selfie_path', 'cedula_path', 'match_distance', 'liveness_challenges', 'reviewed_by', 'review_reason', 'reviewed_at'];

    protected $hidden = ['selfie_path', 'cedula_path'];

    protected function casts(): array
    {
        return ['liveness_challenges' => 'array', 'match_distance' => 'float', 'reviewed_at' => 'datetime'];
    }

    public function producer(): BelongsTo
    {
        return $this->belongsTo(ProducerProfile::class, 'producer_profile_id');
    }
}
