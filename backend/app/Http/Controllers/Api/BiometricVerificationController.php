<?php

namespace App\Http\Controllers\Api;

use App\Enums\ProducerVerificationLevel;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ProducerBiometricCheck;
use App\Models\ProducerProfile;
use App\Services\FaceMatcher;
use App\Services\ProducerTrustLevelWorkflow;
use App\Services\SensitiveFileStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Liveness runs in the producer's browser; the face comparison is repeated on the server with
 * OpenCV (FaceMatcher). A strong server match with the full liveness sequence is approved
 * automatically. Anything else waits for an admin: the system never rejects on its own.
 */
class BiometricVerificationController extends Controller
{
    private const MAX_ATTEMPTS_PER_DAY = 3;

    public function status(Request $request): JsonResponse
    {
        $profile = ProducerProfile::where('user_id', $request->user()->id)->firstOrFail();
        $latest = $profile->biometricChecks()->latest('id')->first();

        return response()->json(['data' => [
            'eligible' => $this->isEligible($profile),
            'latest' => $latest ? ['status' => $latest->status, 'review_reason' => $latest->status === 'rejected' ? $latest->review_reason : null, 'created_at' => $latest->created_at] : null,
        ]]);
    }

    public function store(Request $request, SensitiveFileStore $files, FaceMatcher $matcher, ProducerTrustLevelWorkflow $workflow): JsonResponse
    {
        $data = $request->validate([
            'selfie' => ['required', 'file', 'mimes:jpg,jpeg', 'max:4096'],
            'cedula' => ['required', 'file', 'mimes:jpg,jpeg', 'max:4096'],
            'match_distance' => ['required', 'numeric', 'min:0', 'max:2'],
            'liveness_challenges' => ['required', 'array', 'size:3'],
            'liveness_challenges.*' => ['string', 'distinct', 'in:blink,left,right'],
            'consent' => ['required', 'accepted'],
        ]);

        $profile = ProducerProfile::where('user_id', $request->user()->id)->firstOrFail();
        abort_unless($this->isEligible($profile), 403, 'Primero necesitas la etiqueta Verificado.');
        abort_if($profile->biometricChecks()->where('status', 'pending')->exists(), 409, 'Ya tienes una verificación en revisión.');
        abort_if($profile->biometricChecks()->where('created_at', '>=', now()->subDay())->count() >= self::MAX_ATTEMPTS_PER_DAY, 429, 'Alcanzaste el máximo de intentos de hoy. Inténtalo mañana.');

        $match = $matcher->compare($request->file('selfie')->getRealPath(), $request->file('cedula')->getRealPath());
        // A missing face is a capture problem, not a verdict: ask for new photos and keep nothing.
        abort_if($match['status'] === 'no_face_cedula', 422, 'No logramos ver bien la cara en la foto de tu cédula. Tómala de nuevo más cerca, con buena luz y sin reflejos.');
        abort_if($match['status'] === 'no_face_selfie', 422, 'No logramos ver bien tu cara. Vuelve a intentarlo mirando de frente y con buena luz.');

        $folder = "biometrics/{$profile->id}/".Str::uuid();
        $selfiePath = "{$folder}/selfie.jpg.enc";
        $cedulaPath = "{$folder}/cedula.jpg.enc";
        if (! $files->put($selfiePath, $request->file('selfie')->get()) || ! $files->put($cedulaPath, $request->file('cedula')->get())) {
            $files->delete([$selfiePath, $cedulaPath]);
            abort(503, 'No pudimos guardar las fotos. Inténtalo de nuevo.');
        }

        $check = DB::transaction(function () use ($profile, $data, $match, $selfiePath, $cedulaPath, $request): ProducerBiometricCheck {
            $profile->consents()->create([
                'consent_type' => ProducerBiometricCheck::CONSENT_TYPE,
                'version' => ProducerBiometricCheck::CONSENT_VERSION,
                'accepted_at' => now(),
            ]);
            $check = $profile->biometricChecks()->create([
                'selfie_path' => $selfiePath,
                'cedula_path' => $cedulaPath,
                'match_distance' => $data['match_distance'],
                'server_similarity' => $match['similarity'],
                'server_result' => $match['result'],
                'liveness_challenges' => $data['liveness_challenges'],
            ]);
            AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'producer.biometric_submitted', 'resource_type' => 'producer_profile', 'resource_id' => $profile->id, 'after_values' => ['check_id' => $check->id], 'created_at' => now()]);

            return $check;
        });

        if ($match['result'] === 'strong' && count($data['liveness_challenges']) === 3) {
            $this->approveAutomatically($check, $request->user(), $workflow, $files, $match['similarity']);
        }

        return response()->json(['data' => ['id' => $check->id, 'status' => $check->status]], 201);
    }

    private function approveAutomatically(ProducerBiometricCheck $check, $user, ProducerTrustLevelWorkflow $workflow, SensitiveFileStore $files, float $similarity): void
    {
        $reason = sprintf('Aprobado automáticamente: la cara coincide con la cédula (similitud %.2f) y completó la prueba de vida.', $similarity);
        try {
            DB::transaction(function () use ($check, $user, $workflow, $reason): void {
                $workflow->change($check->producer, $user, ProducerVerificationLevel::BiometricVerified, $reason);
                $check->update(['status' => 'approved', 'decision_source' => 'automatic', 'review_reason' => $reason, 'reviewed_at' => now()]);
                AuditLog::create(['actor_id' => $user->id, 'action' => 'producer.biometric_auto_approved', 'resource_type' => 'producer_profile', 'resource_id' => $check->producer_profile_id, 'after_values' => ['check_id' => $check->id, 'server_similarity' => $check->server_similarity], 'created_at' => now()]);
            });
        } catch (\Throwable $error) {
            // If the level cannot change automatically, the check simply stays in the manual queue.
            Log::warning('Automatic biometric approval failed; left for manual review.', ['check_id' => $check->id, 'error' => $error->getMessage()]);
            $check->refresh();

            return;
        }

        if ($files->delete([$check->selfie_path, $check->cedula_path])) {
            $check->update(['selfie_path' => null, 'cedula_path' => null]);
        }
    }

    public function decide(Request $request, int $producerId, int $checkId, ProducerTrustLevelWorkflow $workflow, SensitiveFileStore $files): JsonResponse
    {
        Gate::authorize('producers.verify');
        $data = $request->validate([
            'decision' => ['required', 'in:approve,reject'],
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ]);
        $admin = $request->user();

        $check = DB::transaction(function () use ($producerId, $checkId, $data, $admin, $workflow): ProducerBiometricCheck {
            $check = ProducerBiometricCheck::query()->where('producer_profile_id', $producerId)->lockForUpdate()->findOrFail($checkId);
            abort_unless($check->status === 'pending', 409, 'Esta verificación ya fue revisada.');

            $approved = $data['decision'] === 'approve';
            if ($approved) {
                $workflow->change($check->producer, $admin, ProducerVerificationLevel::BiometricVerified, $data['reason']);
            }
            $check->update(['status' => $approved ? 'approved' : 'rejected', 'decision_source' => 'admin', 'reviewed_by' => $admin->id, 'review_reason' => $data['reason'], 'reviewed_at' => now()]);
            AuditLog::create(['admin_actor_id' => $admin->id, 'action' => 'producer.biometric_reviewed', 'resource_type' => 'producer_profile', 'resource_id' => $producerId, 'after_values' => ['check_id' => $check->id, 'status' => $check->status], 'reason' => $data['reason'], 'created_at' => now()]);

            return $check;
        });

        if ($files->delete([$check->selfie_path, $check->cedula_path])) {
            $check->update(['selfie_path' => null, 'cedula_path' => null]);
        } else {
            Log::warning('Biometric images were not deleted.', ['check_id' => $check->id]);
        }

        return response()->json(['data' => ['id' => $check->id, 'status' => $check->status]]);
    }

    private function isEligible(ProducerProfile $profile): bool
    {
        return $profile->publicVerificationLevel() === ProducerVerificationLevel::IdentityReviewed->value;
    }
}
