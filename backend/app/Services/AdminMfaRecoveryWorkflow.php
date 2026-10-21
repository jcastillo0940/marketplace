<?php

namespace App\Services;

use App\Enums\AdminMfaRecoveryStatus;
use App\Models\AdminMfaRecoveryRequest;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class AdminMfaRecoveryWorkflow
{
    private const OPEN_STATUSES = ['pending_first_approval', 'awaiting_second_approval'];

    public function request(User $target, string $reason): AdminMfaRecoveryRequest
    {
        $this->validateReason($reason);

        return DB::transaction(function () use ($target, $reason): AdminMfaRecoveryRequest {
            $target = User::query()->lockForUpdate()->findOrFail($target->id);
            abort_unless($target->isInternalStaff() && $target->two_factor_confirmed_at, 403);
            $this->expireOpenRequests($target->id);

            $open = AdminMfaRecoveryRequest::query()
                ->where('requester_user_id', $target->id)
                ->whereIn('status', self::OPEN_STATUSES)
                ->lockForUpdate()
                ->first();
            if ($open) {
                return $open;
            }
            if ($target->mfa_recovery_request_id) {
                $linked = AdminMfaRecoveryRequest::query()->find($target->mfa_recovery_request_id);
                abort_if($linked?->status === AdminMfaRecoveryStatus::Approved, 409, 'La reinscripción de MFA ya está pendiente.');
            }

            $now = now();
            $ttl = max(1, min(168, (int) config('security.mfa_recovery.ttl_hours', 72)));
            $request = AdminMfaRecoveryRequest::query()->create([
                'requester_user_id' => $target->id,
                'reason' => trim($reason),
                'status' => AdminMfaRecoveryStatus::PendingFirstApproval,
                'requested_at' => $now,
                'expires_at' => $now->copy()->addHours($ttl),
            ]);
            $target->forceFill([
                'mfa_recovery_locked_at' => $now,
                'mfa_recovery_request_id' => $request->id,
            ])->save();
            $this->audit($target->id, 'admin.mfa_recovery.requested', $request, null, $request->status->value, trim($reason));

            return $request;
        });
    }

    public function decide(AdminMfaRecoveryRequest $request, \Illuminate\Contracts\Auth\Authenticatable $actor, string $decision, string $reason): AdminMfaRecoveryRequest
    {
        $this->validateReason($reason);
        abort_unless(in_array($decision, ['approve', 'reject'], true), 422, 'Decisión no válida.');

        return DB::transaction(function () use ($request, $actor, $decision, $reason): AdminMfaRecoveryRequest {
            $requesterId = AdminMfaRecoveryRequest::query()->whereKey($request->id)->value('requester_user_id');
            abort_unless($requesterId, 404);
            $target = User::query()->lockForUpdate()->findOrFail($requesterId);
            $lockedRequest = AdminMfaRecoveryRequest::query()->lockForUpdate()->findOrFail($request->id);
            $this->expireRequestIfNeeded($lockedRequest);
            abort_unless($actor->isInternalStaff() && $actor->two_factor_confirmed_at && $actor->hasPermission('security.mfa_recovery.review'), 403);
            abort_if((int) $actor->id === (int) $target->id, 403, 'No puedes revisar tu propia solicitud.');
            abort_unless($lockedRequest->status?->isOpen(), 409, 'La solicitud ya no está abierta.');
            abort_if($lockedRequest->approvals()->where('approver_id', $actor->id)->exists(), 409, 'Ya registraste una decisión para esta solicitud.');

            $lockedRequest->approvals()->create([
                'approver_id' => $actor->id,
                'decision' => $decision,
                'reason' => trim($reason),
                'decided_at' => now(),
            ]);

            $before = $lockedRequest->status->value;
            if ($decision === 'reject') {
                $lockedRequest->status = AdminMfaRecoveryStatus::Rejected;
                $lockedRequest->closed_at = now();
            } else {
                $approvalCount = $lockedRequest->approvals()->where('decision', 'approve')->count();
                if ($approvalCount === 1) {
                    $lockedRequest->status = AdminMfaRecoveryStatus::AwaitingSecondApproval;
                } elseif ($approvalCount === 2) {
                    $lockedRequest->status = AdminMfaRecoveryStatus::Approved;
                    $lockedRequest->closed_at = now();
                    $target->forceFill(['two_factor_secret' => null, 'two_factor_confirmed_at' => null])->save();
                } else {
                    abort(409, 'La solicitud requiere exactamente dos aprobaciones distintas.');
                }
            }
            $lockedRequest->save();
            $action = $decision === 'reject' ? 'admin.mfa_recovery.rejected' : 'admin.mfa_recovery.approved';
            $this->audit($actor->id, $action, $lockedRequest, $before, $lockedRequest->status->value, trim($reason));

            return $lockedRequest->fresh(['approvals.approver']);
        });
    }

    public function cancelOrUnlockWithTotp(User $user): void
    {
        DB::transaction(function () use ($user): void {
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $this->expireOpenRequests($user->id);
            $request = $user->mfa_recovery_request_id
                ? AdminMfaRecoveryRequest::query()->lockForUpdate()->find($user->mfa_recovery_request_id)
                : null;
            if ($request?->status?->isOpen()) {
                $before = $request->status->value;
                $request->forceFill(['status' => AdminMfaRecoveryStatus::Cancelled, 'closed_at' => now()])->save();
                $this->audit($user->id, 'admin.mfa_recovery.cancelled', $request, $before, 'cancelled', 'La persona demostró posesión del autenticador anterior.');
            } elseif ($user->mfa_recovery_locked_at && $request?->status !== AdminMfaRecoveryStatus::Approved) {
                $this->audit($user->id, 'admin.mfa_recovery.unlocked_by_totp', $request, $request?->status?->value, $request?->status?->value, 'La persona demostró posesión del autenticador anterior.');
            } else {
                return;
            }

            $user->forceFill(['mfa_recovery_locked_at' => null, 'mfa_recovery_request_id' => null])->save();
        });
    }

    public function completeEnrollment(User $user): void
    {
        DB::transaction(function () use ($user): void {
            $lockedUser = User::query()->lockForUpdate()->findOrFail($user->id);
            $request = $lockedUser->mfa_recovery_request_id
                ? AdminMfaRecoveryRequest::query()->lockForUpdate()->find($lockedUser->mfa_recovery_request_id)
                : null;
            if (! $request || $request->status !== AdminMfaRecoveryStatus::Approved) {
                return;
            }

            $request->forceFill(['status' => AdminMfaRecoveryStatus::Enrolled, 'closed_at' => now()])->save();
            $lockedUser->forceFill(['mfa_recovery_locked_at' => null, 'mfa_recovery_request_id' => null])->save();
            $this->audit($lockedUser->id, 'admin.mfa_recovery.enrolled', $request, 'approved', 'enrolled', 'La persona confirmó el nuevo autenticador.');
        });
    }

    public function expireOpenRequests(?int $targetUserId = null): int
    {
        $query = AdminMfaRecoveryRequest::query()->whereIn('status', self::OPEN_STATUSES)->where('expires_at', '<=', now());
        if ($targetUserId !== null) {
            $query->where('requester_user_id', $targetUserId);
        }
        $ids = $query->orderBy('requester_user_id')->orderBy('id')->pluck('id');
        $expired = 0;
        foreach ($ids as $id) {
            $requesterId = AdminMfaRecoveryRequest::query()->whereKey($id)->value('requester_user_id');
            if (! $requesterId) {
                continue;
            }
            $wasExpired = DB::transaction(function () use ($requesterId, $id): bool {
                User::query()->lockForUpdate()->find($requesterId);
                $request = AdminMfaRecoveryRequest::query()->lockForUpdate()->find($id);
                if (! $request || ! $request->status?->isOpen() || $request->expires_at->isFuture()) {
                    return false;
                }
                $before = $request->status->value;
                $request->forceFill(['status' => AdminMfaRecoveryStatus::Expired, 'closed_at' => now()])->save();
                $this->audit(null, 'admin.mfa_recovery.expired', $request, $before, 'expired', 'La solicitud venció antes de completar la revisión.');

                return true;
            });
            $expired += (int) $wasExpired;
        }

        return $expired;
    }

    private function expireRequestIfNeeded(AdminMfaRecoveryRequest $request): void
    {
        if ($request->status?->isOpen() && $request->expires_at->isPast()) {
            $before = $request->status->value;
            $request->forceFill(['status' => AdminMfaRecoveryStatus::Expired, 'closed_at' => now()])->save();
            $this->audit(null, 'admin.mfa_recovery.expired', $request, $before, 'expired', 'La solicitud venció antes de completar la revisión.');
        }
    }

    private function validateReason(string $reason): void
    {
        $length = mb_strlen(trim($reason));
        if ($length < 10 || $length > 1000) {
            throw ValidationException::withMessages(['reason' => ['El motivo debe tener entre 10 y 1,000 caracteres.']]);
        }
    }

    private function audit(?int $actorId, string $action, AdminMfaRecoveryRequest $request, ?string $before, ?string $after, string $reason): void
    {
        AuditLog::query()->create([
            'actor_id' => $actorId,
            'action' => $action,
            'resource_type' => 'admin_mfa_recovery_request',
            'resource_id' => $request->id,
            'before_values' => $before === null ? null : ['status' => $before],
            'after_values' => $after === null ? ['status' => $request->status->value] : ['status' => $after],
            'reason' => $reason,
            'created_at' => now(),
        ]);
    }
}
