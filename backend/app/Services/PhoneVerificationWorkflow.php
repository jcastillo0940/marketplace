<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ProducerProfile;
use App\Support\PanamaPhoneNumber;
use Illuminate\Support\Facades\DB;

class PhoneVerificationWorkflow
{
    /**
     * Confirm a producer's current phone and consume its challenge atomically.
     * Returns an HTTP failure description when the challenge cannot be accepted.
     */
    public function confirm(int $userId, int $actorId, string $phone, string $code, ContactVerificationSender $sender): ?array
    {
        return DB::transaction(function () use ($userId, $actorId, $phone, $code, $sender): ?array {
            $profile = ProducerProfile::query()->where('user_id', $userId)->lockForUpdate()->firstOrFail();
            $verification = $profile->verifications()
                ->whereIn('status', ['pending', 'locked'])
                ->latest()
                ->lockForUpdate()
                ->first();

            if ($verification?->status === 'locked') {
                return ['status' => 429, 'message' => 'Se alcanzó el máximo de intentos. Solicita un nuevo código más tarde.'];
            }
            if (! $verification || $verification->status !== 'pending' || $verification->expires_at?->isPast()) {
                if ($verification?->status === 'pending') {
                    $verification->forceFill(['status' => 'expired'])->save();
                }

                return ['status' => 422, 'message' => 'No hay una verificación activa.'];
            }

            $storedPhone = PanamaPhoneNumber::normalize($profile->phone_private);
            $success = $sender->matches($code, $verification->code_hash)
                && $storedPhone !== null
                && hash_equals($storedPhone, $phone);
            $verification->attempts()->create(['result' => $success ? 'success' : 'failure', 'attempted_at' => now()]);

            if (! $success) {
                if ($verification->attempts()->where('result', 'failure')->count() >= 5) {
                    $verification->forceFill(['status' => 'locked', 'code_hash' => null])->save();

                    return ['status' => 429, 'message' => 'Se alcanzó el máximo de intentos. Solicita un nuevo código más tarde.'];
                }

                return ['status' => 422, 'message' => 'No pudimos confirmar el número con esos datos.'];
            }

            $profile->forceFill([
                'phone_private' => $storedPhone,
                'phone_verified_at' => now(),
                'phone_public' => $storedPhone,
                'contact_level' => 'contact_confirmed',
            ])->save();
            $verification->forceFill(['status' => 'verified', 'code_hash' => null, 'verified_at' => now()])->save();
            AuditLog::create([
                'actor_id' => $actorId,
                'action' => 'producer.phone_verified',
                'resource_type' => 'producer_profile',
                'resource_id' => $profile->id,
                'after_values' => ['contact_level' => 'contact_confirmed'],
                'created_at' => now(),
            ]);

            return null;
        });
    }
}
