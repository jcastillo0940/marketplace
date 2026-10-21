<?php

namespace App\Services;

use App\Enums\ProducerVerificationLevel;
use App\Models\AdminUser;
use App\Models\AuditLog;
use App\Models\ProducerProfile;
use App\Models\ProducerTrustReview;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;

class ProducerTrustLevelWorkflow
{
    public function change(ProducerProfile $profile, Authenticatable $actor, ProducerVerificationLevel $target, string $reason): ProducerTrustReview
    {
        return DB::transaction(function () use ($profile, $actor, $target, $reason): ProducerTrustReview {
            $locked = ProducerProfile::query()->lockForUpdate()->findOrFail($profile->id);
            $current = ProducerVerificationLevel::from($locked->publicVerificationLevel());

            if ($current === ProducerVerificationLevel::Unverified) {
                throw ValidationException::withMessages(['level' => ['El productor debe confirmar su teléfono antes de recibir una revisión de identidad.']]);
            }

            if ($current === $target) {
                throw new HttpException(409, 'El perfil ya tiene ese nivel de revisión.');
            }

            if ($target === ProducerVerificationLevel::ProducerValidated && $current !== ProducerVerificationLevel::IdentityReviewed) {
                throw ValidationException::withMessages(['level' => ['Primero completa y registra la revisión de identidad.']]);
            }

            if ($target === ProducerVerificationLevel::IdentityReviewed && ! in_array($current, [ProducerVerificationLevel::ContactConfirmed, ProducerVerificationLevel::ProducerValidated], true)) {
                throw ValidationException::withMessages(['level' => ['La revisión de identidad requiere contacto confirmado.']]);
            }

            if ($target === ProducerVerificationLevel::ContactConfirmed && ! in_array($current, [ProducerVerificationLevel::IdentityReviewed, ProducerVerificationLevel::ProducerValidated], true)) {
                throw ValidationException::withMessages(['level' => ['No hay una revisión manual que retirar.']]);
            }

            $isAdmin = $actor instanceof AdminUser;
            $review = ProducerTrustReview::create([
                'producer_profile_id' => $locked->id,
                'actor_id' => $isAdmin ? null : $actor->id,
                'admin_actor_id' => $isAdmin ? $actor->id : null,
                'from_level' => $current->value,
                'to_level' => $target->value,
                'reason' => $reason,
            ]);
            $locked->verification_level = $target->value;
            $locked->save();

            AuditLog::create([
                'actor_id' => $isAdmin ? null : $actor->id,
                'admin_actor_id' => $isAdmin ? $actor->id : null,
                'action' => 'producer.trust_level_changed',
                'resource_type' => 'producer_profile',
                'resource_id' => $locked->id,
                'before_values' => ['verification_level' => $current->value],
                'after_values' => ['verification_level' => $target->value],
                'reason' => $reason,
                'created_at' => now(),
            ]);

            return $review;
        });
    }
}
