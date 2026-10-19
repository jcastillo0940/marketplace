<?php

namespace Tests\Feature\Authorization;

use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MessageTemplateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function confirmedAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->roles()->attach(Role::where('name', 'admin')->firstOrFail()->id);
        $admin->forceFill(['two_factor_secret' => 'test-secret', 'two_factor_confirmed_at' => now()])->save();

        return $admin;
    }

    public function test_public_contact_templates_keep_manual_fallback_messages_available(): void
    {
        $this->getJson('/api/message-templates')->assertOk()
            ->assertJsonPath('data.product', 'Hola, vi tu oferta de {product_title} en Mercado Solidario. ¿Sigue disponible?')
            ->assertJsonPath('data.producer', 'Hola, encontré el perfil de {producer_name} en Mercado Solidario. ¿Me puedes contar sobre tus ofertas?');
    }

    public function test_authorized_admin_updates_a_versioned_template_and_public_clients_receive_the_new_text(): void
    {
        $admin = $this->confirmedAdmin();
        $body = 'Hola, vi {product_title} de {producer_name} en Mercado Solidario. ¿Sigue disponible?';

        $this->actingAs($admin)->putJson('/api/admin/message-templates/product', ['body' => $body])
            ->assertOk()
            ->assertJsonPath('data.key', 'product')
            ->assertJsonPath('data.version', 2)
            ->assertJsonPath('data.body', $body)
            ->assertJsonPath('data.updated_by.name', $admin->name)
            ->assertJsonPath('data.history.0.version', 2);

        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $admin->id,
            'action' => 'message_template.updated',
            'resource_type' => 'message_template',
            'reason' => 'Actualizó la plantilla de contacto de producto.',
        ]);
        $this->assertSame($body, AuditLog::query()->where('action', 'message_template.updated')->firstOrFail()->after_values['body']);
        $this->getJson('/api/message-templates')->assertOk()->assertJsonPath('data.product', $body);
    }

    public function test_template_management_requires_admin_mfa_permission_and_required_placeholders(): void
    {
        $this->putJson('/api/admin/message-templates/product', ['body' => 'Hola, ¿sigue disponible?'])->assertUnauthorized();

        $support = User::factory()->create();
        $support->roles()->attach(Role::where('name', 'support_operator')->firstOrFail()->id);
        $support->forceFill(['two_factor_secret' => 'test-secret', 'two_factor_confirmed_at' => now()])->save();
        $this->actingAs($support)->putJson('/api/admin/message-templates/product', ['body' => 'Hola, ¿sigue disponible?'])->assertForbidden();

        $admin = User::factory()->create();
        $admin->roles()->attach(Role::where('name', 'admin')->firstOrFail()->id);
        $this->actingAs($admin)->putJson('/api/admin/message-templates/product', ['body' => 'Hola, ¿sigue disponible?'])->assertStatus(428);

        $admin = $this->confirmedAdmin();
        $admin->roles()->firstOrFail()->permissions()->syncWithoutDetaching([Permission::where('name', 'messages.manage')->value('id')]);
        $this->actingAs($admin)->putJson('/api/admin/message-templates/product', ['body' => 'Hola, ¿sigue disponible?'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['body']);
        $this->putJson('/api/admin/message-templates/product', ['body' => str_repeat('x', 501)])->assertUnprocessable();
    }
}
