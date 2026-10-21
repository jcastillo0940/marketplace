<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminUser;
use App\Models\AuditLog;
use App\Models\ContactEvent;
use App\Models\ProducerProfile;
use App\Models\Product;
use App\Models\ProductImage;
use App\Rules\ValidContactPhone;
use App\Services\ContactVerificationSender;
use App\Services\PhoneVerificationWorkflow;
use App\Services\ProductPhotoOptimizer;
use App\Services\ProductWorkflow;
use App\Support\PanamaPhoneNumber;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProducerProductController extends Controller
{
    public function metrics(Request $request): JsonResponse
    {
        $profile = ProducerProfile::query()->where('user_id', $request->user()->id)->firstOrFail();
        $products = Product::query()->where('producer_profile_id', $profile->id);
        $statusCounts = (clone $products)->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')->pluck('total', 'status');
        $contactEvents = ContactEvent::query()->where('producer_profile_id', $profile->id)
            ->where('occurred_at', '>=', now()->subDays(30));
        $contactIntentions = (clone $contactEvents)->count();
        $contactChannelCounts = (clone $contactEvents)->select('channel', DB::raw('count(*) as total'))
            ->groupBy('channel')->pluck('total', 'channel');
        $contactChannels = [
            'whatsapp' => (int) $contactChannelCounts->get('whatsapp', 0),
            'phone' => (int) $contactChannelCounts->get('phone', 0),
        ];
        $profileContactIntentions = (clone $contactEvents)->whereNull('product_id')->count();
        $topProducts = ContactEvent::query()
            ->join('products', 'products.id', '=', 'contact_events.product_id')
            ->where('contact_events.producer_profile_id', $profile->id)
            ->where('products.producer_profile_id', $profile->id)
            ->where('contact_events.occurred_at', '>=', now()->subDays(30))
            ->select('products.id as product_id', 'products.title as title', DB::raw('count(*) as contact_intentions'))
            ->groupBy('products.id', 'products.title')
            ->orderByDesc('contact_intentions')
            ->limit(5)
            ->get();

        return response()->json(['data' => [
            'products' => $statusCounts,
            'contact_intentions_30d' => $contactIntentions,
            'contact_channels_30d' => $contactChannels,
            'profile_contact_intentions_30d' => $profileContactIntentions,
            'top_products_30d' => $topProducts,
            'period_days' => 30,
        ]]);
    }

    public function index(Request $request): JsonResponse
    {
        $products = Product::query()->whereHas('producer', fn ($query) => $query->where('user_id', $request->user()->id))->with('latestModerationDecision:id,product_id,actor_id,from_status,to_status,reason,created_at')->latest('id')->paginate(min(max((int) $request->query('per_page', 12), 1), 50));
        $products->getCollection()->each(function (Product $product): void {
            $product->setAttribute('listing_expired', $product->listingIsExpired());
            $product->setAttribute('listing_expires_at', $product->listingExpiresAt());
        });

        return response()->json($products);
    }

    public function store(Request $request, ProductPhotoOptimizer $photoOptimizer): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'min:3', 'max:120'],
            'category_id' => ['required', 'integer', Rule::exists('categories', 'id')->where('active', true)],
            'description' => ['required', 'string', 'min:20', 'max:3000'],
            'unit' => ['required', 'string', 'max:40'],
            'price_type' => ['nullable', 'in:fixed,from,contact'],
            'price_amount' => ['nullable', 'numeric', 'min:0', 'required_if:price_type,fixed,from'],
            'currency' => ['nullable', 'in:PAB,USD'],
            'stock_quantity' => ['nullable', 'numeric', 'min:0'],
            'delivery_method' => ['required', 'string', 'max:120'],
            'images' => ['required', 'array', 'min:1', 'max:5'],
            'images.*' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'dimensions:min_width=300,min_height=300,max_width=6000,max_height=6000', 'max:5120'],
        ]);
        $profile = ProducerProfile::where('user_id', $request->user()->id)->firstOrFail();
        $mediaDisk = config('filesystems.media');
        $slug = Str::slug($data['title']).'-'.Str::lower(Str::random(7));
        $priceType = $data['price_type'] ?? 'contact';
        $storedPaths = [];
        try {
            $product = DB::transaction(function () use ($data, $profile, $request, $slug, $mediaDisk, $photoOptimizer, $priceType, &$storedPaths): Product {
                $product = $profile->products()->create([
                    'category_id' => $data['category_id'], 'created_by' => $request->user()->id,
                    'slug' => $slug, 'title' => $data['title'], 'description' => $data['description'], 'unit' => $data['unit'],
                    'price_type' => $priceType, 'price_amount' => $priceType === 'contact' ? null : ($data['price_amount'] ?? null),
                    'currency' => $data['currency'] ?? 'PAB', 'stock_quantity' => $data['stock_quantity'] ?? null,
                    'delivery_method' => $data['delivery_method'], 'status' => 'pending',
                ]);
                foreach ($data['images'] as $position => $image) {
                    $paths = $photoOptimizer->store($image, $mediaDisk, "products/{$product->id}");
                    $storedPaths = array_merge($storedPaths, array_values($paths));
                    $product->images()->create(['disk' => $mediaDisk, ...$paths, 'alt_text' => $data['title'], 'position' => $position, 'is_public' => false]);
                }

                return $product;
            });
        } catch (\Throwable $exception) {
            Storage::disk($mediaDisk)->delete($storedPaths);
            throw $exception;
        }

        return response()->json(['data' => ['id' => $product->id, 'slug' => $product->slug, 'status' => $product->status->value]], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->whereHas('producer', fn ($query) => $query->where('user_id', $request->user()->id))->findOrFail($id);
        $product->load(['category', 'images', 'latestModerationDecision']);
        $this->presentOwnerImages($product);

        return response()->json(['data' => $product]);
    }

    public function ownerImage(Request $request, int $id, int $imageId)
    {
        $image = ProductImage::query()
            ->where('product_id', $id)
            ->whereHas('product.producer', fn ($query) => $query->where('user_id', $request->user()->id))
            ->findOrFail($imageId);
        abort_unless(Storage::disk($image->disk)->exists($image->path), 404);

        return Storage::disk($image->disk)->response($image->path, null, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff', 'Content-Disposition' => 'inline']);
    }

    public function update(Request $request, int $id, ProductPhotoOptimizer $photoOptimizer): JsonResponse
    {
        $product = Product::query()->whereHas('producer', fn ($query) => $query->where('user_id', $request->user()->id))->findOrFail($id);
        $editableStatuses = ['draft', 'changes_requested', 'rejected', 'published', 'paused', 'sold_out'];
        abort_unless(in_array($product->status->value, $editableStatuses, true), 409, 'Solo puedes editar borradores, publicaciones devueltas o una oferta previamente publicada.');
        $data = $request->validate([
            'title' => ['required', 'string', 'min:3', 'max:120'],
            'category_id' => ['required', 'integer', Rule::exists('categories', 'id')->where('active', true)],
            'description' => ['required', 'string', 'min:20', 'max:3000'],
            'unit' => ['required', 'string', 'max:40'],
            'price_type' => ['required', 'in:fixed,from,contact'],
            'price_amount' => ['nullable', 'numeric', 'min:0', 'required_if:price_type,fixed,from'],
            'currency' => ['nullable', 'in:PAB,USD'],
            'stock_quantity' => ['nullable', 'numeric', 'min:0'],
            'delivery_method' => ['required', 'string', 'max:120'],
            'images' => ['sometimes', 'array', 'min:1', 'max:5'],
            'images.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'dimensions:min_width=300,min_height=300,max_width=6000,max_height=6000', 'max:5120'],
            'remove_image_ids' => ['sometimes', 'array', 'max:5'],
            'remove_image_ids.*' => ['integer', 'distinct', Rule::exists('product_images', 'id')->where(fn ($query) => $query->where('product_id', $product->id))],
        ]);
        $requiresReview = in_array($product->status->value, ['published', 'paused', 'sold_out'], true);
        if ($requiresReview) {
            $data += $request->validate(['reason' => ['required', 'string', 'min:5', 'max:1000']]);
        }
        $data['price_amount'] = $data['price_amount'] ?? null;
        $data['currency'] = $data['currency'] ?? 'PAB';
        $data['price_type'] = $data['price_type'] ?? 'contact';
        if ($data['price_type'] === 'contact') {
            $data['price_amount'] = null;
        }
        $mediaDisk = config('filesystems.media');
        $storedPaths = [];
        $removedImages = [];
        try {
            DB::transaction(function () use ($product, $data, $mediaDisk, $photoOptimizer, $request, $requiresReview, &$storedPaths, &$removedImages): void {
                $product = Product::query()->lockForUpdate()->findOrFail($product->id);
                abort_unless(in_array($product->status->value, ['draft', 'changes_requested', 'rejected', 'published', 'paused', 'sold_out'], true), 409, 'La publicación cambió de estado y ya no se puede editar. Actualiza la página.');
                $wasLive = in_array($product->status->value, ['published', 'paused', 'sold_out'], true);
                abort_unless($wasLive === $requiresReview, 409, 'La publicación cambió de estado. Actualiza la página antes de guardar.');
                $imagesToRemove = $product->images()->whereIn('id', $data['remove_image_ids'] ?? [])->lockForUpdate()->get();
                $remainingImageCount = $product->images()->count() - $imagesToRemove->count() + count($data['images'] ?? []);
                abort_if($remainingImageCount < 1, 422, 'Cada publicación debe conservar al menos una fotografía.');
                abort_if($remainingImageCount > 5, 422, 'Cada producto puede tener hasta cinco fotografías.');
                $removedImages = $imagesToRemove->map(fn (ProductImage $image): array => [
                    'id' => $image->id, 'disk' => $image->disk, 'paths' => array_filter([$image->path, $image->thumbnail_path]),
                ])->all();
                $fromStatus = $product->status->value;
                $product->update(collect($data)->except(['images', 'remove_image_ids', 'reason'])->all());
                if ($imagesToRemove->isNotEmpty()) {
                    $product->images()->whereIn('id', $imagesToRemove->modelKeys())->delete();
                    AuditLog::create([
                        'actor_id' => $request->user()->id,
                        'action' => 'producer.product_images_removed',
                        'resource_type' => 'product',
                        'resource_id' => $product->id,
                        'before_values' => ['image_ids' => $imagesToRemove->modelKeys()],
                        'after_values' => ['image_count' => $product->images()->count() + count($data['images'] ?? [])],
                        'reason' => 'El productor retiró fotografías durante la edición.',
                        'created_at' => now(),
                    ]);
                }
                if (! empty($data['images'])) {
                    $nextPosition = (int) $product->images()->max('position') + 1;
                    foreach ($data['images'] as $position => $image) {
                        $paths = $photoOptimizer->store($image, $mediaDisk, "products/{$product->id}");
                        $storedPaths = array_merge($storedPaths, array_values($paths));
                        $product->images()->create(['disk' => $mediaDisk, ...$paths, 'alt_text' => $data['title'], 'position' => $nextPosition + $position, 'is_public' => false]);
                    }
                }
                if ($requiresReview) {
                    $product->status = 'pending';
                    $product->images()->update(['is_public' => false]);
                    $product->save();
                    $reason = trim($data['reason']);
                    $product->statusHistory()->create(['actor_id' => $request->user()->id, 'from_status' => $fromStatus, 'to_status' => 'pending', 'reason' => $reason]);
                    AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'product.status_changed', 'resource_type' => 'product', 'resource_id' => $product->id, 'before_values' => ['status' => $fromStatus], 'after_values' => ['status' => 'pending'], 'reason' => $reason, 'created_at' => now()]);
                }
            });
        } catch (\Throwable $exception) {
            Storage::disk($mediaDisk)->delete($storedPaths);
            throw $exception;
        }
        foreach ($removedImages as $image) {
            foreach ($image['paths'] as $path) {
                if (! Storage::disk($image['disk'])->delete($path)) {
                    Log::warning('No se pudo eliminar una fotografía retirada del almacenamiento.', ['product_image_id' => $image['id'], 'product_id' => $product->id]);
                }
            }
        }

        $updatedProduct = $product->fresh()->load(['category', 'images']);
        $this->presentOwnerImages($updatedProduct);

        return response()->json(['data' => $updatedProduct]);
    }

    public function submit(Request $request, int $id, ProductWorkflow $workflow): JsonResponse
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:1000']]);
        $product = Product::query()->whereHas('producer', fn ($query) => $query->where('user_id', $request->user()->id))->findOrFail($id);
        $product = $workflow->transition($product, 'pending', $request->user()->id, $data['reason']);

        return response()->json(['data' => ['id' => $product->id, 'status' => $product->status->value]], 202);
    }

    public function transition(Request $request, int $id, ProductWorkflow $workflow): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:published,paused,sold_out,withdrawn'], 'reason' => ['nullable', 'string', 'max:1000']]);
        $product = Product::query()->whereHas('producer', fn ($query) => $query->where('user_id', $request->user()->id))->findOrFail($id);
        $product = $workflow->transition($product, $data['status'], $request->user()->id, $data['reason'] ?? null);

        return response()->json(['data' => ['id' => $product->id, 'status' => $product->status->value]]);
    }

    public function renew(Request $request, int $id, ProductWorkflow $workflow): JsonResponse
    {
        $product = Product::query()->whereHas('producer', fn ($query) => $query->where('user_id', $request->user()->id))->findOrFail($id);
        $product = $workflow->renewExpiredListing($product, $request->user()->id);

        return response()->json(['data' => [
            'id' => $product->id,
            'status' => $product->status->value,
            'published_at' => $product->published_at,
            'listing_expired' => false,
            'listing_expires_at' => $product->listingExpiresAt(),
        ]]);
    }

    public function moderate(Request $request, int $id, ProductWorkflow $workflow): JsonResponse
    {
        Gate::authorize('products.review');
        $data = $request->validate(['decision' => ['required', 'in:approve,reject,request_changes'], 'reason' => ['required', 'string', 'min:5', 'max:1000']]);
        $status = ['approve' => 'published', 'reject' => 'rejected', 'request_changes' => 'changes_requested'][$data['decision']];
        $product = Product::query()->where('status', 'pending')->findOrFail($id);
        $isAdmin = $request->user() instanceof AdminUser;
        $product = $workflow->transition($product, $status, $isAdmin ? null : $request->user()->id, $data['reason'], moderator: true, adminActorId: $isAdmin ? $request->user()->id : null);

        return response()->json(['data' => ['id' => $product->id, 'status' => $product->status->value]]);
    }

    public function moderateMany(Request $request, ProductWorkflow $workflow): JsonResponse
    {
        Gate::authorize('products.review');
        if (is_string($request->input('reason'))) {
            $request->merge(['reason' => trim($request->input('reason'))]);
        }
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1', 'max:20'],
            'ids.*' => ['required', 'integer', 'min:1', 'distinct'],
            'decision' => ['required', 'in:approve,reject,request_changes'],
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);
        $target = ['approve' => 'published', 'reject' => 'rejected', 'request_changes' => 'changes_requested'][$data['decision']];
        $processed = [];
        $failed = [];

        foreach ($data['ids'] as $id) {
            $product = Product::query()->where('status', 'pending')->find($id);
            if (! $product) {
                $failed[] = ['id' => (int) $id, 'message' => 'La publicación ya no está pendiente o no existe.'];

                continue;
            }

            try {
                $isAdmin = $request->user() instanceof AdminUser;
                $product = $workflow->transition($product, $target, $isAdmin ? null : $request->user()->id, $data['reason'], moderator: true, adminActorId: $isAdmin ? $request->user()->id : null);
                $processed[] = ['id' => $product->id, 'status' => $product->status->value];
            } catch (ValidationException $exception) {
                $failed[] = ['id' => (int) $id, 'message' => collect($exception->errors())->flatten()->implode(' ')];
            } catch (ModelNotFoundException) {
                $failed[] = ['id' => (int) $id, 'message' => 'La publicación cambió mientras se procesaba. Actualiza la cola e inténtalo de nuevo.'];
            }
        }

        return response()->json(['data' => ['processed' => $processed, 'failed' => $failed]]);
    }

    public function approveProduct(Request $request, int $id, ProductWorkflow $workflow): JsonResponse
    {
        $request->merge(['decision' => 'approve']);

        return $this->moderate($request, $id, $workflow);
    }

    public function moderationQueue(Request $request): JsonResponse
    {
        Gate::authorize('products.review');
        $products = Product::query()
            ->select(['id', 'producer_profile_id', 'category_id', 'title', 'description', 'unit', 'status'])
            ->where('status', 'pending')
            ->with([
                'producer:id,public_name,profile_status,phone_verified_at',
                'category:id,parent_id,name,active',
                'category.parent:id,active',
                'images:id,product_id,alt_text,position,is_public',
                'statusHistory.actor:id,name',
            ])
            ->latest()
            ->paginate(20);
        $products->getCollection()->each(function (Product $product): void {
            $product->setAttribute('status_history', $product->statusHistory->sortByDesc('created_at')->take(3)->values());
            $product->unsetRelation('statusHistory');
            $product->producer->setAttribute('contact_verified', $product->producer->phone_verified_at !== null);
            $product->producer->makeHidden('phone_verified_at');
            $product->images->each(fn ($image) => $image->setAttribute('url', url('/api/admin/products/'.$product->id.'/images/'.$image->id)));
        });

        return response()->json($products);
    }

    public function moderationImage(Request $request, int $id, int $imageId)
    {
        Gate::authorize('products.review');
        $image = ProductImage::query()->where('product_id', $id)->whereHas('product', fn ($query) => $query->where('status', 'pending'))->findOrFail($imageId);
        abort_unless(Storage::disk($image->disk)->exists($image->path), 404);
        AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'moderation.product_image_viewed', 'resource_type' => 'product_image', 'resource_id' => $image->id, 'created_at' => now()]);

        return Storage::disk($image->disk)->response($image->path, null, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff', 'Content-Disposition' => 'inline']);
    }

    private function presentOwnerImages(Product $product): void
    {
        $product->images->each(fn (ProductImage $image) => $image->setAttribute('url', URL::to('/api/me/products/'.$product->id.'/images/'.$image->id)));
    }

    public function verifyPhone(Request $request, PhoneVerificationWorkflow $workflow, ContactVerificationSender $sender): JsonResponse
    {
        $data = $request->validate(['phone' => ['required', 'string', 'max:40', new ValidContactPhone], 'code' => ['required', 'string', 'size:6']]);
        $data['phone'] = PanamaPhoneNumber::normalize($data['phone']);
        $failure = $workflow->confirm($request->user()->id, $request->user()->id, $data['phone'], $data['code'], $sender);

        if ($failure !== null) {
            abort($failure['status'], $failure['message']);
        }

        return response()->json(['data' => ['contact_level' => 'contact_confirmed']]);
    }

    public function startPhoneVerification(Request $request, ContactVerificationSender $sender): JsonResponse
    {
        $profile = ProducerProfile::query()->where('user_id', $request->user()->id)->firstOrFail();
        $phone = PanamaPhoneNumber::normalize($profile->phone_private);
        if ($phone === null) {
            throw ValidationException::withMessages(['phone' => ['Actualiza tu teléfono con ocho dígitos de Panamá o un número internacional válido antes de solicitar el código.']]);
        }
        $key = 'verify-start:'.$profile->id;
        if (RateLimiter::tooManyAttempts($key, 3)) {
            abort(429, 'Has solicitado varios códigos. Espera antes de pedir otro.');
        }
        RateLimiter::hit($key, 3600);
        $code = (string) random_int(100000, 999999);
        $driver = config('services.contact_verification.driver') ?: (app()->environment(['local', 'testing']) ? 'fake' : 'twilio');
        if (app()->environment(['local', 'testing']) && $driver === 'fake' && config('services.contact_verification.development_code')) {
            $code = (string) config('services.contact_verification.development_code');
        }
        [$profile, $phone, $verification] = DB::transaction(function () use ($request, $sender, $code): array {
            $profile = ProducerProfile::query()->where('user_id', $request->user()->id)->lockForUpdate()->firstOrFail();
            $phone = PanamaPhoneNumber::normalize($profile->phone_private);
            if ($phone === null) {
                throw ValidationException::withMessages(['phone' => ['Actualiza tu teléfono con ocho dígitos de Panamá o un número internacional válido antes de solicitar el código.']]);
            }

            $profile->verifications()->where('status', 'pending')->update(['status' => 'expired', 'code_hash' => null]);
            $verification = $profile->verifications()->create([
                'channel' => 'sms',
                'status' => 'pending',
                'code_hash' => $sender->hashCode($code),
                'expires_at' => now()->addMinutes(10),
            ]);

            return [$profile, $phone, $verification];
        });
        $destination = ($driver === 'email') ? (string) $request->user()->email : $phone;
        try {
            $sender->send($destination, $code);
        } catch (\Throwable $exception) {
            $verification->forceFill(['status' => 'delivery_failed', 'code_hash' => null])->save();
            Log::warning('No se pudo entregar el código de verificación.', ['provider' => $driver, 'verification_id' => $verification->id, 'producer_profile_id' => $profile->id, 'exception' => $exception::class]);

            return response()->json(['message' => 'No pudimos enviar el código. Inténtalo más tarde.'], 503);
        }
        $data = ['id' => $verification->id, 'expires_at' => $verification->expires_at];
        if (app()->environment(['local', 'testing']) && $driver === 'fake' && config('services.contact_verification.development_code')) {
            $data['development_code'] = config('services.contact_verification.development_code');
        }

        return response()->json(['data' => $data], 202);
    }
}
