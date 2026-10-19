<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContactEvent extends Model
{
    public $timestamps = false;

    protected $fillable = ['product_id', 'producer_profile_id', 'channel', 'dedupe_key', 'occurred_at'];

    protected function casts(): array
    {
        return ['occurred_at' => 'datetime'];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function producer(): BelongsTo
    {
        return $this->belongsTo(ProducerProfile::class, 'producer_profile_id');
    }
}
