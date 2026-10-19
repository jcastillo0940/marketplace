<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductStatusHistory extends Model
{
    protected $table = 'product_status_history';

    protected $fillable = ['product_id', 'actor_id', 'from_status', 'to_status', 'reason'];

    protected $hidden = ['actor_id'];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
