<?php

use App\Http\Controllers\Api\AdminController;
use App\Http\Controllers\Api\AdminMfaRecoveryController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MessageTemplateController;
use App\Http\Controllers\Api\ProducerAppealController;
use App\Http\Controllers\Api\ProducerProductController;
use App\Http\Controllers\Api\PublicCatalogController;
use App\Http\Controllers\Api\TrustSafetyController;
use App\Models\Category;
use App\Models\Location;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

Route::get('/health', fn () => response()->json(['status' => 'ok']));
Route::get('/ready', function () {
    try {
        DB::select('SELECT 1');
        Cache::put('health:readiness', 'ok', 5);
        abort_unless(Cache::get('health:readiness') === 'ok', 503);
        Redis::connection()->ping();
        $referenceDataReady = Category::query()->where('active', true)->exists();
        foreach (['Bocas del Toro' => 35, 'Chiriquí' => 95, 'Coclé' => 40, 'Colón' => 38, 'Darién' => 20, 'Herrera' => 44, 'Los Santos' => 75, 'Panamá' => 50, 'Veraguas' => 95] as $provinceName => $expectedCorregimientos) {
            $province = Location::query()->where('active', true)->where('level', 'province')
                ->where('slug', Str::slug($provinceName))->first();
            if ($province === null) {
                $referenceDataReady = false;

                continue;
            }

            $districts = Location::query()->where('active', true)->where('level', 'district')
                ->where('parent_id', $province->id)->get(['id']);
            $corregimientoCount = Location::query()->where('active', true)->where('level', 'corregimiento')
                ->whereIn('parent_id', $districts->pluck('id'))->count();
            $minDistricts = match ($provinceName) { 'Chiriquí' => 14, 'Veraguas' => 12, 'Bocas del Toro' => 4, 'Darién' => 3, default => 5 };
            $referenceDataReady = $referenceDataReady && $districts->count() >= $minDistricts
                && $corregimientoCount >= $expectedCorregimientos;
        }
    } catch (Throwable) {
        return response()->json(['status' => 'not_ready'], 503);
    }

    return response()->json([
        'status' => 'ready',
        'checks' => ['database' => 'ok', 'cache' => 'ok', 'redis' => 'ok'],
        'setup' => ['reference_data' => $referenceDataReady ? 'ready' : 'needs_seed'],
    ]);
});
Route::get('/products', [PublicCatalogController::class, 'products']);
Route::get('/message-templates', [MessageTemplateController::class, 'public']);
Route::post('/search-events', [PublicCatalogController::class, 'recordNoResultSearch'])->middleware('throttle:public-actions');
Route::get('/products/{slug}', [PublicCatalogController::class, 'product']);
Route::get('/products/{slug}/images/{imageId}', [PublicCatalogController::class, 'image'])->whereNumber('imageId');
Route::get('/activities', fn () => response()->json(['data' => config('activities')]));
Route::get('/categories', [PublicCatalogController::class, 'categories']);
Route::get('/locations', [PublicCatalogController::class, 'locations']);
Route::get('/producers', [PublicCatalogController::class, 'producers']);
Route::get('/producers/{slug}', [PublicCatalogController::class, 'producer']);
Route::post('/contact-events', [TrustSafetyController::class, 'contact'])->middleware('throttle:public-actions');
Route::post('/reports', [TrustSafetyController::class, 'report'])->middleware('throttle:public-actions');

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register'])->middleware(['web', 'throttle:auth']);
    Route::post('/login', [AuthController::class, 'login'])->middleware(['web', 'throttle:auth']);
    Route::post('/password/forgot', [AuthController::class, 'requestPasswordReset'])->middleware(['web', 'throttle:auth']);
    Route::post('/password/reset', [AuthController::class, 'resetPassword'])->middleware(['web', 'throttle:auth']);
    Route::post('/logout', [AuthController::class, 'logout'])->middleware(['web', 'auth:sanctum']);
    Route::post('/mfa/challenge', [AuthController::class, 'mfaChallenge'])->middleware(['web', 'throttle:auth']);
    Route::post('/mfa/recovery-requests', [AuthController::class, 'requestMfaRecovery'])->middleware(['web', 'throttle:auth']);
});

