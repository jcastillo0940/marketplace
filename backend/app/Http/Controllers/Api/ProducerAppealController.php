<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ProducerAppeal;
use App\Models\ProducerProfile;
use App\Services\ProductReinstatementWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class ProducerAppealController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $profile = $request->user()->producerProfile()->firstOrFail();

        return response()->json(['data' => [
            'profile_status' => $profile->profile_status,
            'suspension_reason' => $profile->suspension_reason,
            'appeals' => $profile->appeals()->latest('submitted_at')->get(['id', 'reason', 'status', 'resolution_note', 'submitted_at', 'reviewed_at']),
        ]]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:20', 'max:2000']]);
        $profile = $request->user()->producerProfile()->firstOrFail();

        $appeal = DB::transaction(function () use ($profile, $data, $request): ProducerAppeal {
            $lockedProfile = ProducerProfile::query()->whereKey($profile->id)->lockForUpdate()->firstOrFail();
            abort_unless($lockedProfile->profile_status === 'suspended', 409, 'Solo puedes apelar una suspensión vigente.');
            abort_if($lockedProfile->appeals()->whereIn('status', ['pending', 'reviewing'])->exists(), 409, 'Ya tienes una apelación en revisión.');

            $appeal = $lockedProfile->appeals()->create([
                'submitted_by' => $request->user()->id,
                'reason' => $data['reason'],
                'status' => 'pending',
                'submitted_at' => now(),
            ]);
            AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'producer.appeal_submitted', 'resource_type' => 'producer_appeal', 'resource_id' => $appeal->id, 'after_values' => ['status' => 'pending', 'producer_profile_id' => $lockedProfile->id], 'reason' => 'El productor solicitó una revisión de su suspensión.', 'created_at' => now()]);

            return $appeal;
        });

        return response()->json(['data' => ['id' => $appeal->id, 'status' => $appeal->status]], 201);
    }

    public function queue(): JsonResponse
    {
        Gate::authorize('producers.appeals.manage');
        $appeals = ProducerAppeal::query()->where('status', 'pending')->with([
            'producer:id,public_name,slug,profile_status,suspension_reason',
            'submitter:id,name',
        ])->withCount(['producer as published_products_count' => fn ($products) => $products->where('status', 'published')])
            ->latest('submitted_at')->paginate(20);
        $appeals->getCollection()->each(function (ProducerAppeal $appeal): void {
            $appeal->setAttribute('published_products_count', (int) $appeal->published_products_count);
        });

        return response()->json($appeals);
    }

    public function decide(Request $request, int $id, ProductReinstatementWorkflow $workflow): JsonResponse
    {
        Gate::authorize('producers.appeals.manage');
        $data = $request->validate([
            'decision' => ['required', 'in:reinstated,upheld'],
            'resolution_note' => ['required', 'string', 'min:10', 'max:1000'],
        ]);

        [$appeal, $queuedProducts] = DB::transaction(function () use ($data, $id, $request, $workflow): array {
            $appeal = ProducerAppeal::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($appeal->status === 'pending', 409, 'Esta apelación ya fue resuelta.');
            $profile = ProducerProfile::query()->whereKey($appeal->producer_profile_id)->lockForUpdate()->firstOrFail();
            abort_unless($profile->profile_status === 'suspended', 409, 'El perfil ya no está suspendido; actualiza el caso manualmente.');

            $appeal->forceFill([
                'status' => $data['decision'],
                'reviewed_by' => $request->user()->id,
                'resolution_note' => $data['resolution_note'],
                'reviewed_at' => now(),
            ])->save();
            AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'producer.appeal_decided', 'resource_type' => 'producer_appeal', 'resource_id' => $appeal->id, 'before_values' => ['status' => 'pending'], 'after_values' => ['status' => $data['decision'], 'producer_profile_id' => $profile->id], 'reason' => $data['resolution_note'], 'created_at' => now()]);

            $queuedProducts = 0;
            if ($data['decision'] === 'reinstated') {
                $profile->forceFill(['profile_status' => 'active', 'suspension_reason' => null])->save();
                $queuedProducts = $workflow->queuePublishedProductsForReview($profile, $request->user()->id, $data['resolution_note']);
                AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'producer.status_changed', 'resource_type' => 'producer_profile', 'resource_id' => $profile->id, 'before_values' => ['profile_status' => 'suspended'], 'after_values' => ['profile_status' => 'active'], 'reason' => $data['resolution_note'], 'created_at' => now()]);
            }

            return [$appeal->fresh()->load(['producer:id,public_name,slug,profile_status,suspension_reason', 'submitter:id,name']), $queuedProducts];
        });

        return response()->json(['data' => ['id' => $appeal->id, 'status' => $appeal->status, 'producer_profile_status' => $appeal->producer->profile_status, 'products_queued_for_review' => $queuedProducts]]);
    }
}
