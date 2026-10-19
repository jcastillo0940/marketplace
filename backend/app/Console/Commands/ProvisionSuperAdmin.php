<?php

namespace App\Console\Commands;

use App\Models\AuditLog;
use App\Models\Role;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Throwable;

use function Laravel\Prompts\password;

class ProvisionSuperAdmin extends Command
{
    protected $signature = 'marketplace:provision-super-admin {email : Correo institucional del primer superadministrador} {name : Nombre de la persona responsable}';

    protected $description = 'Crea de forma interactiva el primer superadministrador y deja auditoría.';

    public function handle(): int
    {
        if (! $this->input->isInteractive() || ! stream_isatty(STDIN)) {
            $this->components->error('Se requiere una terminal interactiva para solicitar la contraseña de forma segura.');

            return self::FAILURE;
        }

        $email = mb_strtolower(trim((string) $this->argument('email')));
        $name = trim((string) $this->argument('name'));

        $validator = Validator::make(compact('email', 'name'), [
            'email' => ['required', 'email', 'max:255'],
            'name' => ['required', 'string', 'min:2', 'max:255'],
        ]);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $error) {
                $this->components->error($error);
            }

            return self::INVALID;
        }

        if (User::query()->whereHas('roles', fn ($query) => $query->where('name', 'super_admin'))->exists()) {
            $this->components->error('Ya existe un superadministrador. Este comando solo aprovisiona la cuenta inicial.');

            return self::FAILURE;
        }

        if (User::query()->where('email', $email)->exists()) {
            $this->components->error('Ya existe una cuenta con ese correo. No se modificaron usuarios ni roles.');

            return self::FAILURE;
        }

        if (! Role::query()->where('name', 'super_admin')->exists()) {
            $this->components->error('No existe el rol super_admin. Ejecuta primero las migraciones y seeders de referencia.');

            return self::FAILURE;
        }

        $password = password(
            label: 'Contraseña inicial (mínimo 14 caracteres)',
            required: true,
            validate: fn (string $value): ?string => strlen($value) < 14 ? 'Usa al menos 14 caracteres.' : null,
        );
        $confirmation = password(
            label: 'Confirma la contraseña',
            required: true,
            validate: fn (string $value): ?string => hash_equals($password, $value) ? null : 'Las contraseñas no coinciden.',
        );

        if (! hash_equals($password, $confirmation)) {
            $this->components->error('Las contraseñas no coinciden.');

            return self::FAILURE;
        }

        try {
            $user = DB::transaction(function () use ($email, $name, $password): User {
                $role = Role::query()->where('name', 'super_admin')->lockForUpdate()->first();

                if (! $role) {
                    throw new \RuntimeException('No existe el rol super_admin. Ejecuta primero las migraciones y seeders de referencia.');
                }

                if (User::query()->whereHas('roles', fn ($query) => $query->where('name', 'super_admin'))->exists()) {
                    throw new \RuntimeException('Ya existe un superadministrador. No se creó otra cuenta.');
                }

                if (User::query()->where('email', $email)->exists()) {
                    throw new \RuntimeException('Ya existe una cuenta con ese correo. No se modificaron usuarios ni roles.');
                }

                $user = User::query()->create([
                    'name' => $name,
                    'email' => $email,
                    'password' => $password,
                ]);

                $user->roles()->attach($role->id, ['assigned_at' => now()]);

                AuditLog::query()->create([
                    'actor_id' => null,
                    'action' => 'admin.bootstrap_super_admin_created',
                    'resource_type' => 'user',
                    'resource_id' => $user->id,
                    'after_values' => ['email' => $email, 'role' => 'super_admin'],
                    'reason' => 'Aprovisionamiento inicial por consola.',
                    'created_at' => now(),
                ]);

                return $user;
            });
        } catch (\RuntimeException $exception) {
            $this->components->error($exception->getMessage());

            return self::FAILURE;
        } catch (Throwable) {
            $this->components->error('No se pudo aprovisionar la cuenta. Revisa los logs del servicio; no se guardó una contraseña en ellos.');

            return self::FAILURE;
        }

        $this->components->info("Superadministrador {$user->email} creado.");
        $this->line('Inicia sesión y completa la configuración y confirmación de MFA antes de usar la administración.');

        return self::SUCCESS;
    }
}
