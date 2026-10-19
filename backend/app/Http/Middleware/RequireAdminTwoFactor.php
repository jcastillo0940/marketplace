<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireAdminTwoFactor
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user && $user->isInternalStaff(), 403);
        abort_if($user->mfa_recovery_locked_at, 423, 'El acceso administrativo está bloqueado mientras se recupera el autenticador.');
        abort_unless($user->two_factor_confirmed_at, 428, 'Configura y confirma MFA antes de acceder a la administración.');

        return $next($request);
    }
}
