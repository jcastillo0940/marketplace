<?php

namespace Tests\Feature\Authorization;

use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\ProducerProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProducerVerificationLevelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_authorized_admin_can_promote_and_downgrade_verification_levels_with_audit_history(): void
    {
        $admin = $this->adminWithVerificationPermission();
        $profile = $this->confirmedProfile();

        $this->actingAs($admin)->putJson("/api/admin/producers/{$profile->id}/trust-level", [
            'level' => 'producer_validated',
            'reason' => 'Intento de omitir la revisión intermedia.',
        ])->assertUnprocessable();

        $this->assertDatabaseCount('producer_trust_reviews', 0);

        $this->putJson("/api/admin/producers/{$profile->id}/trust-level", [
            'level' => 'identity_reviewed',
            'reason' => 'Identidad revisada según el procedimiento aprobado.',
        ])->assertOk()->assertJsonPath('data.verification_level', 'identity_reviewed');

        $this->putJson("/api/admin/producers/{$profile->id}/trust-level", [
            'level' => 'producer_validated',
            'reason' => 'Validación de productor completada.',
        ])->assertOk()->assertJsonPath('data.verification_level', 'producer_validated');

        $this->putJson("/api/admin/producers/{$profile->id}/trust-level", [
            'level' => 'contact_confirmed',
            'reason' => 'Retirar las revisiones manuales tras una reevaluación.',
        ])->assertOk()->assertJsonPath('data.verification_level', 'contact_confirmed');

        $this->assertDatabaseCount('producer_trust_reviews', 3);
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $admin->id,
            'action' => 'producer.trust_level_changed',
            'resource_type' => 'producer_profile',
            'resource_id' => $profile->id,
        ]);
        $this->assertSame(3, AuditLog::query()->where('action', 'producer.trust_level_changed')->count());
    }

    public function test_verification_level_requires_current_phone_confirmation_and_a_reason(): void
    {
        $admin = $this->adminWithVerificationPermission();
        $profile = $this->confirmedProfile(['contact_level' => 'unverified', 'phone_public' => null, 'phone_verified_at' => null]);

        $this->actingAs($admin)->putJson("/api/admin/producers/{$profile->id}/trust-level", [
            'level' => 'identity_reviewed',
            'reason' => 'La identidad se revisó.',
        ])->assertUnprocessable();

        $profile->refresh();
        $this->assertSame('contact_confirmed', $profile->verification_level);

        $confirmed = $this->confirmedProfile();
        $this->putJson("/api/admin/producers/{$confirmed->id}/trust-level", [
            'level' => 'identity_reviewed',
            'reason' => 'corto',
        ])->assertUnprocessable()->assertJsonValidationErrors('reason');
    }

    public function test_verification_management_requires_its_permission_and_admin_mfa(): void
    {
        $profile = $this->confirmedProfile();
        $admin = $this->adminWithVerificationPermission();
        $admin->forceFill(['two_factor_confirmed_at' => null])->save();

        $this->actingAs($admin)->putJson("/api/admin/producers/{$profile->id}/trust-level", [
            'level' => 'identity_reviewed',
            'reason' => 'Revisión aprobada.',
        ])->assertStatus(428);

        $other = User::factory()->create();
        $other->forceFill(['two_factor_secret' => 'test-secret', 'two_factor_confirmed_at' => now()])->save();
        $other->roles()->attach(Role::query()->where('name', 'moderator')->value('id'), ['assigned_at' => now()]);

        $this->actingAs($other)->putJson("/api/admin/producers/{$profile->id}/trust-level", [
            'level' => 'identity_reviewed',
            'reason' => 'Revisión aprobada.',
        ])->assertForbidden();
    }

    public function test_dedicated_verification_reviewer_can_read_the_producer_detail_needed_for_review(): void
    {
        $profile = $this->confirmedProfile();
        $reviewer = User::factory()->create();
        $reviewer->forceFill(['two_factor_secret' => 'test-secret', 'two_factor_confirmed_at' => now()])->save();
        $role = Role::query()->create(['name' => 'trust_reviewer', 'display_name' => 'Trust reviewer']);
        $permission = Permission::query()->where('name', 'producers.verify')->firstOrFail();
        $role->permissions()->attach($permission->id);
        $reviewer->roles()->attach($role->id, ['assigned_at' => now()]);

        $this->actingAs($reviewer)->getJson('/api/admin/producers')
            ->assertOk()
            ->assertJsonPath('data.0.id', $profile->id)
            ->assertJsonPath('data.0.account', null)
            ->assertJsonMissingPath('data.0.account.email');

        $this->getJson("/api/admin/producers/{$profile->id}")
            ->assertOk()
            ->assertJsonPath('data.producer.id', $profile->id)
            ->assertJsonPath('data.trust_reviews', []);
    }

    public function test_public_producer_profile_exposes_only_the_level_and_plain_label(): void
    {
        $profile = $this->confirmedProfile(['slug' => 'nivel-publico', 'profile_status' => 'active']);
        $admin = $this->adminWithVerificationPermission();

        $this->actingAs($admin)->putJson("/api/admin/producers/{$profile->id}/trust-level", [
            'level' => 'identity_reviewed',
            'reason' => 'Nota interna que nunca debe ser pública.',
        ])->assertOk();

        $this->getJson('/api/producers/nivel-publico')
            ->assertOk()
            ->assertJsonPath('data.verification_level', 'identity_reviewed')
            ->assertJsonPath('data.verification_label', 'Identidad revisada')
            ->assertJsonMissing(['reason' => 'Nota interna que nunca debe ser pública.'])
            ->assertJsonMissingPath('data.trust_reviews')
            ->assertJsonMissingPath('data.phone_private');
    }

    private function adminWithVerificationPermission(): User
    {
        $admin = User::factory()->create();
        $admin->forceFill(['two_factor_secret' => 'test-secret', 'two_factor_confirmed_at' => now()])->save();
        $role = Role::query()->where('name', 'admin')->firstOrFail();
        $permission = Permission::query()->firstOrCreate(['name' => 'producers.verify'], ['description' => 'producers verify']);
        $role->permissions()->syncWithoutDetaching([$permission->id]);
        $admin->roles()->attach($role->id, ['assigned_at' => now()]);

        return $admin;
    }

    private function confirmedProfile(array $attributes = []): ProducerProfile
    {
        $user = User::factory()->create();

        return $user->producerProfile()->create(array_merge([
            'slug' => 'verification-profile-'.$user->id,
            'public_name' => 'Productor en revisión',
            'phone_private' => '+50760000001',
            'phone_public' => '+50760000001',
            'phone_verified_at' => now(),
            'contact_level' => 'contact_confirmed',
            'profile_status' => 'active',
        ], $attributes));
    }
}
