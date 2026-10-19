<?php

namespace Tests\Feature\Authorization;

use App\Models\AdminMfaRecoveryRequest;
use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\AdminMfaRecoveryWorkflow;
use App\Services\Totp;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class AdminMfaRecoveryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        $this->withServerVariables(['REMOTE_ADDR' => '10.77.'.random_int(1, 254).'.'.random_int(1, 254)]);
    }

    public function test_request_sets_lock_and_returns_existing_open_request(): void
    {
        $target = $this->staff('target');
        $workflow = app(AdminMfaRecoveryWorkflow::class);

        $first = $workflow->request($target, 'Perdí acceso al dispositivo autenticador.');
        $second = $workflow->request($target->fresh(), 'Motivo duplicado no debe reemplazar el original.');

        $this->assertSame($first->id, $second->id);
        $this->assertSame('pending_first_approval', $second->status->value);
        $this->assertSame('Perdí acceso al dispositivo autenticador.', $second->reason);
        $this->assertNotNull($target->fresh()->mfa_recovery_locked_at);
        $this->assertSame($first->id, $target->fresh()->mfa_recovery_request_id);
        $this->assertDatabaseCount('admin_mfa_recovery_requests', 1);
    }

    public function test_request_serializes_concurrent_open_requests(): void
    {
        // The service serializes the target row before checking for an open request.
        // SQLite's in-memory feature DB cannot run two concurrent connections, so
        // assert the idempotent outcome through separate hydrated model instances.
        $target = $this->staff('target');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $first = $workflow->request($target, 'Perdí acceso al dispositivo autenticador.');
        $second = $workflow->request(User::query()->findOrFail($target->id), 'Reintento concurrente del navegador.');

        $this->assertSame($first->id, $second->id);
        $this->assertDatabaseCount('admin_mfa_recovery_requests', 1);
    }

    public function test_approval_requires_two_distinct_reviewers_and_removes_seed_only_on_second(): void
    {
        $target = $this->staff('target');
        $firstReviewer = $this->reviewer('reviewer-one');
        $secondReviewer = $this->reviewer('reviewer-two');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $request = $workflow->request($target, 'Pérdida reportada del teléfono institucional.');

        $workflow->decide($request, $firstReviewer, 'approve', 'Verifiqué identidad por procedimiento interno.');
        $target->refresh();
        $this->assertSame('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', $target->two_factor_secret);
        $this->assertNotNull($target->two_factor_confirmed_at);
        $this->assertSame('awaiting_second_approval', $request->fresh()->status->value);

        $workflow->decide($request->fresh(), $secondReviewer, 'approve', 'Confirmé identidad con responsable de área.');
        $target->refresh();
        $this->assertNull($target->two_factor_secret);
        $this->assertNull($target->two_factor_confirmed_at);
        $this->assertNotNull($target->mfa_recovery_locked_at);
        $this->assertSame($request->id, $target->mfa_recovery_request_id);
        $this->assertSame('approved', $request->fresh()->status->value);
        $this->assertSame(2, $request->approvals()->distinct('approver_id')->count('approver_id'));
        $this->assertSame(2, $request->approvals()->count());
    }

    public function test_rejection_is_terminal_and_keeps_lock_and_seed(): void
    {
        $target = $this->staff('target');
        $reviewer = $this->reviewer('reviewer-one');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $request = $workflow->request($target, 'No encuentro el autenticador asignado.');

        $workflow->decide($request, $reviewer, 'reject', 'No fue posible completar la verificación institucional.');

        $this->assertSame('rejected', $request->fresh()->status->value);
        $this->assertSame('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', $target->fresh()->two_factor_secret);
        $this->assertNotNull($target->fresh()->mfa_recovery_locked_at);
    }

    public function test_expired_request_cannot_be_decided_and_is_audited(): void
    {
        $target = $this->staff('target');
        $reviewer = $this->reviewer('reviewer-one');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $request = $workflow->request($target, 'El dispositivo MFA fue reemplazado.');
        $request->forceFill(['expires_at' => now()->subSecond()])->save();

        $workflow->expireOpenRequests($target->id);

        $this->assertSame('expired', $request->fresh()->status->value);
        $this->assertDatabaseHas('audit_logs', ['action' => 'admin.mfa_recovery.expired', 'resource_id' => $request->id]);
        $this->expectException(HttpException::class);
        $workflow->decide($request->fresh(), $reviewer, 'approve', 'Revisión posterior al vencimiento.');
    }

    public function test_second_approval_transaction_failure_preserves_seed_and_state(): void
    {
        $target = $this->staff('target');
        $reviewerOne = $this->reviewer('reviewer-one');
        $reviewerTwo = $this->reviewer('reviewer-two');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $request = $workflow->request($target, 'Extravié el autenticador registrado.');
        $workflow->decide($request, $reviewerOne, 'approve', 'Identidad verificada con el expediente.');

        Event::listen(QueryExecuted::class, function (QueryExecuted $query): void {
            if (str_contains(strtolower($query->sql), 'insert into "audit_logs"')) {
                throw new RuntimeException('Injected audit failure');
            }
        });
        try {
            $workflow->decide($request->fresh(), $reviewerTwo, 'approve', 'Segunda verificación independiente aprobada.');
            $this->fail('Expected the injected transaction failure.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Injected audit failure', $exception->getMessage());
        }

        $this->assertSame('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', $target->fresh()->two_factor_secret);
        $this->assertSame('awaiting_second_approval', $request->fresh()->status->value);
        $this->assertSame(1, $request->approvals()->count());
    }

    public function test_configured_expiry_is_clamped_between_one_and_168_hours(): void
    {
        config(['security.mfa_recovery.ttl_hours' => 0]);
        $target = $this->staff('target');
        $short = app(AdminMfaRecoveryWorkflow::class)->request($target, 'Necesito recuperar el MFA de administración.');
        $this->assertTrue($short->expires_at->equalTo($short->created_at->copy()->addHour()));

        $short->forceFill(['status' => 'cancelled', 'closed_at' => now()])->save();
        config(['security.mfa_recovery.ttl_hours' => 999]);
        $long = app(AdminMfaRecoveryWorkflow::class)->request($target->fresh(), 'La solicitud nueva reemplaza la solicitud cerrada.');
        $this->assertTrue($long->expires_at->equalTo($long->created_at->copy()->addHours(168)));
    }

    public function test_pending_staff_can_request_recovery_without_receiving_authenticated_session(): void
    {
        $target = $this->staff('pending-requester');
        $response = $this->withSession($this->pendingChallenge($target))->postJson('/api/auth/mfa/recovery-requests', [
            'reason' => 'Perdí el teléfono con mi aplicación autenticadora.',
        ]);

        $response->assertAccepted()->assertJsonPath('message', 'Si la solicitud puede procesarse, recibirás instrucciones para continuar.');
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
        $this->assertGuest();
        $this->assertNotNull($target->fresh()->mfa_recovery_locked_at);
    }

    public function test_request_endpoint_does_not_accept_a_client_user_id(): void
    {
        $target = $this->staff('pending-requester');
        $other = $this->staff('other-target');
        $this->withSession($this->pendingChallenge($target))->postJson('/api/auth/mfa/recovery-requests', [
            'user_id' => $other->id,
            'reason' => 'Perdí el teléfono con mi aplicación autenticadora.',
        ])->assertAccepted();

        $this->assertNotNull($target->fresh()->mfa_recovery_locked_at);
        $this->assertNull($other->fresh()->mfa_recovery_locked_at);
        $this->assertDatabaseHas('admin_mfa_recovery_requests', ['requester_user_id' => $target->id]);
    }

    public function test_request_is_generic_for_an_existing_open_request(): void
    {
        $target = $this->staff('pending-requester');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $workflow->request($target, 'Solicitud ya registrada con el motivo original.');
        $response = $this->withSession($this->pendingChallenge($target))->postJson('/api/auth/mfa/recovery-requests', [
            'reason' => 'Reintento de una solicitud que ya existe.',
        ])->assertAccepted();

        $this->assertSame('Si la solicitud puede procesarse, recibirás instrucciones para continuar.', $response->json('message'));
        $this->assertDatabaseCount('admin_mfa_recovery_requests', 1);
        $this->assertDatabaseHas('admin_mfa_recovery_requests', ['reason' => 'Solicitud ya registrada con el motivo original.']);
    }

    public function test_request_rejects_missing_or_expired_challenge_without_disclosing_account(): void
    {
        $target = $this->staff('pending-requester');
        $this->postJson('/api/auth/mfa/recovery-requests', ['reason' => 'Perdí el dispositivo del segundo factor.'])->assertUnauthorized();
        $this->withSession($this->pendingChallenge($target, now()->subSecond()->timestamp))
            ->postJson('/api/auth/mfa/recovery-requests', ['reason' => 'Perdí el dispositivo del segundo factor.'])
            ->assertUnauthorized();
        $this->assertDatabaseCount('admin_mfa_recovery_requests', 0);
    }

    public function test_request_reason_validation_preserves_csrf_and_auth_throttle(): void
    {
        $target = $this->staff('pending-requester');
        $this->withSession($this->pendingChallenge($target))->postJson('/api/auth/mfa/recovery-requests', ['reason' => 'breve'])
            ->assertUnprocessable()->assertJsonValidationErrors('reason');
        $middleware = app('router')->getRoutes()->match(Request::create('/api/auth/mfa/recovery-requests', 'POST'))->gatherMiddleware();
        $this->assertContains('web', $middleware);
        $this->assertContains('throttle:auth', $middleware);
    }

    public function test_valid_old_totp_cancels_open_request_and_unlocks(): void
    {
        $target = $this->staff('pending-requester');
        $request = app(AdminMfaRecoveryWorkflow::class)->request($target, 'Perdí temporalmente el dispositivo MFA.');
        $code = app(Totp::class)->code($target->two_factor_secret, intdiv(now()->timestamp, 30));

        $this->withSession($this->pendingChallenge($target))->postJson('/api/auth/mfa/challenge', ['code' => $code])
            ->assertOk()->assertJsonPath('data.authenticated', true);

        $this->assertSame('cancelled', $request->fresh()->status->value);
        $this->assertNull($target->fresh()->mfa_recovery_locked_at);
        $this->assertAuthenticatedAs($target);
    }

    public function test_valid_old_totp_expires_stale_request_then_unlocks(): void
    {
        $target = $this->staff('pending-requester');
        $request = app(AdminMfaRecoveryWorkflow::class)->request($target, 'Perdí temporalmente el dispositivo MFA.');
        $request->forceFill(['expires_at' => now()->subSecond()])->save();
        $code = app(Totp::class)->code($target->two_factor_secret, intdiv(now()->timestamp, 30));

        $this->withSession($this->pendingChallenge($target))->postJson('/api/auth/mfa/challenge', ['code' => $code])->assertOk();

        $this->assertSame('expired', $request->fresh()->status->value);
        $this->assertNull($target->fresh()->mfa_recovery_locked_at);
        $this->assertDatabaseHas('audit_logs', ['action' => 'admin.mfa_recovery.unlocked_by_totp', 'resource_id' => $request->id]);
    }

    public function test_valid_old_totp_unlocks_after_terminal_request(): void
    {
        $target = $this->staff('pending-requester');
        $reviewer = $this->reviewer('reviewer-one');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $request = $workflow->request($target, 'Perdí temporalmente el dispositivo MFA.');
        $workflow->decide($request, $reviewer, 'reject', 'La verificación solicitada no pudo confirmarse.');
        $code = app(Totp::class)->code($target->two_factor_secret, intdiv(now()->timestamp, 30));

        $this->withSession($this->pendingChallenge($target))->postJson('/api/auth/mfa/challenge', ['code' => $code])->assertOk();

        $this->assertSame('rejected', $request->fresh()->status->value);
        $this->assertNull($target->fresh()->mfa_recovery_locked_at);
        $this->assertDatabaseHas('audit_logs', ['action' => 'admin.mfa_recovery.unlocked_by_totp', 'resource_id' => $request->id]);
    }

    public function test_invalid_old_totp_keeps_request_and_lock(): void
    {
        $target = $this->staff('pending-requester');
        $request = app(AdminMfaRecoveryWorkflow::class)->request($target, 'Perdí temporalmente el dispositivo MFA.');

        $this->withSession($this->pendingChallenge($target))->postJson('/api/auth/mfa/challenge', ['code' => '000000'])
            ->assertUnprocessable()->assertJsonValidationErrors('code');

        $this->assertSame('pending_first_approval', $request->fresh()->status->value);
        $this->assertNotNull($target->fresh()->mfa_recovery_locked_at);
        $this->assertGuest();
    }

    public function test_queue_requires_mfa_and_dedicated_permission(): void
    {
        $noMfa = $this->staff('no-mfa-reviewer');
        $noMfa->forceFill(['two_factor_secret' => null, 'two_factor_confirmed_at' => null])->save();
        $this->actingAs($noMfa)->getJson('/api/admin/mfa-recovery-requests')->assertStatus(428);

        $ordinaryStaff = User::factory()->create(['email' => 'ordinary-staff@example.test']);
        $ordinaryStaff->forceFill(['two_factor_secret' => 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'two_factor_confirmed_at' => now()])->save();
        $ordinaryStaff->roles()->attach(Role::query()->where('name', 'moderator')->value('id'), ['assigned_at' => now()]);
        $this->actingAs($ordinaryStaff)->getJson('/api/admin/mfa-recovery-requests')->assertForbidden();

        $this->actingAs($this->reviewer('reviewer-one'))->getJson('/api/admin/mfa-recovery-requests')->assertOk();
    }

    public function test_queue_returns_only_open_requests_and_minimal_fields(): void
    {
        $target = $this->staff('target');
        $reviewer = $this->reviewer('reviewer-one');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $open = $workflow->request($target, 'El teléfono con autenticador se extravió.');
        $closed = $workflow->request($this->staff('closed-target'), 'Necesito restablecer el autenticador perdido.');
        $workflow->decide($closed, $reviewer, 'reject', 'La verificación institucional no pudo confirmarse.');

        $response = $this->actingAs($reviewer)->getJson('/api/admin/mfa-recovery-requests')->assertOk();
        $response->assertJsonPath('data.0.id', $open->id)
            ->assertJsonPath('data.0.target.name', $target->name)
            ->assertJsonPath('data.0.status', 'pending_first_approval')
            ->assertJsonPath('data.0.prior_vote', null)
            ->assertJsonMissingPath('data.0.target.two_factor_secret');
        $this->assertCount(1, $response->json('data'));
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
    }

    public function test_requester_cannot_review_own_request(): void
    {
        $requester = $this->reviewer('requester-reviewer');
        $request = app(AdminMfaRecoveryWorkflow::class)->request($requester, 'No tengo acceso a mi autenticador habitual.');
        $this->expectException(HttpException::class);
        app(AdminMfaRecoveryWorkflow::class)->decide($request, $requester, 'approve', 'Intento de autorrevisión no permitido.');
    }

    public function test_same_reviewer_cannot_supply_second_approval(): void
    {
        $target = $this->staff('target');
        $reviewer = $this->reviewer('reviewer-one');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $request = $workflow->request($target, 'El autenticador institucional ya no está disponible.');
        $workflow->decide($request, $reviewer, 'approve', 'Verifiqué la identidad con el expediente.');

        $this->actingAs($reviewer)->postJson("/api/admin/mfa-recovery-requests/{$request->id}/decision", [
            'decision' => 'approve',
            'reason' => 'No se permite que una misma persona vote de nuevo.',
        ])->assertStatus(409);
        $this->assertSame(1, $request->approvals()->count());
    }

    public function test_second_distinct_approval_completes_and_locks_out_old_sessions(): void
    {
        $target = $this->staff('target');
        $firstReviewer = $this->reviewer('reviewer-one');
        $secondReviewer = $this->reviewer('reviewer-two');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $request = $workflow->request($target, 'El autenticador se perdió durante un traslado.');
        $workflow->decide($request, $firstReviewer, 'approve', 'Identidad revisada con expediente interno.');
        $workflow->decide($request->fresh(), $secondReviewer, 'approve', 'Verificación independiente aprobada.');

        $this->actingAs($target->fresh())->getJson('/api/admin/metrics')->assertStatus(423);
        $this->assertSame('approved', $request->fresh()->status->value);
        $this->assertNull($target->fresh()->two_factor_secret);
        $this->assertNotNull($target->fresh()->mfa_recovery_locked_at);
    }

    public function test_rejected_expired_or_stale_request_cannot_be_approved(): void
    {
        $target = $this->staff('target');
        $reviewer = $this->reviewer('reviewer-one');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $request = $workflow->request($target, 'El autenticador fue reemplazado sin respaldo.');
        $workflow->decide($request, $reviewer, 'reject', 'No fue posible completar la verificación externa.');

        $this->actingAs($this->reviewer('reviewer-two'))->postJson("/api/admin/mfa-recovery-requests/{$request->id}/decision", [
            'decision' => 'approve',
            'reason' => 'Intento de aprobar una solicitud ya rechazada.',
        ])->assertStatus(409);
        $this->assertSame('rejected', $request->fresh()->status->value);
        $this->assertSame(1, $request->approvals()->count());
    }

    public function test_admin_lock_blocks_preexisting_authenticated_sessions(): void
    {
        $target = $this->staff('target');
        $this->actingAs($target)->getJson('/api/admin/metrics')->assertOk();
        app(AdminMfaRecoveryWorkflow::class)->request($target->fresh(), 'El segundo factor se perdió durante un viaje.');

        $this->actingAs($target->fresh())->getJson('/api/admin/metrics')->assertStatus(423);
        $this->actingAs($target->fresh())->getJson('/api/me')->assertOk();
    }

    public function test_recovery_payload_and_audit_never_include_totp_material(): void
    {
        $target = $this->staff('target');
        $reviewer = $this->reviewer('reviewer-one');
        $secret = $target->two_factor_secret;
        $request = app(AdminMfaRecoveryWorkflow::class)->request($target, 'El autenticador institucional se extravió.');
        $response = $this->actingAs($reviewer)->getJson('/api/admin/mfa-recovery-requests')->assertOk();
        $json = $response->getContent();

        $this->assertStringNotContainsString($secret, $json);
        $this->assertStringNotContainsString('otpauth://', $json);
        $this->assertStringNotContainsString($secret, json_encode(AuditLog::query()->get()->toArray(), JSON_THROW_ON_ERROR));
        $this->assertDatabaseHas('audit_logs', ['resource_id' => $request->id, 'action' => 'admin.mfa_recovery.requested']);
    }

    public function test_approved_request_requires_fresh_enrollment_before_admin_access(): void
    {
        [$target, $request] = $this->approveRecovery();
        $this->actingAs($target->fresh())->getJson('/api/admin/metrics')->assertStatus(423);
        $this->actingAs($target->fresh())->getJson('/api/auth/mfa/setup')
            ->assertOk()->assertJsonPath('data.enabled', false);
        $this->assertSame('approved', $request->fresh()->status->value);
        $this->assertNotNull($target->fresh()->mfa_recovery_locked_at);
    }

    public function test_valid_new_totp_completes_enrollment_and_unlocks(): void
    {
        [$target, $request] = $this->approveRecovery();
        $setup = $this->actingAs($target->fresh())->getJson('/api/auth/mfa/setup')->assertOk()->json('data');
        $code = app(Totp::class)->code($setup['secret'], intdiv(now()->timestamp, 30));

        $this->postJson('/api/auth/mfa/confirm', ['code' => $code])->assertOk()->assertJsonPath('data.enabled', true);

        $this->assertSame('enrolled', $request->fresh()->status->value);
        $this->assertNotNull($target->fresh()->two_factor_confirmed_at);
        $this->assertNull($target->fresh()->mfa_recovery_locked_at);
        $this->assertNull($target->fresh()->mfa_recovery_request_id);
        $this->actingAs($target->fresh())->getJson('/api/admin/metrics')->assertOk();
    }

    public function test_invalid_new_totp_keeps_recovery_lock(): void
    {
        [$target, $request] = $this->approveRecovery();
        $this->actingAs($target->fresh())->getJson('/api/auth/mfa/setup')->assertOk();

        $this->postJson('/api/auth/mfa/confirm', ['code' => '000000'])->assertUnprocessable()->assertJsonValidationErrors('code');

        $this->assertSame('approved', $request->fresh()->status->value);
        $this->assertNull($target->fresh()->two_factor_confirmed_at);
        $this->assertNotNull($target->fresh()->mfa_recovery_locked_at);
        $this->actingAs($target->fresh())->getJson('/api/admin/metrics')->assertStatus(423);
    }

    public function test_initial_mfa_enrollment_does_not_create_recovery_history(): void
    {
        $staff = User::factory()->create(['email' => 'initial-mfa@example.test']);
        $staff->roles()->attach(Role::query()->where('name', 'admin')->value('id'), ['assigned_at' => now()]);
        $this->actingAs($staff)->getJson('/api/auth/mfa/setup')->assertOk();
        $staff->refresh();
        $code = app(Totp::class)->code($staff->two_factor_secret, intdiv(now()->timestamp, 30));

        $this->postJson('/api/auth/mfa/confirm', ['code' => $code])->assertOk();

        $this->assertDatabaseCount('admin_mfa_recovery_requests', 0);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $staff->id, 'action' => 'admin.mfa_enabled']);
    }

    private function staff(string $tag): User
    {
        $user = User::factory()->create(['email' => $tag.'@example.test']);
        $user->forceFill(['two_factor_secret' => 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'two_factor_confirmed_at' => now()])->save();
        $user->roles()->attach(Role::query()->where('name', 'admin')->value('id'), ['assigned_at' => now()]);

        return $user;
    }

    private function reviewer(string $tag): User
    {
        $user = $this->staff($tag);
        $role = Role::query()->where('name', 'admin')->firstOrFail();
        $permission = Permission::query()->firstOrCreate(['name' => 'security.mfa_recovery.review']);
        $role->permissions()->syncWithoutDetaching([$permission->id]);

        return $user;
    }

    private function pendingChallenge(User $user, ?int $expiresAt = null): array
    {
        return [
            'mfa_pending_user_id' => $user->id,
            'mfa_pending_expires_at' => $expiresAt ?? now()->addMinutes(5)->timestamp,
            'mfa_pending_attempts' => 0,
        ];
    }

    /** @return array{0: User, 1: AdminMfaRecoveryRequest} */
    private function approveRecovery(): array
    {
        $target = $this->staff('reenroll-target');
        $workflow = app(AdminMfaRecoveryWorkflow::class);
        $first = $this->reviewer('reenroll-reviewer-one');
        $second = $this->reviewer('reenroll-reviewer-two');
        $request = $workflow->request($target, 'Se requiere recuperar el autenticador administrativo.');
        $workflow->decide($request, $first, 'approve', 'Identidad verificada por el canal institucional.');
        $workflow->decide($request->fresh(), $second, 'approve', 'Aprobación independiente completada.');

        return [$target, $request];
    }
}
