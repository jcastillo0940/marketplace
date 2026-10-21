<?php

namespace App\Console\Commands;

use App\Models\AdminUser;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Throwable;

use function Laravel\Prompts\password;

class CreateAdminUser extends Command
{
    protected $signature = 'admin:create-user {email : Correo del administrador} {name : Nombre completo}';

    protected $description = 'Crea un usuario administrador en la tabla admin_users.';

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

        if (AdminUser::query()->where('email', $email)->exists()) {
            $this->components->error('Ya existe una cuenta de administrador con ese correo.');

            return self::FAILURE;
        }

        $pass = password(
            label: 'Contraseña (mínimo 14 caracteres)',
            required: true,
            validate: fn (string $value): ?string => strlen($value) < 14 ? 'Usa al menos 14 caracteres.' : null,
        );
        $confirmation = password(
            label: 'Confirma la contraseña',
            required: true,
            validate: fn (string $value): ?string => hash_equals($pass, $value) ? null : 'Las contraseñas no coinciden.',
        );

        if (! hash_equals($pass, $confirmation)) {
            $this->components->error('Las contraseñas no coinciden.');

            return self::FAILURE;
        }

        try {
            $user = DB::transaction(function () use ($email, $name, $pass): AdminUser {
                if (AdminUser::query()->where('email', $email)->exists()) {
                    throw new \RuntimeException('Ya existe una cuenta de administrador con ese correo.');
                }

                return AdminUser::query()->create([
                    'name' => $name,
                    'email' => $email,
                    'password' => $pass,
                ]);
            });
        } catch (\RuntimeException $exception) {
            $this->components->error($exception->getMessage());

            return self::FAILURE;
        } catch (Throwable) {
            $this->components->error('No se pudo crear la cuenta. Revisa los logs del servicio.');

            return self::FAILURE;
        }

        $this->components->info("Administrador {$user->email} creado con id={$user->id}.");
        $this->line('Ve a /adminsc1car para iniciar sesión y configurar MFA antes de acceder al panel de administración.');

        return self::SUCCESS;
    }
}
