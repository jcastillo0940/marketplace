<?php

namespace App\Models;

use App\Enums\ProductStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Carbon;

class Product extends Model
{
    use HasFactory;

    protected $hidden = ['producer_profile_id', 'created_by'];

    protected $fillable = ['producer_profile_id', 'category_id', 'created_by', 'slug', 'title', 'description', 'unit', 'price_type', 'price_amount', 'currency', 'stock_quantity', 'delivery_method', 'status', 'published_at'];

    protected function casts(): array
    {
        return ['status' => ProductStatus::class, 'published_at' => 'datetime'];
    }

    public function producer(): BelongsTo
    {
        return $this->belongsTo(ProducerProfile::class, 'producer_profile_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class);
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(ProductStatusHistory::class);
    }

    public function latestModerationDecision(): HasOne
    {
        return $this->hasOne(ProductStatusHistory::class)->latestOfMany()->whereIn('to_status', ['changes_requested', 'rejected']);
    }

    public function scopePubliclyAvailable(Builder $query): Builder
    {
        $ttlDays = (int) config('marketplace.listing_ttl_days', 90);

        return $query->where('status', ProductStatus::Published->value)
            ->whereNotNull('published_at')
            ->when($ttlDays > 0, fn (Builder $products) => $products->where('published_at', '>', now()->subDays($ttlDays)))
            ->where(fn (Builder $availability) => $availability->whereNull('stock_quantity')->orWhere('stock_quantity', '>', 0))
            ->whereHas('producer', fn (Builder $producer) => $producer->where('profile_status', 'active')->whereNotNull('phone_verified_at'))
            ->whereHas('category', fn (Builder $category) => $category->where('active', true)
                ->where(fn (Builder $parent) => $parent->whereNull('parent_id')->orWhereHas('parent', fn (Builder $ancestor) => $ancestor->where('active', true))));
    }

    public function listingIsExpired(): bool
    {
        $ttlDays = (int) config('marketplace.listing_ttl_days', 90);

        return $ttlDays > 0
            && $this->status === ProductStatus::Published
            && $this->published_at !== null
            && $this->published_at->lte(now()->subDays($ttlDays));
    }

    public function listingExpiresAt(): ?Carbon
    {
        $ttlDays = (int) config('marketplace.listing_ttl_days', 90);

        return $ttlDays > 0 && $this->published_at !== null
            ? $this->published_at->copy()->addDays($ttlDays)
            : null;
    }

    public function contactEvents(): HasMany
    {
        return $this->hasMany(ContactEvent::class);
    }
}
