<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ProducerBiometricCheck;
use App\Models\ProducerProfile;
use App\Services\SensitiveFileStore;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

class SensitiveFileController extends Controller
{
    public function document(Request $request, int $id, string $type, SensitiveFileStore $files): Response
    {
        Gate::authorize('producers.verify');
        $path = ProducerProfile::query()->findOrFail($id)->{$type.'_path'};
        abort_unless($path, 404);
        $this->audit($request, $id, 'producer.document_viewed', ['type' => $type]);

        return $files->response($path);
    }

    public function biometric(Request $request, int $id, int $checkId, string $kind, SensitiveFileStore $files): Response
    {
        Gate::authorize('producers.verify');
        $check = ProducerBiometricCheck::query()->where('producer_profile_id', $id)->findOrFail($checkId);
        $path = $check->{$kind.'_path'};
        abort_unless($path, 404);
        $this->audit($request, $id, 'producer.biometric_viewed', ['check_id' => $check->id, 'kind' => $kind]);

        return $files->response($path);
    }

    /** @param array<string, mixed> $details */
    private function audit(Request $request, int $producerId, string $action, array $details): void
    {
        AuditLog::create(['admin_actor_id' => $request->user()->id, 'action' => $action, 'resource_type' => 'producer_profile', 'resource_id' => $producerId, 'after_values' => $details, 'created_at' => now()]);
    }
}
