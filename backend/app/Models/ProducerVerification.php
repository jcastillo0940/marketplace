<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProducerVerification extends Model
{
    protected $fillable = ['producer_profile_id', 'channel', 'status', 'code_hash', 'verified_at', 'expires_at'];

    protected function casts(): array
    {
        return ['verified_at' => 'datetime', 'expires_at' => 'datetime'];
    }

    public function attempts(): HasMany
    {
        return $this->hasMany(VerificationAttempt::class);
    }
}