Route::middleware(['web', 'auth:sanctum'])->group(function (): void {
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/auth/mfa/setup', [AuthController::class, 'mfaSetup']);
    Route::post('/auth/mfa/confirm', [AuthController::class, 'mfaConfirm'])->middleware('throttle:auth');
    Route::post('/auth/verify', [ProducerProductController::class, 'verifyPhone'])->middleware('throttle:auth');
    Route::put('/me/profile', [AuthController::class, 'updateProfile']);
    Route::get('/me/products', [ProducerProductController::class, 'index']);
    Route::get('/me/metrics', [ProducerProductController::class, 'metrics']);
    Route::get('/me/appeals', [ProducerAppealController::class, 'index']);
    Route::post('/me/appeals', [ProducerAppealController::class, 'store'])->middleware('throttle:auth');
    Route::post('/me/products', [ProducerProductController::class, 'store'])->middleware('throttle:product-writes');
    Route::patch('/me/products/{id}', [ProducerProductController::class, 'update'])->whereNumber('id')->middleware('throttle:product-writes');
    Route::put('/me/products/{id}', [ProducerProductController::class, 'update'])->whereNumber('id')->middleware('throttle:product-writes');
    Route::post('/me/verify-phone', [ProducerProductController::class, 'verifyPhone'])->middleware('throttle:auth');
    Route::post('/me/verify-phone/start', [ProducerProductController::class, 'startPhoneVerification'])->middleware('throttle:auth');
    Route::get('/me/products/{id}/images/{imageId}', [ProducerProductController::class, 'ownerImage'])->whereNumber('id')->whereNumber('imageId');
    Route::get('/me/products/{id}', [ProducerProductController::class, 'show'])->whereNumber('id');
    Route::post('/me/products/{id}/submit', [ProducerProductController::class, 'submit'])->whereNumber('id')->middleware('throttle:product-writes');
    Route::post('/me/products/{id}/transition', [ProducerProductController::class, 'transition'])->whereNumber('id')->middleware('throttle:product-writes');
    Route::post('/me/products/{id}/renew', [ProducerProductController::class, 'renew'])->whereNumber('id')->middleware('throttle:product-writes');
    Route::middleware('admin.mfa')->prefix('admin')->group(function (): void {
        Route::get('/mfa-recovery-requests', [AdminMfaRecoveryController::class, 'index']);
        Route::post('/mfa-recovery-requests/{id}/decision', [AdminMfaRecoveryController::class, 'decide'])->whereNumber('id');
        Route::get('/message-templates', [MessageTemplateController::class, 'index']);
        Route::put('/message-templates/{key}', [MessageTemplateController::class, 'update'])->whereIn('key', ['product', 'producer']);
        Route::get('/moderation', [ProducerProductController::class, 'moderationQueue']);
        Route::post('/products/bulk-decision', [ProducerProductController::class, 'moderateMany']);
        Route::get('/products/{id}/images/{imageId}', [ProducerProductController::class, 'moderationImage'])->whereNumber('id')->whereNumber('imageId');
        Route::post('/products/{id}/approve', [ProducerProductController::class, 'approveProduct'])->whereNumber('id');
        Route::post('/products/{id}/decision', [ProducerProductController::class, 'moderate'])->whereNumber('id');
        Route::get('/reports', [TrustSafetyController::class, 'cases']);
        Route::get('/reports/{id}', [TrustSafetyController::class, 'caseDetail'])->whereNumber('id');
        Route::post('/reports/{id}/release', [TrustSafetyController::class, 'releaseCase'])->whereNumber('id');
        Route::get('/security/alerts', [TrustSafetyController::class, 'alerts']);
        Route::put('/security/alerts/{id}', [TrustSafetyController::class, 'updateAlert'])->whereNumber('id');
        Route::put('/reports/{id}', [TrustSafetyController::class, 'updateCase'])->whereNumber('id');
        Route::patch('/reports/{id}/priority', [TrustSafetyController::class, 'updateCasePriority'])->whereNumber('id');
        Route::get('/reports/{id}/evidence/{evidenceId}', [TrustSafetyController::class, 'evidence'])->whereNumber('id')->whereNumber('evidenceId');
        Route::get('/producers', [AdminController::class, 'producers']);
        Route::post('/producers/assisted', [AuthController::class, 'registerAssisted']);
        Route::get('/producers/{id}', [AdminController::class, 'producerDetail'])->whereNumber('id');
        Route::put('/producers/{id}/trust-level', [AdminController::class, 'setProducerTrustLevel'])->whereNumber('id');
        Route::get('/producer-appeals', [ProducerAppealController::class, 'queue']);
        Route::put('/producer-appeals/{id}', [ProducerAppealController::class, 'decide'])->whereNumber('id');
        Route::put('/producers/{id}/status', [AdminController::class, 'setProducerStatus'])->whereNumber('id');
        Route::get('/categories', [AdminController::class, 'categories']);
        Route::post('/categories', [AdminController::class, 'saveCategory']);
        Route::put('/categories/{id}', [AdminController::class, 'saveCategory'])->whereNumber('id');
        Route::delete('/categories/{id}', [AdminController::class, 'deactivateCategory'])->whereNumber('id');
        Route::get('/locations', [AdminController::class, 'locations']);
        Route::post('/locations', [AdminController::class, 'saveLocation']);
        Route::put('/locations/{id}', [AdminController::class, 'saveLocation'])->whereNumber('id');
        Route::delete('/locations/{id}', [AdminController::class, 'deactivateLocation'])->whereNumber('id');
        Route::get('/metrics', [AdminController::class, 'metrics']);
        Route::get('/metrics/export.csv', [AdminController::class, 'exportMetrics']);
        Route::get('/analytics', [AdminController::class, 'metrics']);
        Route::get('/analytics/export.csv', [AdminController::class, 'exportMetrics']);
        Route::get('/audit', [AdminController::class, 'audit']);
        Route::get('/roles', [AdminController::class, 'roles']);
        Route::get('/users', [AdminController::class, 'users']);
        Route::put('/users/{id}/roles', [AdminController::class, 'setUserRoles'])->whereNumber('id');
    });
});
