<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class MfaAttemptLimiter
{
    /**
     * Returns true when either shared counter is already at its limit.
     * Production and Docker use Redis; isolated PHPUnit runs may use the array
     * store. An unavailable configured limiter must fail closed.
     */
    public function isBlocked(int $userId, string $ip): bool
    {
        try {
            $store = Cache::store(config('security.mfa.cache_store'));

            return $this->attempts($store, $this->accountKey($userId)) >= config('security.mfa.account_attempts')
                || $this->attempts($store, $this->ipKey($ip)) >= config('security.mfa.ip_attempts');
        } catch (Throwable $exception) {
            throw $this->unavailable('check', $exception);
        }
    }

    /** Record one failed TOTP, atomically across application instances. */
    public function recordFailure(int $userId, string $ip): array
    {
        try {
            $store = Cache::store(config('security.mfa.cache_store'));
            $account = $this->increment($store, $this->accountKey($userId), config('security.mfa.account_window_seconds'));
            $address = $this->increment($store, $this->ipKey($ip), config('security.mfa.ip_window_seconds'));
            $accountBlocked = $account >= config('security.mfa.account_attempts');
            $ipBlocked = $address >= config('security.mfa.ip_attempts');

            if ($accountBlocked || $ipBlocked) {
                Log::warning('admin.mfa.rate_limited', [
                    'scope' => $accountBlocked ? 'account' : 'ip',
                    'expires_at' => now()->addSeconds($accountBlocked
                        ? config('security.mfa.account_window_seconds')
                        : config('security.mfa.ip_window_seconds'))->toIso8601String(),
                ]);
            }

            return ['account_blocked' => $accountBlocked, 'ip_blocked' => $ipBlocked];
        } catch (Throwable $exception) {
            throw $this->unavailable('increment', $exception);
        }
    }

    public function clearAccount(int $userId): void
    {
        try {
            Cache::store(config('security.mfa.cache_store'))->forget($this->accountKey($userId));
        } catch (Throwable $exception) {
            throw $this->unavailable('reset', $exception);
        }
    }

    private function attempts($store, string $key): int
    {
        return (int) ($store->get($key) ?? 0);
    }

    private function increment($store, string $key, int $ttl): int
    {
        return $store->lock($key.':lock', 5)->block(2, function () use ($store, $key, $ttl): int {
            if (! $store->has($key)) {
                $store->put($key, 0, $ttl);
            }

            return $store->increment($key);
        });
    }

    private function accountKey(int $userId): string
    {
        return 'mfa:failed:account:'.hash_hmac('sha256', (string) $userId, (string) config('app.key'));
    }

    private function ipKey(string $ip): string
    {
        return 'mfa:failed:ip:'.hash_hmac('sha256', Str::limit($ip, 64, ''), (string) config('app.key'));
    }

    private function unavailable(string $operation, Throwable $exception): RuntimeException
    {
        try {
            Log::error('admin.mfa.limiter_unavailable', ['operation' => $operation]);
        } catch (Throwable) {
            // Preserve the fail-closed response even if logging is unavailable too.
        }

        return new RuntimeException('The shared MFA limiter is unavailable.', previous: $exception);
    }
}
