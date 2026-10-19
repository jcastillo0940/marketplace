<?php

use App\Http\Middleware\RequireAdminTwoFactor;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $trustedProxyConfig = require __DIR__.'/../config/trustedproxy.php';
        $middleware->trustProxies(
            at: $trustedProxyConfig['proxies'],
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO,
        );
        $middleware->statefulApi();
        $middleware->validateCsrfTokens(except: [
            'api/search-events',
            'api/contact-events',
            'api/reports',
        ]);
        $middleware->alias(['admin.mfa' => RequireAdminTwoFactor::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
