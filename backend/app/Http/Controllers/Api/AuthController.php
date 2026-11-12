<?php

namespace App\Http\Controllers\Api;

use App\Enums\ProducerVerificationLevel;
use App\Http\Controllers\Controller;
use Illuminate\Validation\Rule;
use App\Http\Requests\RegisterProducerRequest;
use App\Mail\ProducerWelcomeMail;
use App\Models\AuditLog;
use App\Models\ProducerProfile;
use App\Models\Role;
use App\Models\User;
use App\Rules\ValidActiveLocationHierarchy;
use App\Rules\ValidContactPhone;
use App\Services\AdminMfaRecoveryWorkflow;
use App\Services\MarketMailer;
use App\Services\MfaAttemptLimiter;
use App\Services\SensitiveFileStore;
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

    /**
     * Lets the registration form warn about an existing account while the person is still on
     * step 1, instead of after they fill in every step. Throttled per IP against enumeration.
     */
    public function checkRegistration(Request $request): JsonResponse
    {
        $data = $request->validate([
            'cedula' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'string', 'max:255'],
            'ruc' => ['nullable', 'string', 'max:30'],
            'phone' => ['nullable', 'string', 'max:40'],
        ]);

        $cedula = strtoupper(trim((string) ($data['cedula'] ?? '')));
        $email = strtolower(trim((string) ($data['email'] ?? '')));
        $ruc = strtoupper(trim((string) ($data['ruc'] ?? '')));
        $phone = PanamaPhoneNumber::normalize($data['phone'] ?? null);

        return response()->json(['data' => [
            'cedula_taken' => $cedula !== '' && ProducerProfile::whereRaw('UPPER(cedula) = ?', [$cedula])->exists(),
            'email_taken' => $email !== '' && User::whereRaw('LOWER(email) = ?', [$email])->exists(),
            'ruc_taken' => $ruc !== '' && ProducerProfile::whereRaw('UPPER(ruc) = ?', [$ruc])->exists(),
            // Without an email the account is keyed on the phone, so a reused phone would collide.
            'phone_taken' => $email === '' && $phone !== null && User::where('email', 'ph-'.$phone.'@mercapro.internal')->exists(),
        ]]);
    }

    public function registerAssisted(RegisterProducerRequest $request): JsonResponse
    {
        $request->merge(['registration_method' => 'assisted']);
        $data = Validator::make($request->all(), $request->rules())->validate();

        return $this->createProducer($data, $request->user(), $request, true);
    }

    private function createProducer(array $data, \Illuminate\Contracts\Auth\Authenticatable|null $operator, Request $request, bool $assistedRoute = false): JsonResponse
    {
        if ($assistedRoute) {
            $data['registration_method'] = 'assisted';
        }
        if (($data['registration_method'] ?? 'self') === 'assisted' && (! $operator || ! $operator->hasPermission('producers.assist') || ! $operator->two_factor_confirmed_at)) {
            abort(403, 'Solo el personal autorizado puede realizar un registro asistido.');
        }
        // Auto-generate email if not provided (phone-only registration)
        if (empty($data['email'])) {
            $normalizedPhone = PanamaPhoneNumber::normalize($data['phone']) ?? preg_replace('/\D/', '', $data['phone']);
            $data['email'] = 'ph-'.$normalizedPhone.'@mercapro.internal';
        }
        $user = DB::transaction(function () use ($data, $operator): User {
            $user = User::create(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password']]);
            $user->roles()->attach(Role::where('name', 'producer')->value('id'));
            $assisted = ($data['registration_method'] ?? 'self') === 'assisted';
            $profile = ProducerProfile::create([
                'user_id' => $user->id,
                'registered_by' => $assisted ? $operator?->id : null,
                'registration_method' => $assisted ? 'assisted' : 'self',
                'slug' => Str::slug($data['public_name']).'-'.Str::lower(Str::random(6)),
                'public_name' => $data['public_name'],
                'activity' => ProducerProfile::activityLabel($data['activities'] ?? []),
                'activities' => array_values(array_unique($data['activities'] ?? [])) ?: null,
                'vendor_type' => $data['vendor_type'] ?? 'productor',
                'payment_methods' => $data['payment_methods'] ?? null,
                'location_id' => $data['location_id'],
                'phone_private' => $data['phone'],
                'cedula' => strtoupper($data['cedula']),
                'ruc' => $data['ruc'] ?? null,
                'ruc_dv' => $data['ruc_dv'] ?? null,
                'contact_level' => 'unverified',
                'profile_status' => 'pending',
            ]);
            foreach (['pacto_social', 'cedula_photo', 'aviso_operacion'] as $type) {
                if (! isset($data[$type])) {
                    continue;
                }
                $file = $data[$type];
                $path = "documents/{$profile->id}/{$type}.{$file->extension()}.enc";
                abort_unless(app(SensitiveFileStore::class)->put($path, $file->get()), 503, 'No pudimos guardar el documento. Inténtalo de nuevo.');
                $profile->update([$type.'_path' => $path]);
            }
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

        $profile = $user->producerProfile;
        if ($profile) {
            MarketMailer::send(new ProducerWelcomeMail($user, $profile));
        }

        return response()->json(['data' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'roles' => ['producer']]], 201);
    }

    public function login(Request $request, MfaAttemptLimiter $limiter): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'string', 'max:255'], 'password' => ['required', 'string']]);
        $identifier = $this->resolveLoginEmail(trim($data['email']));
        $credentials = ['email' => $identifier, 'password' => $data['password']];
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

    /** Producers may sign in with their cédula, phone or email; email is optional at registration. */
    private function resolveLoginEmail(string $identifier): string
    {
        if (str_contains($identifier, '@')) {
            return $identifier;
        }

        if (preg_match('/^([0-9]{1,2}[A-Z]?|[A-Z]{1,3})-[0-9]{1,4}-[0-9]{1,6}$/i', $identifier) === 1) {
            $profile = ProducerProfile::query()->where('cedula', strtoupper($identifier))->first();

            return User::query()->find($profile?->user_id)?->email ?? $identifier;
        }

        $normalizedPhone = PanamaPhoneNumber::normalize($identifier) ?? preg_replace('/\D/', '', $identifier);
        $profile = ProducerProfile::query()->where('phone_private', $normalizedPhone)->first();

        return User::query()->find($profile?->user_id)?->email ?? 'ph-'.$normalizedPhone.'@mercapro.internal';
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

        return response()->json(['data' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'roles' => $user->roles->pluck('name'), 'permissions' => $permissions, 'profile' => $profile ? ['public_name' => $profile->public_name, 'slug' => $profile->slug, 'activity' => $profile->activity, 'activities' => $profile->activities ?? [], 'vendor_type' => $profile->vendor_type ?? 'productor', 'payment_methods' => $profile->payment_methods ?? [], 'description' => $profile->description, 'location_id' => $profile->location_id, 'phone_private' => $profile->phone_private, 'cedula' => $profile->cedula, 'ruc' => $profile->ruc, 'ruc_dv' => $profile->ruc_dv, 'has_cedula_photo' => ! empty($profile->cedula_photo_path), 'has_pacto_social' => ! empty($profile->pacto_social_path), 'has_aviso_operacion' => ! empty($profile->aviso_operacion_path), 'missing_documents' => array_keys($profile->missingPublishingDocuments()), 'contact_level' => $contactLevel, 'verification_level' => $profile->publicVerificationLevel(), 'profile_status' => $profile->profile_status, 'suspension_reason' => $profile->suspension_reason] : null]]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $profile = $request->user()->producerProfile()->firstOrFail();
        foreach (['ruc', 'ruc_dv'] as $field) {
            if ($request->has($field)) {
                $value = trim((string) $request->input($field));
                $request->merge([$field => $value === '' ? null : strtoupper($value)]);
            }
        }
        $data = $request->validate([
            'public_name' => ['required', 'string', 'min:2', 'max:120'],
            'ruc' => ['sometimes', 'nullable', 'string', 'max:30', 'regex:/^[0-9A-Z]+(-[0-9A-Z]+){1,4}$/', Rule::unique('producer_profiles', 'ruc')->ignore($profile->id)],
            'ruc_dv' => ['sometimes', 'nullable', 'required_with:ruc', 'string', 'regex:/^[0-9]{1,2}$/'],
            'activities' => ['nullable', 'array', 'max:20'],
            'activities.*' => ['string', 'max:120', Rule::exists('categories', 'name')->where('active', true)->whereNull('parent_id')],
            'vendor_type' => ['nullable', 'string', 'in:productor,cooperativa,distribuidor'],
            'payment_methods' => ['nullable', 'array'],
            'payment_methods.*' => ['string', 'in:efectivo,yappy,transferencia,tarjeta,cheque,credito'],
            'description' => ['nullable', 'string', 'max:2000'],
            'location_id' => ['sometimes', 'nullable', 'integer', new ValidActiveLocationHierarchy],
            'phone_private' => ['required', 'string', 'max:40', new ValidContactPhone],
        ]);
        $data['phone_private'] = PanamaPhoneNumber::normalize($data['phone_private']);
        $profile = DB::transaction(function () use ($profile, $data, $request): ProducerProfile {
            $profile = ProducerProfile::query()->whereKey($profile->id)->lockForUpdate()->firstOrFail();
            $before = ['public_name' => $profile->public_name, 'activity' => $profile->activity, 'vendor_type' => $profile->vendor_type, 'payment_methods' => $profile->payment_methods, 'description' => $profile->description, 'location_id' => $profile->location_id, 'ruc' => $profile->ruc, 'ruc_dv' => $profile->ruc_dv];
            if (array_key_exists('ruc', $data) && (($data['ruc'] ?? null) !== $profile->ruc || ($data['ruc_dv'] ?? null) !== $profile->ruc_dv)) {
                if ((string) $profile->verification_level !== ProducerVerificationLevel::ContactConfirmed->value) {
                    throw ValidationException::withMessages(['ruc' => ['Tu RUC ya fue revisado. Para cambiarlo, contacta al equipo de Mercapro.']]);
                }
                $profile->ruc = $data['ruc'] ?? null;
                $profile->ruc_dv = $data['ruc_dv'] ?? null;
            }
            $profile->public_name = $data['public_name'];
            if (array_key_exists('activities', $data)) {
                $profile->activity = ProducerProfile::activityLabel($data['activities'] ?? []);
                $profile->activities = array_values(array_unique($data['activities'] ?? [])) ?: null;
            }
            if (array_key_exists('vendor_type', $data)) {
                $profile->vendor_type = $data['vendor_type'] ?? 'productor';
            }
            if (array_key_exists('payment_methods', $data)) {
                $profile->payment_methods = $data['payment_methods'] ?? null;
            }
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
            $after = ['public_name' => $profile->public_name, 'activity' => $profile->activity, 'description' => $profile->description, 'location_id' => $profile->location_id, 'ruc' => $profile->ruc, 'ruc_dv' => $profile->ruc_dv, 'contact_level' => $profile->contact_level];
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

        return response()->json(['data' => ['public_name' => $profile->public_name, 'slug' => $profile->slug, 'activity' => $profile->activity, 'vendor_type' => $profile->vendor_type ?? 'productor', 'payment_methods' => $profile->payment_methods ?? [], 'description' => $profile->description, 'location_id' => $profile->location_id, 'contact_level' => $profile->contact_level, 'profile_status' => $profile->profile_status]]);
    }
}
