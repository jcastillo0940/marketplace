<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminUser;
use App\Services\MfaAttemptLimiter;
use App\Services\Totp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AdminAuthController extends Controller
{
    public function login(Request $request, MfaAttemptLimiter $limiter): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::guard('admin')->attempt($credentials)) {
            throw ValidationException::withMessages(['email' => ['Las credenciales no son válidas.']]);
        }

        $user = Auth::guard('admin')->user();
        $request->session()->forget(['admin_mfa_pending_user_id', 'admin_mfa_pending_expires_at', 'admin_mfa_pending_attempts']);

        if ($user->two_factor_confirmed_at) {
            try {
                $blocked = $limiter->isBlocked($user->id, (string) $request->ip());
            } catch (\RuntimeException) {
                Auth::guard('admin')->logout();
                $request->session()->regenerate();

                return response()->json(['message' => 'El servicio de seguridad no está disponible. Intenta más tarde.'], 503);
            }
            Auth::guard('admin')->logout();
            $request->session()->regenerate();
            if ($blocked) {
                return response()->json(['message' => 'No se pudo iniciar la verificación administrativa. Intenta más tarde.'], 429);
            }
            $request->session()->put([
                'admin_mfa_pending_user_id' => $user->id,
                'admin_mfa_pending_expires_at' => now()->addMinutes(5)->timestamp,
                'admin_mfa_pending_attempts' => 0,
            ]);

            return response()->json(['mfa_required' => true], 202);
        }

        $request->session()->regenerate();

        return response()->json(['mfa_setup_required' => true]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('admin')->logout();
        $request->session()->forget(['admin_mfa_pending_user_id', 'admin_mfa_pending_expires_at', 'admin_mfa_pending_attempts']);
        $request->session()->regenerate();

        return response()->json([], 204);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user('admin');

        return response()->json([
            'data' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'roles' => ['super_admin'],
                'permissions' => [
                    'products.review', 'reports.manage', 'producers.assist', 'producers.suspend',
                    'producers.verify', 'producers.appeals.manage', 'catalogs.manage', 'messages.manage',
                    'analytics.view', 'audit.view', 'users.manage', 'security.alerts.view',
                    'security.alerts.manage', 'security.mfa_recovery.review',
                ],
            ],
        ]);
    }

    public function mfaSetup(Request $request): JsonResponse
    {
        $user = $request->user('admin');
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

        return response()->json(['data' => ['enabled' => false, 'secret' => $user->two_factor_secret, 'otpauth_uri' => $uri]])
            ->header('Cache-Control', 'no-store, private');
    }

    public function mfaConfirm(Request $request, Totp $totp): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'regex:/^\d{6}$/']]);
        $user = AdminUser::query()->lockForUpdate()->findOrFail($request->user('admin')->id);
        abort_if($user->two_factor_confirmed_at || ! $user->two_factor_secret, 409, 'Solicita primero la configuración de MFA.');
        if (! $totp->verify($user->two_factor_secret, $data['code'])) {
            throw ValidationException::withMessages(['code' => ['El código no es válido o ha caducado.']]);
        }
        $user->two_factor_confirmed_at = now();
        $user->save();

        return response()->json(['data' => ['enabled' => true]]);
    }

    public function mfaChallenge(Request $request, Totp $totp, MfaAttemptLimiter $limiter): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'regex:/^\d{6}$/']]);
        $userId = $request->session()->get('admin_mfa_pending_user_id');
        abort_unless($userId && $request->session()->get('admin_mfa_pending_expires_at', 0) >= now()->timestamp, 401, 'El desafío MFA expiró. Inicia sesión nuevamente.');
        $user = AdminUser::findOrFail($userId);
        abort_unless($user->two_factor_confirmed_at, 401);
        abort_unless($user->two_factor_secret, 409, 'MFA fue restablecido. Inicia sesión para registrar un nuevo autenticador.');

        try {
            if ($limiter->isBlocked($user->id, (string) $request->ip())) {
                $request->session()->forget(['admin_mfa_pending_user_id', 'admin_mfa_pending_expires_at', 'admin_mfa_pending_attempts']);

                return response()->json(['message' => 'El desafío MFA no está disponible. Inicia sesión nuevamente.'], 429);
            }
        } catch (\RuntimeException) {
            return response()->json(['message' => 'El servicio de seguridad no está disponible. Intenta más tarde.'], 503);
        }

        if (! $totp->verify($user->two_factor_secret, $data['code'])) {
            $attempts = $request->session()->increment('admin_mfa_pending_attempts');
            try {
                $limits = $limiter->recordFailure($user->id, (string) $request->ip());
            } catch (\RuntimeException) {
                return response()->json(['message' => 'El servicio de seguridad no está disponible. Intenta más tarde.'], 503);
            }
            if ($attempts >= 5 || $limits['account_blocked'] || $limits['ip_blocked']) {
                $request->session()->forget(['admin_mfa_pending_user_id', 'admin_mfa_pending_expires_at', 'admin_mfa_pending_attempts']);

                return response()->json(['message' => 'El desafío MFA no está disponible. Inicia sesión nuevamente.'], 429);
            }
            throw ValidationException::withMessages(['code' => ['El código no es válido o ha caducado.']]);
        }

        try {
            $limiter->clearAccount($user->id);
        } catch (\RuntimeException) {
            return response()->json(['message' => 'El servicio de seguridad no está disponible. Intenta más tarde.'], 503);
        }

        Auth::guard('admin')->login($user);
        $request->session()->regenerate();
        $request->session()->forget(['admin_mfa_pending_user_id', 'admin_mfa_pending_expires_at', 'admin_mfa_pending_attempts']);

        return response()->json(['data' => ['authenticated' => true]]);
    }
}
