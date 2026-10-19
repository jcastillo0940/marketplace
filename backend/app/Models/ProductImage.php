<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductImage extends Model
{
    protected $fillable = ['product_id', 'disk', 'path', 'thumbnail_path', 'alt_text', 'position', 'is_public'];

    protected $hidden = ['disk', 'path', 'thumbnail_path'];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
