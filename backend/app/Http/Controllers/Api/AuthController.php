<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\RegisterProducerRequest;
use App\Models\AuditLog;
use App\Models\ProducerProfile;
use App\Models\Role;
use App\Models\User;
use App\Rules\ValidActiveLocationHierarchy;
use App\Rules\ValidContactPhone;
use App\Services\AdminMfaRecoveryWorkflow;
use App\Services\MfaAttemptLimiter;
use App\Services\Totp;
use App\Support\PanamaPhoneNumber;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(RegisterProducerRequest $request): JsonResponse
    {
        return $this->createProducer($request->validated(), $request->user(), $request);
    }

    public function registerAssisted(RegisterProducerRequest $request): JsonResponse
    {
        $request->merge(['registration_method' => 'assisted']);
        $data = Validator::make($request->all(), $request->rules())->validate();

        return $this->createProducer($data, $request->user(), $request, true);
    }

    private function createProducer(array $data, ?User $operator, Request $request, bool $assistedRoute = false): JsonResponse
    {
        if ($assistedRoute) {
            $data['registration_method'] = 'assisted';
        }
        if (($data['registration_method'] ?? 'self') === 'assisted' && (! $operator || ! $operator->hasPermission('producers.assist') || ! $operator->two_factor_confirmed_at)) {
            abort(403, 'Solo el personal autorizado puede realizar un registro asistido.');
        }
        $user = DB::transaction(function () use ($data, $operator): User {
            $user = User::create(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password']]);
            $user->roles()->attach(Role::where('name', 'producer')->value('id'));
            $assisted = ($data['registration_method'] ?? 'self') === 'assisted';
            $profile = ProducerProfile::create(['user_id' => $user->id, 'registered_by' => $assisted ? $operator?->id : null, 'registration_method' => $assisted ? 'assisted' : 'self', 'slug' => Str::slug($data['public_name']).'-'.Str::lower(Str::random(6)), 'public_name' => $data['public_name'], 'activity' => $data['activity'] ?? null, 'location_id' => $data['location_id'], 'phone_private' => $data['phone'], 'contact_level' => 'unverified', 'profile_status' => 'pending']);
            $profile->consents()->createMany([
                ['consent_type' => 'terms', 'version' => config('marketplace.consent_versions.terms'), 'accepted_at' => now()],
                ['consent_type' => 'privacy', 'version' => config('marketplace.consent_versions.privacy'), 'accepted_at' => now()],
            ]);
            if ($assisted) {
                $profile->consents()->create(['consent_type' => 'assisted_registration_authorization', 'version' => config('marketplace.consent_versions.assisted_registration'), 'accepted_at' => now(), 'recorded_by' => $operator?->id]);
                AuditLog::create(['actor_id' => $operator?->id, 'action' => 'producer.assisted_registration_created', 'resource_type' => 'producer_profile', 'resource_id' => $profile->id, 'after_values' => ['producer_user_id' => $user->id, 'registration_method' => 'assisted', 'authorization_recorded' => true], 'reason' => 'Productor autorizó el registro asistido.', 'created_at' => now()]);
            }

            return $user;
        });
        if (! $operator) {
            Auth::guard('web')->login($user);
            $request->session()->regenerate();
        }

        return response()->json(['data' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'roles' => ['producer']]], 201);
    }

    public function login(Request $request, MfaAttemptLimiter $limiter): JsonResponse
    {
        $credentials = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        if (! auth()->attempt($credentials)) {
            throw ValidationException::withMessages(['email' => ['Las credenciales no son válidas.']]);
        }
        $user = $request->user();
        $request->session()->forget(['mfa_pending_user_id', 'mfa_pending_expires_at', 'mfa_pending_attempts']);
        if ($user->isInternalStaff() && $user->two_factor_confirmed_at) {
            try {
                $blocked = $limiter->isBlocked($user->id, (string) $request->ip());
            } catch (\RuntimeException) {
                Auth::guard('web')->logout();
                $request->session()->regenerate();

                return response()->json(['message' => 'El servicio de seguridad no está disponible. Intenta más tarde.'], 503);
            }
            Auth::guard('web')->logout();
            $request->session()->regenerate();
            if ($blocked) {
                return response()->json(['message' => 'No se pudo iniciar la verificación administrativa. Intenta más tarde.'], 429);
            }
            $request->session()->put(['mfa_pending_user_id' => $user->id, 'mfa_pending_expires_at' => now()->addMinutes(5)->timestamp, 'mfa_pending_attempts' => 0]);

            return response()->json(['mfa_required' => true], 202);
        }
        $request->session()->regenerate();

        return $user->isInternalStaff() ? response()->json(['mfa_setup_required' => true]) : response()->json([], 204);
    }

    public function requestPasswordReset(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email', 'max:255']]);

        try {
            Password::sendResetLink($data);
        } catch (\Throwable $exception) {
            Log::error('auth.password_reset.delivery_failed', ['exception_class' => $exception::class]);
        }

        return response()->json(['message' => 'Si el correo corresponde a una cuenta, enviaremos instrucciones para restablecer la contraseña.'], 202)
            ->header('Cache-Control', 'no-store, private');
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'token' => ['required', 'string'],
            'password' => ['required', 'string', 'min:12', 'confirmed'],
        ]);

        $status = Password::reset($data, function (User $user, string $password): void {
            $user->forceFill(['password' => $password, 'remember_token' => Str::random(60)])->save();
            event(new PasswordReset($user));
        });

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => ['El enlace venció o no es válido. Solicita uno nuevo.']]);
        }

        return response()->json(['message' => 'La contraseña se actualizó. Inicia sesión con tu nueva contraseña.'])
            ->header('Cache-Control', 'no-store, private');
    }

    public function mfaSetup(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->isInternalStaff(), 403);
        if ($user->two_factor_confirmed_at) {
            return response()->json(['data' => ['enabled' => true]]);
        }
        if (! $user->two_factor_secret) {
            $user->two_factor_secret = app(Totp::class)->secret();
            $user->save();
        }
        $issuer = rawurlencode((string) config('app.name'));
        $account = rawurlencode($issuer.':'.$user->email);
        $uri = "otpauth://totp/{$account}?secret={$user->two_factor_secret}&issuer={$issuer}&algorithm=SHA1&digits=6&period=30";

        return response()->json(['data' => ['enabled' => false, 'secret' => $user->two_factor_secret, 'otpauth_uri' => $uri]])->header('Cache-Control', 'no-store, private');
    }

    public function mfaConfirm(Request $request, Totp $totp): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'regex:/^\d{6}$/']]);
        $user = DB::transaction(function () use ($request, $totp, $data): User {
            $user = User::query()->lockForUpdate()->findOrFail($request->user()->id);
            abort_unless($user->isInternalStaff(), 403);
            abort_if($user->two_factor_confirmed_at || ! $user->two_factor_secret, 409, 'Solicita primero la configuración de MFA.');
            if (! $totp->verify($user->two_factor_secret, $data['code'])) {
                throw ValidationException::withMessages(['code' => ['El código no es válido o ha caducado.']]);
            }
            $user->two_factor_confirmed_at = now();
            $user->save();
            AuditLog::create(['actor_id' => $user->id, 'action' => 'admin.mfa_enabled', 'resource_type' => 'user', 'resource_id' => $user->id, 'created_at' => now()]);
            app(AdminMfaRecoveryWorkflow::class)->completeEnrollment($user);

            return $user;
        });

        return response()->json(['data' => ['enabled' => true]]);
    }

    public function mfaChallenge(Request $request, Totp $totp, MfaAttemptLimiter $limiter): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'regex:/^\d{6}$/']]);
        $userId = $request->session()->get('mfa_pending_user_id');
        abort_unless($userId && $request->session()->get('mfa_pending_expires_at', 0) >= now()->timestamp, 401, 'El desafío MFA expiró. Inicia sesión nuevamente.');
        $user = User::findOrFail($userId);
        abort_unless($user->isInternalStaff() && $user->two_factor_confirmed_at, 401);
        abort_unless($user->two_factor_secret, 409, 'MFA fue restablecido. Inicia sesión para registrar un nuevo autenticador.');
        try {
            if ($limiter->isBlocked($user->id, (string) $request->ip())) {
                $request->session()->forget(['mfa_pending_user_id', 'mfa_pending_expires_at', 'mfa_pending_attempts']);

                return response()->json(['message' => 'El desafío MFA no está disponible. Inicia sesión nuevamente.'], 429);
            }
        } catch (\RuntimeException) {
            return response()->json(['message' => 'El servicio de seguridad no está disponible. Intenta más tarde.'], 503);
        }
        if (! $totp->verify($user->two_factor_secret, $data['code'])) {
            $attempts = $request->session()->increment('mfa_pending_attempts');
            try {
                $limits = $limiter->recordFailure($user->id, (string) $request->ip());
            } catch (\RuntimeException) {
                return response()->json(['message' => 'El servicio de seguridad no está disponible. Intenta más tarde.'], 503);
            }
            if ($attempts >= 5 || $limits['account_blocked'] || $limits['ip_blocked']) {
                $request->session()->forget(['mfa_pending_user_id', 'mfa_pending_expires_at', 'mfa_pending_attempts']);

                return response()->json(['message' => 'El desafío MFA no está disponible. Inicia sesión nuevamente.'], 429);
            }
            throw ValidationException::withMessages(['code' => ['El código no es válido o ha caducado.']]);
        }
        try {
            $limiter->clearAccount($user->id);
        } catch (\RuntimeException) {
            return response()->json(['message' => 'El servicio de seguridad no está disponible. Intenta más tarde.'], 503);
        }
        app(AdminMfaRecoveryWorkflow::class)->cancelOrUnlockWithTotp($user);
        Auth::guard('web')->login($user);
        $request->session()->regenerate();
        $request->session()->forget(['mfa_pending_user_id', 'mfa_pending_expires_at', 'mfa_pending_attempts']);

        return response()->json(['data' => ['authenticated' => true]]);
    }

    public function requestMfaRecovery(Request $request, AdminMfaRecoveryWorkflow $workflow): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:10', 'max:1000']]);
        $userId = $request->session()->get('mfa_pending_user_id');
        $expiresAt = (int) $request->session()->get('mfa_pending_expires_at', 0);
        abort_unless($userId && $expiresAt >= now()->timestamp, 401, 'El desafío MFA no está disponible. Inicia sesión nuevamente.');
        $user = User::query()->find($userId);
        abort_unless($user && $user->isInternalStaff() && $user->two_factor_confirmed_at, 401, 'El desafío MFA no está disponible. Inicia sesión nuevamente.');

        $workflow->request($user, $data['reason']);

        return response()->json(['message' => 'Si la solicitud puede procesarse, recibirás instrucciones para continuar.'], 202)
            ->header('Cache-Control', 'no-store, private');
    }

    public function logout(Request $request): JsonResponse
    {
        auth()->guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([], 204);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('roles.permissions');
        $permissions = $user->roles->flatMap(fn (Role $role) => $role->permissions->pluck('name'))->unique()->values();

        $profile = $user->producerProfile;

        $publicPhone = $profile ? PanamaPhoneNumber::normalize($profile->phone_public) : null;
        $contactLevel = $profile && $profile->contact_level !== 'unverified' && $publicPhone !== null ? $profile->contact_level : 'unverified';

        return response()->json(['data' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'roles' => $user->roles->pluck('name'), 'permissions' => $permissions, 'profile' => $profile ? ['public_name' => $profile->public_name, 'slug' => $profile->slug, 'activity' => $profile->activity, 'description' => $profile->description, 'location_id' => $profile->location_id, 'phone_private' => $profile->phone_private, 'contact_level' => $contactLevel, 'profile_status' => $profile->profile_status, 'suspension_reason' => $profile->suspension_reason] : null]]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $profile = $request->user()->producerProfile()->firstOrFail();
        $data = $request->validate([
            'public_name' => ['required', 'string', 'min:2', 'max:120'],
            'activity' => ['nullable', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'location_id' => ['sometimes', 'nullable', 'integer', new ValidActiveLocationHierarchy],
            'phone_private' => ['required', 'string', 'max:40', new ValidContactPhone],
        ]);
        $data['phone_private'] = PanamaPhoneNumber::normalize($data['phone_private']);
        $profile = DB::transaction(function () use ($profile, $data, $request): ProducerProfile {
            $profile = ProducerProfile::query()->whereKey($profile->id)->lockForUpdate()->firstOrFail();
            $before = ['public_name' => $profile->public_name, 'activity' => $profile->activity, 'description' => $profile->description, 'location_id' => $profile->location_id];
            $profile->public_name = $data['public_name'];
            $profile->activity = $data['activity'] ?? null;
            $profile->description = $data['description'] ?? null;
            if (array_key_exists('location_id', $data)) {
                $profile->location_id = $data['location_id'];
            }
            $currentPhone = PanamaPhoneNumber::normalize($profile->phone_private);
            $phoneChanged = $currentPhone === null || ! hash_equals($currentPhone, $data['phone_private']);
            $previousContactLevel = $profile->contact_level;
            if ($phoneChanged) {
                $profile->changePhone($data['phone_private']);
                $profile->verifications()->where('status', 'pending')->update(['status' => 'expired', 'code_hash' => null]);
            } elseif ($profile->phone_private !== $data['phone_private']) {
                $profile->phone_private = $data['phone_private'];
                if ($profile->phone_verified_at !== null) {
                    $profile->phone_public = $data['phone_private'];
                }
            }
            $profile->save();
            $after = ['public_name' => $profile->public_name, 'activity' => $profile->activity, 'description' => $profile->description, 'location_id' => $profile->location_id, 'contact_level' => $profile->contact_level];
            $changedFields = array_keys(array_filter($after, fn ($value, $key) => ($before[$key] ?? null) !== $value, ARRAY_FILTER_USE_BOTH));
            AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'producer.profile_updated', 'resource_type' => 'producer_profile', 'resource_id' => $profile->id, 'before_values' => $before, 'after_values' => $after, 'reason' => 'Campos actualizados: '.implode(', ', $changedFields), 'created_at' => now()]);

            if ($phoneChanged) {
                AuditLog::create([
                    'actor_id' => $request->user()->id,
                    'action' => 'producer.phone_changed',
                    'resource_type' => 'producer_profile',
                    'resource_id' => $profile->id,
                    'before_values' => ['contact_level' => $previousContactLevel],
                    'after_values' => ['contact_level' => 'unverified', 'reverification_required' => true],
                    'reason' => 'Cambio de teléfono; se invalidaron los códigos pendientes y se requiere reverificación.',
                    'created_at' => now(),
                ]);
            }

            return $profile;
        });

        return response()->json(['data' => ['public_name' => $profile->public_name, 'slug' => $profile->slug, 'activity' => $profile->activity, 'description' => $profile->description, 'location_id' => $profile->location_id, 'contact_level' => $profile->contact_level, 'profile_status' => $profile->profile_status]]);
    }
}
