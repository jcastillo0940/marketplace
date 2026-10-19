<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        ResetPassword::createUrlUsing(fn ($user, string $token): string => rtrim((string) config('app.frontend_url'), '/')
            .'/restablecer?'.http_build_query(['token' => $token, 'email' => $user->getEmailForPasswordReset()]));
        RateLimiter::for('auth', fn ($request) => Limit::perMinute(8)->by($request->ip().':'.strtolower((string) $request->input('email'))));
        RateLimiter::for('public-actions', fn ($request) => Limit::perMinute(12)->by($request->ip()));
        RateLimiter::for('product-writes', fn ($request) => Limit::perMinute(6)->by('user:'.$request->user()->getAuthIdentifier()));
        Gate::define('products.review', fn ($user) => $user->hasPermission('products.review'));
        Gate::define('reports.review', fn ($user) => $user->hasPermission('reports.manage'));
        Gate::define('producers.assist', fn ($user) => $user->hasPermission('producers.assist'));
        Gate::define('producers.suspend', fn ($user) => $user->hasPermission('producers.suspend'));
        Gate::define('producers.verify', fn ($user) => $user->hasPermission('producers.verify'));
        Gate::define('producers.appeals.manage', fn ($user) => $user->hasPermission('producers.appeals.manage'));
        Gate::define('catalogs.manage', fn ($user) => $user->hasPermission('catalogs.manage'));
        Gate::define('messages.manage', fn ($user) => $user->hasPermission('messages.manage'));
        Gate::define('analytics.view', fn ($user) => $user->hasPermission('analytics.view'));
        Gate::define('audit.view', fn ($user) => $user->hasPermission('audit.view'));
        Gate::define('users.manage', fn ($user) => $user->hasPermission('users.manage'));
        Gate::define('security.alerts.view', fn ($user) => $user->hasPermission('security.alerts.view'));
        Gate::define('security.alerts.manage', fn ($user) => $user->hasPermission('security.alerts.manage'));
    }
}
