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

    protected $hidden = ['user_id', 'registered_by', 'registration_method', 'phone_private', 'phone_verified_at', 'suspension_reason', 'cedula', 'ruc', 'ruc_dv', 'cedula_photo_path', 'pacto_social_path', 'aviso_operacion_path'];

    protected $fillable = ['user_id', 'registered_by', 'registration_method', 'location_id', 'slug', 'public_name', 'activity', 'activities', 'vendor_type', 'payment_methods', 'phone_private', 'phone_public', 'phone_verified_at', 'contact_level', 'verification_level', 'profile_status', 'suspension_reason', 'description', 'cedula', 'ruc', 'ruc_dv', 'cedula_photo_path', 'pacto_social_path', 'aviso_operacion_path'];

    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }

    protected function casts(): array
    {
        return [
            'phone_verified_at' => 'datetime',
            'payment_methods' => 'array',
            'activities' => 'array',
        ];
    }

    /** @param array<int, string> $activities */
    public static function activityLabel(array $activities): ?string
    {
        return implode(', ', array_unique($activities)) ?: null;
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

    public function stories(): HasMany
    {
        return $this->hasMany(ProducerStory::class);
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

    public function canPublishDirectly(): bool
    {
        return $this->profile_status === 'active' && in_array($this->publicVerificationLevel(), [
            ProducerVerificationLevel::IdentityReviewed->value,
            ProducerVerificationLevel::BiometricVerified->value,
            ProducerVerificationLevel::ProducerValidated->value,
        ], true);
    }

    public function biometricChecks(): HasMany
    {
        return $this->hasMany(ProducerBiometricCheck::class);
    }

    /** Document each registrant type must upload before publishing products. */
    public const PUBLISHING_DOCUMENTS = [
        'productor' => ['cedula_photo' => 'la foto de tu cédula'],
        'distribuidor' => ['aviso_operacion' => 'el aviso de operación'],
        'cooperativa' => ['pacto_social' => 'el pacto social'],
    ];

    /** @return array<string, string> missing document type => label */
    public function missingPublishingDocuments(): array
    {
        $required = self::PUBLISHING_DOCUMENTS[$this->vendor_type ?? 'productor'] ?? self::PUBLISHING_DOCUMENTS['productor'];

        return array_filter($required, fn (string $label, string $type): bool => empty($this->{$type.'_path'}), ARRAY_FILTER_USE_BOTH);
    }

    public function ensureCanPublish(): void
    {
        $missing = $this->missingPublishingDocuments();
        abort_if($missing !== [], 422, 'Para publicar productos primero sube '.implode(' y ', $missing).' en Mi perfil → Verificación.');
    }

    public function hasLegalDocument(): bool
    {
        return ! empty($this->cedula_photo_path) || ! empty($this->pacto_social_path) || ! empty($this->aviso_operacion_path);
    }

    /**
     * Legal documents a public visitor may know were reviewed. Names only, never the values.
     *
     * @return list<string>
     */
    public function verifiedDocuments(): array
    {
        $level = ProducerVerificationLevel::from($this->publicVerificationLevel());
        if (in_array($level, [ProducerVerificationLevel::Unverified, ProducerVerificationLevel::ContactConfirmed], true)) {
            return [];
        }

        return array_values(array_filter([
            ! empty($this->ruc) ? 'ruc' : null,
            ! empty($this->pacto_social_path) ? 'pacto_social' : null,
            ! empty($this->aviso_operacion_path) ? 'aviso_operacion' : null,
        ]));
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
