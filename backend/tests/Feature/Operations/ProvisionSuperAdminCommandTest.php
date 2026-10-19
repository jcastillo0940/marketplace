<?php

namespace Tests\Feature\Operations;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProvisionSuperAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_first_super_admin_bootstrap_fails_closed_without_an_interactive_terminal(): void
    {
        $this->artisan('marketplace:provision-super-admin', [
            'email' => 'bootstrap-probe@example.invalid',
            'name' => 'Bootstrap Probe',
            '--no-interaction' => true,
        ])
            ->expectsOutputToContain('Se requiere una terminal interactiva')
            ->assertExitCode(1);

        $this->assertDatabaseCount('users', 0);
        $this->assertDatabaseCount('audit_logs', 0);
    }
}
