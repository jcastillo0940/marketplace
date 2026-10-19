<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProducerTrustReview extends Model
{
    protected $fillable = ['producer_profile_id', 'actor_id', 'from_level', 'to_level', 'reason'];

    public function producer(): BelongsTo
    {
        return $this->belongsTo(ProducerProfile::class, 'producer_profile_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
