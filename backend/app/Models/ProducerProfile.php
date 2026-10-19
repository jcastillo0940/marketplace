<?php

namespace App\Models;

use App\Enums\ProducerVerificationLevel;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProducerProfile extends Model
{
    use HasFactory;

    protected $hidden = ['user_id', 'registered_by', 'registration_method', 'phone_private', 'phone_verified_at', 'suspension_reason', 'cedula'];

    protected $fillable = ['user_id', 'registered_by', 'registration_method', 'location_id', 'slug', 'public_name', 'activity', 'phone_private', 'phone_public', 'phone_verified_at', 'contact_level', 'verification_level', 'profile_status', 'suspension_reason', 'description', 'cedula'];

    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    protected function casts(): array
    {
        return ['phone_verified_at' => 'datetime'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function appeals(): HasMany
    {
        return $this->hasMany(ProducerAppeal::class);
    }

    public function consents(): HasMany
    {
        return $this->hasMany(ProducerConsent::class);
    }

    public function verifications(): HasMany
    {
        return $this->hasMany(ProducerVerification::class);
    }

    public function trustReviews(): HasMany
    {
        return $this->hasMany(ProducerTrustReview::class);
    }

    public function publicVerificationLevel(): string
    {
        if ($this->contact_level !== 'contact_confirmed' || $this->phone_verified_at === null) {
            return ProducerVerificationLevel::Unverified->value;
        }

        return ProducerVerificationLevel::tryFrom((string) $this->verification_level)?->value
            ?? ProducerVerificationLevel::ContactConfirmed->value;
    }

    public function publicVerificationLabel(): string
    {
        return ProducerVerificationLevel::from($this->publicVerificationLevel())->label();
    }

    public function changePhone(string $phone): void
    {
        $this->phone_private = $phone;
        $this->phone_verified_at = null;
        $this->phone_public = null;
        $this->contact_level = 'unverified';
        $this->save();
    }
}
