<?php

namespace App\Http\Controllers\Api;

use App\Enums\AdminMfaRecoveryStatus;
use App\Http\Controllers\Controller;
use App\Models\AdminMfaRecoveryRequest;
use App\Services\AdminMfaRecoveryWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminMfaRecoveryController extends Controller
{
    public function index(Request $request, AdminMfaRecoveryWorkflow $workflow): JsonResponse
    {
        abort_unless($request->user()->hasPermission('security.mfa_recovery.review'), 403);
        $filters = $request->validate(['page' => ['sometimes', 'integer', 'min:1']]);
        $workflow->expireOpenRequests();
        $page = AdminMfaRecoveryRequest::query()
            ->with(['requester:id,name,email', 'approvals.approver:id,name'])
            ->whereIn('status', [AdminMfaRecoveryStatus::PendingFirstApproval, AdminMfaRecoveryStatus::AwaitingSecondApproval])
            ->where('expires_at', '>', now())
            ->orderBy('expires_at')
            ->orderBy('id')
            ->paginate(20, ['*'], 'page', $filters['page'] ?? 1);
        $page->getCollection()->transform(fn (AdminMfaRecoveryRequest $recoveryRequest): array => $this->serialize($recoveryRequest, (int) $request->user()->id));

        return response()->json($page)->header('Cache-Control', 'no-store, private');
    }

    public function decide(Request $request, int $id, AdminMfaRecoveryWorkflow $workflow): JsonResponse
    {
        abort_unless($request->user()->hasPermission('security.mfa_recovery.review'), 403);
        $data = $request->validate([
            'decision' => ['required', 'in:approve,reject'],
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ]);
        $recoveryRequest = AdminMfaRecoveryRequest::query()->findOrFail($id);
        $result = $workflow->decide($recoveryRequest, $request->user(), $data['decision'], $data['reason']);
        $result->load(['requester:id,name,email', 'approvals.approver:id,name']);

        return response()->json(['data' => $this->serialize($result, (int) $request->user()->id)])
            ->header('Cache-Control', 'no-store, private');
    }

    private function serialize(AdminMfaRecoveryRequest $request, int $viewerId): array
    {
        return [
            'id' => $request->id,
            'target' => ['name' => $request->requester->name, 'email' => $request->requester->email],
            'reason' => $request->reason,
            'status' => $request->status->value,
            'requested_at' => $request->requested_at->toISOString(),
            'expires_at' => $request->expires_at->toISOString(),
            'approvals' => $request->approvals->map(fn ($approval): array => [
                'approver' => $approval->approver->name,
                'decision' => $approval->decision,
                'reason' => $approval->reason,
                'decided_at' => $approval->decided_at->toISOString(),
            ])->values(),
            'prior_vote' => $request->approvals->firstWhere('approver_id', $viewerId)?->decision,
        ];
    }
}
