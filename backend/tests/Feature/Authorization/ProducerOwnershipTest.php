<?php

namespace Tests\Feature\Authorization;

use App\Enums\ProductStatus;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\ContactEvent;
use App\Models\Location;
use App\Models\Permission;
use App\Models\ProducerAppeal;
use App\Models\ProducerProfile;
use App\Models\Product;
use App\Models\Report;
use App\Models\RiskSignal;
use App\Models\Role;
use App\Models\SearchEvent;
use App\Models\User;
use App\Services\ContactVerificationSender;
use App\Services\ProductPhotoOptimizer;
use App\Services\ProductWorkflow;
use App\Services\Totp;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ProducerOwnershipTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        $this->seed();
    }

    private function confirmMfa(User $user): User
    {
        $user->forceFill(['two_factor_secret' => 'test-secret', 'two_factor_confirmed_at' => now()])->save();

        return $user;
    }

    private function publicProduct(array $attributes = []): Product
    {
        $product = Product::factory()->create(array_merge([
            'status' => ProductStatus::Published,
            'published_at' => now(),
        ], $attributes));
        $product->producer()->update([
            'profile_status' => 'active',
            'phone_public' => $product->producer->phone_private,
            'phone_verified_at' => now(),
        ]);

        return $product->fresh();
    }

    private function attachAvailablePhoto(Product $product): void
    {
        $path = "products/{$product->id}/test-photo.jpg";
        Storage::disk('local')->put($path, file_get_contents(base_path('tests/fixture-product.jpg')));
        $product->images()->create(['disk' => 'local', 'path' => $path, 'alt_text' => $product->title, 'position' => 0, 'is_public' => false]);
    }

    public function test_a_producer_can_only_see_their_own_products(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $ownedProduct = Product::factory()->create(['producer_profile_id' => $owner->producerProfile()->create(['slug' => 'owner', 'public_name' => 'Owner', 'phone_private' => '+50760000001'])->id]);
        Product::factory()->create(['producer_profile_id' => $other->producerProfile()->create(['slug' => 'other', 'public_name' => 'Other', 'phone_private' => '+50760000002'])->id]);

        $this->actingAs($owner)
            ->getJson('/api/me/products')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $ownedProduct->id);
    }

    public function test_product_write_limit_is_six_per_minute_per_authenticated_account(): void
    {
        $firstProducer = User::factory()->create();
        $secondProducer = User::factory()->create();
        $this->actingAs($firstProducer);

        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->postJson('/api/me/products/999999/transition', ['status' => 'invalid'])->assertUnprocessable();
        }

        $this->postJson('/api/me/products/999999/transition', ['status' => 'invalid'])->assertTooManyRequests();

        $this->actingAs($secondProducer)
            ->postJson('/api/me/products/999999/transition', ['status' => 'invalid'])
            ->assertUnprocessable();
    }

    public function test_producer_metrics_are_private_aggregated_and_limited_to_owned_profile(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $ownerProfile = $owner->producerProfile()->create(['slug' => 'metrics-owner', 'public_name' => 'Finca propia', 'phone_private' => '+50760000011']);
        $otherProfile = $other->producerProfile()->create(['slug' => 'metrics-other', 'public_name' => 'Otra finca', 'phone_private' => '+50760000012']);
        Product::factory()->create(['producer_profile_id' => $ownerProfile->id, 'status' => ProductStatus::Draft]);
        Product::factory()->create(['producer_profile_id' => $ownerProfile->id, 'status' => ProductStatus::Published]);
        Product::factory()->create(['producer_profile_id' => $otherProfile->id, 'status' => ProductStatus::Published]);
        $ownerProduct = Product::query()->where('producer_profile_id', $ownerProfile->id)->firstOrFail();
        $otherProduct = Product::query()->where('producer_profile_id', $otherProfile->id)->firstOrFail();
        ContactEvent::create(['product_id' => $ownerProduct->id, 'producer_profile_id' => $ownerProfile->id, 'channel' => 'whatsapp', 'dedupe_key' => hash('sha256', 'owner-recent'), 'occurred_at' => now()->subDays(2)]);
        ContactEvent::create(['product_id' => $ownerProduct->id, 'producer_profile_id' => $ownerProfile->id, 'channel' => 'phone', 'dedupe_key' => hash('sha256', 'owner-old'), 'occurred_at' => now()->subDays(31)]);
        ContactEvent::create(['product_id' => $otherProduct->id, 'producer_profile_id' => $otherProfile->id, 'channel' => 'whatsapp', 'dedupe_key' => hash('sha256', 'other-recent'), 'occurred_at' => now()->subDay()]);

        $this->getJson('/api/me/metrics')->assertUnauthorized();
        $response = $this->actingAs($owner)->getJson('/api/me/metrics')->assertOk()
            ->assertJsonPath('data.products.draft', 1)
            ->assertJsonPath('data.products.published', 1)
            ->assertJsonPath('data.contact_intentions_30d', 1)
            ->assertJsonPath('data.period_days', 30)
            ->assertJsonMissingPath('data.events')
            ->assertJsonMissingPath('data.visitors')
            ->assertJsonMissingPath('data.buyer_emails');
        $this->assertSame(['draft' => 1, 'published' => 1], $response->json('data.products'));
    }

    public function test_a_producer_cannot_read_another_producers_product_by_id(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        $product = Product::factory()->create(['producer_profile_id' => $other->producerProfile()->create(['slug' => 'other', 'public_name' => 'Other', 'phone_private' => '+50760000002'])->id]);

        $this->actingAs($owner)
            ->getJson("/api/me/products/{$product->id}")
            ->assertNotFound();
    }

    public function test_editing_a_live_offer_requires_reason_and_sends_it_to_moderation_without_renewing_ttl(): void
    {
        Storage::fake('local');
        $product = $this->publicProduct(['published_at' => now()->subDays(12)]);
        $user = $product->producer->user;
        $this->attachAvailablePhoto($product);
        $data = [
            'title' => 'Yuca fresca seleccionada',
            'category_id' => $product->category_id,
            'description' => 'Yuca cosechada esta semana y seleccionada en la finca familiar.',
            'unit' => 'libra', 'price_type' => 'contact', 'currency' => 'PAB',
            'delivery_method' => 'Retiro coordinado',
        ];

        $this->actingAs($user)->patchJson("/api/me/products/{$product->id}", $data)
            ->assertUnprocessable()->assertJsonValidationErrors('reason');
        $this->assertSame('published', $product->fresh()->status->value);

        $newPhoto = new UploadedFile(base_path('tests/fixture-product.jpg'), 'actualizacion.jpg', 'image/jpeg', null, true);
        $response = $this->actingAs($user)->post("/api/me/products/{$product->id}", $data + [
            'reason' => 'Actualicé la descripción y confirmé la disponibilidad.',
            'images' => [$newPhoto],
            '_method' => 'PATCH',
        ], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.status', 'pending');

        $this->assertSame($product->published_at->toISOString(), $product->fresh()->published_at->toISOString());
        $this->assertDatabaseHas('product_status_history', [
            'product_id' => $product->id, 'actor_id' => $user->id,
            'from_status' => 'published', 'to_status' => 'pending',
            'reason' => 'Actualicé la descripción y confirmé la disponibilidad.',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $user->id, 'action' => 'product.status_changed',
            'resource_type' => 'product', 'resource_id' => $product->id,
            'reason' => 'Actualicé la descripción y confirmé la disponibilidad.',
        ]);
        $this->getJson('/api/products')->assertOk()->assertJsonMissing(['id' => $product->id]);
        $this->assertSame('pending', $response->json('data.status'));
        $this->assertDatabaseCount('product_images', 2);
        $this->assertDatabaseHas('product_images', ['product_id' => $product->id, 'alt_text' => 'Yuca fresca seleccionada', 'is_public' => false]);
        $this->assertSame(0, $product->images()->where('is_public', true)->count());
        $otherProducer = User::factory()->create();
        $this->actingAs($otherProducer)->patchJson("/api/me/products/{$product->id}", $data + ['reason' => 'Intento de edición no autorizado.'])->assertNotFound();
        $this->assertSame('pending', $product->fresh()->status->value);

        $moderator = User::factory()->create();
        $moderatorRole = Role::query()->where('name', 'moderator')->firstOrFail();
        $moderatorRole->permissions()->syncWithoutDetaching([Permission::query()->where('name', 'products.review')->valueOrFail('id')]);
        $moderator->roles()->attach($moderatorRole->id);
        $this->confirmMfa($moderator);
        $this->actingAs($moderator)->postJson("/api/admin/products/{$product->id}/approve", [
            'reason' => 'Los cambios cumplen los requisitos de publicación.',
        ])->assertOk()->assertJsonPath('data.status', 'published');

        $this->assertSame($product->published_at->toISOString(), $product->fresh()->published_at->toISOString());
        $this->assertSame(2, $product->images()->where('is_public', true)->count());
        $this->getJson('/api/products')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $product->id);
    }

    public function test_editing_paused_and_sold_out_offers_also_requires_review_before_returning_to_catalog(): void
    {
        Storage::fake('local');
        $moderator = User::factory()->create();
        $moderatorRole = Role::query()->where('name', 'moderator')->firstOrFail();
        $moderatorRole->permissions()->syncWithoutDetaching([Permission::query()->where('name', 'products.review')->valueOrFail('id')]);
        $moderator->roles()->attach($moderatorRole->id);
        $this->confirmMfa($moderator);

        foreach ([ProductStatus::Paused, ProductStatus::SoldOut] as $status) {
            $product = $this->publicProduct(['status' => $status, 'published_at' => now()->subDays(9)]);
            $owner = $product->producer->user;
            $this->attachAvailablePhoto($product);
            $data = [
                'title' => 'Plátano de la finca',
                'category_id' => $product->category_id,
                'description' => 'Plátanos maduros cosechados en la finca familiar esta semana.',
                'unit' => 'docena', 'price_type' => 'contact', 'delivery_method' => 'Retiro coordinado',
            ];

            $this->actingAs($owner)->patchJson("/api/me/products/{$product->id}", $data)
                ->assertUnprocessable()->assertJsonValidationErrors('reason');
            $this->actingAs($owner)->post("/api/me/products/{$product->id}", $data + [
                'reason' => 'Actualicé disponibilidad y datos del producto.', '_method' => 'PATCH',
            ], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('data.status', 'pending');

            $this->assertDatabaseHas('product_status_history', [
                'product_id' => $product->id, 'actor_id' => $owner->id,
                'from_status' => $status->value, 'to_status' => 'pending',
                'reason' => 'Actualicé disponibilidad y datos del producto.',
            ]);
            $this->assertSame(0, $product->images()->where('is_public', true)->count());
            $this->getJson("/api/products/{$product->slug}")->assertNotFound();

            $this->actingAs($moderator)->postJson("/api/admin/products/{$product->id}/approve", [
                'reason' => 'La oferta vuelve a cumplir los requisitos de publicación.',
            ])->assertOk()->assertJsonPath('data.status', 'published');
            $this->assertSame($product->published_at->toISOString(), $product->fresh()->published_at->toISOString());
            $this->getJson("/api/products/{$product->slug}")->assertOk();
        }
    }

    public function test_public_catalog_filters_by_province_district_and_corregimiento_hierarchy(): void
    {
        $lasTablas = Location::where('slug', 'las-tablas')->firstOrFail();
        $santoDomingo = Location::where('slug', 'las-tablas-santo-domingo')->where('parent_id', $lasTablas->id)->firstOrFail();
        $guarare = Location::where('slug', 'guarare')->firstOrFail();
        $herrera = Location::where('slug', 'herrera')->firstOrFail();
        $locations = [$santoDomingo, $guarare, $herrera];
        foreach ($locations as $index => $location) {
            $user = User::factory()->create();
            $phone = '+5076000300'.(string) $index;
            $profile = $user->producerProfile()->create(['slug' => "geo-profile-{$index}", 'public_name' => "Productor {$index}", 'phone_private' => $phone, 'phone_public' => $phone, 'phone_verified_at' => now(), 'contact_level' => 'contact_confirmed', 'location_id' => $location->id, 'profile_status' => 'active']);
            Product::factory()->create(['producer_profile_id' => $profile->id, 'status' => ProductStatus::Published, 'published_at' => now(), 'slug' => "geo-product-{$index}"]);
        }

        $this->getJson('/api/products?province=los-santos')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/products?district=las-tablas')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'geo-product-0');
        $this->getJson('/api/products?corregimiento=las-tablas-santo-domingo')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'geo-product-0');
        $this->getJson('/api/products?province=los-santos&district=guarare')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'geo-product-1');
        $this->getJson('/api/products?province=los-santos&district=guarare&corregimiento=las-tablas-santo-domingo')->assertUnprocessable();
        $this->getJson('/api/products?province=las-tablas')->assertUnprocessable();
        $this->postJson('/api/search-events', [
            'q' => 'yuca', 'province' => 'los-santos', 'district' => 'guarare',
            'corregimiento' => 'las-tablas-santo-domingo',
        ])->assertUnprocessable();
        $this->assertDatabaseCount('search_events', 0);
    }

    public function test_registration_rejects_inactive_or_malformed_location_hierarchies(): void
    {
        $province = Location::query()->where('slug', 'los-santos')->firstOrFail();
        $district = Location::query()->where('slug', 'las-tablas')->firstOrFail();
        $inactiveProvince = Location::create(['level' => 'province', 'name' => 'Provincia inactiva', 'slug' => 'provincia-inactiva', 'active' => false]);
        $malformedDistrict = Location::create(['parent_id' => $district->id, 'level' => 'district', 'name' => 'Distrito mal formado', 'slug' => 'distrito-mal-formado', 'active' => true]);

        foreach ([$inactiveProvince->id, $malformedDistrict->id] as $index => $locationId) {
            $this->postJson('/api/auth/register', [
                'name' => "Productor {$index}",
                'email' => "location-{$index}@example.test",
                'password' => 'UnaClaveSegura123!',
                'public_name' => "Finca {$index}",
                'location_id' => $locationId,
                'phone' => '+5076000100'.(string) $index,
                'terms_version' => config('marketplace.consent_versions.terms'),
                'privacy_version' => config('marketplace.consent_versions.privacy'),
            ])->assertUnprocessable()->assertJsonValidationErrors('location_id');
        }

        $this->assertDatabaseMissing('users', ['email' => 'location-0@example.test']);
        $this->assertDatabaseMissing('users', ['email' => 'location-1@example.test']);
        $this->assertSame('province', $province->level);
    }

    public function test_profile_update_rejects_a_location_with_an_inactive_ancestor(): void
    {
        $user = User::factory()->create();
        $profile = $user->producerProfile()->create([
            'slug' => 'location-validation-profile',
            'public_name' => 'Finca de prueba',
            'phone_private' => '+50760001999',
            'location_id' => Location::query()->where('slug', 'las-tablas')->valueOrFail('id'),
        ]);
        $province = Location::query()->where('slug', 'los-santos')->firstOrFail();
        $province->update(['active' => false]);
        $corregimiento = Location::query()->where('slug', 'las-tablas-santo-domingo')->firstOrFail();

        $this->actingAs($user)->putJson('/api/me/profile', [
            'location_id' => $corregimiento->id,
        ])->assertUnprocessable()->assertJsonValidationErrors('location_id');

        $this->assertSame((int) $profile->location_id, (int) $profile->fresh()->location_id);
    }

    public function test_public_producer_directory_filters_active_producers_with_available_offers_and_hides_private_phone(): void
    {
        $province = Location::query()->where('slug', 'los-santos')->firstOrFail();
        $district = Location::query()->where('slug', 'las-tablas')->firstOrFail();
        $category = Category::query()->where('slug', 'del-campo')->firstOrFail();
        $user = User::factory()->create();
        $producer = $user->producerProfile()->create(['slug' => 'manos-de-azuero', 'public_name' => 'Manos de Azuero', 'activity' => 'Agricultura familiar', 'description' => 'Cultivamos alimentos frescos en Azuero.', 'phone_private' => '+50761112222', 'phone_public' => '+50761112222', 'phone_verified_at' => now(), 'contact_level' => 'contact_confirmed', 'profile_status' => 'active', 'location_id' => $district->id]);
        $producer->products()->create(['category_id' => $category->id, 'created_by' => $user->id, 'slug' => 'yuca-manos-azuero', 'title' => 'Yuca fresca', 'description' => 'Yuca cosechada esta semana en Las Tablas.', 'unit' => 'libra', 'price_type' => 'contact', 'currency' => 'PAB', 'delivery_method' => 'Acordar con productor', 'status' => ProductStatus::Published, 'published_at' => now()]);
        $inactiveUser = User::factory()->create();
        $inactive = $inactiveUser->producerProfile()->create(['slug' => 'manos-suspendidas', 'public_name' => 'Manos suspendidas', 'phone_private' => '+50763334444', 'profile_status' => 'suspended', 'location_id' => $district->id]);
        $inactive->products()->create(['category_id' => $category->id, 'created_by' => $inactiveUser->id, 'slug' => 'yuca-suspendida', 'title' => 'Yuca suspendida', 'description' => 'Una oferta que no debe mostrarse.', 'unit' => 'libra', 'price_type' => 'contact', 'currency' => 'PAB', 'delivery_method' => 'Acordar con productor', 'status' => ProductStatus::Published, 'published_at' => now()]);

        $response = $this->getJson('/api/producers?q=Manos&province=los-santos&district=las-tablas&category=del-campo')->assertOk();
        $response->assertJsonPath('total', 1)->assertJsonPath('data.0.slug', 'manos-de-azuero')->assertJsonPath('data.0.products_count', 1)->assertJsonPath('data.0.location.name', 'Las Tablas')->assertJsonMissing(['phone_private' => '+50761112222'])->assertJsonMissing(['phone_public' => '+50761112222']);
    }

    public function test_public_product_and_producer_payloads_include_complete_location_ancestry(): void
    {
        $province = Location::where('slug', 'los-santos')->firstOrFail();
        $district = Location::where('slug', 'las-tablas')->where('parent_id', $province->id)->firstOrFail();
        $corregimiento = Location::where('slug', 'las-tablas-santo-domingo')->where('parent_id', $district->id)->firstOrFail();
        $user = User::factory()->create();
        $profile = $user->producerProfile()->create([
            'slug' => 'location-ancestry-producer',
            'public_name' => 'Productora de prueba',
            'phone_private' => '+50760003090',
            'phone_public' => '+50760003090',
            'phone_verified_at' => now(),
            'contact_level' => 'contact_confirmed',
            'location_id' => $corregimiento->id,
            'profile_status' => 'active',
        ]);
        Product::factory()->create([
            'producer_profile_id' => $profile->id,
            'slug' => 'location-ancestry-product',
            'status' => ProductStatus::Published,
            'published_at' => now(),
        ]);

        $this->getJson('/api/products')
            ->assertOk()
            ->assertJsonPath('data.0.producer.location.name', 'Santo Domingo')
            ->assertJsonPath('data.0.producer.location.parent.name', 'Las Tablas')
            ->assertJsonPath('data.0.producer.location.parent.parent.name', 'Los Santos');

        $this->getJson('/api/products/location-ancestry-product')
            ->assertOk()
            ->assertJsonPath('data.producer.location.parent.parent.name', 'Los Santos');

        $this->getJson('/api/producers')
            ->assertOk()
            ->assertJsonPath('data.0.location.parent.parent.name', 'Los Santos');
    }

    public function test_producer_can_pause_mark_sold_out_and_withdraw_only_owned_listings(): void
    {
        $owner = User::factory()->create();
        $other = User::factory()->create();
        Storage::fake('local');
        $ownerProfile = $owner->producerProfile()->create(['slug' => 'lifecycle-owner', 'public_name' => 'Productor', 'phone_private' => '+50760000012', 'phone_public' => '+50760000012', 'phone_verified_at' => now(), 'profile_status' => 'active']);
        $owned = Product::factory()->create(['status' => ProductStatus::Published, 'producer_profile_id' => $ownerProfile->id]);
        $foreign = Product::factory()->create(['status' => ProductStatus::Published, 'producer_profile_id' => $other->producerProfile()->create(['slug' => 'lifecycle-other', 'public_name' => 'Otro', 'phone_private' => '+50760000013'])->id]);
        $this->attachAvailablePhoto($owned);

        $this->actingAs($owner)->postJson("/api/me/products/{$owned->id}/transition", ['status' => 'paused'])->assertOk()->assertJsonPath('data.status', 'paused');
        $this->postJson("/api/me/products/{$owned->id}/transition", ['status' => 'published'])->assertOk()->assertJsonPath('data.status', 'published');
        $this->postJson("/api/me/products/{$owned->id}/transition", ['status' => 'sold_out'])->assertOk()->assertJsonPath('data.status', 'sold_out');
        $this->postJson("/api/me/products/{$owned->id}/transition", ['status' => 'withdrawn', 'reason' => 'Oferta retirada por el productor.'])->assertOk()->assertJsonPath('data.status', 'withdrawn');
        $this->postJson("/api/me/products/{$foreign->id}/transition", ['status' => 'paused'])->assertNotFound();
        $this->postJson("/api/me/products/{$owned->id}/transition", ['status' => 'pending'])->assertUnprocessable();
    }

    public function test_password_reset_request_is_generic_and_delivers_only_to_matching_accounts(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email' => 'recuperar@example.test']);

        $knownMessage = $this->postJson('/api/auth/password/forgot', ['email' => $user->email])
            ->assertAccepted()->json('message');
        $unknownMessage = $this->postJson('/api/auth/password/forgot', ['email' => 'desconocido@example.test'])
            ->assertAccepted()->json('message');

        $this->assertSame($knownMessage, $unknownMessage);
        Notification::assertSentTo($user, ResetPassword::class);
    }

    public function test_password_reset_delivery_failure_is_logged_without_account_or_token_data(): void
    {
        $email = 'sensible@example.test';
        Log::shouldReceive('error')->once()->with('auth.password_reset.delivery_failed', ['exception_class' => \RuntimeException::class]);
        Password::shouldReceive('sendResetLink')->once()->andThrow(new \RuntimeException('SMTP failure containing secret token'));

        $this->postJson('/api/auth/password/forgot', ['email' => $email])
            ->assertAccepted()
            ->assertJsonPath('message', 'Si el correo corresponde a una cuenta, enviaremos instrucciones para restablecer la contraseña.')
            ->assertJsonMissing(['email' => $email])
            ->assertJsonMissing(['token' => 'secret token']);
    }

    public function test_password_reset_token_is_single_use_and_preserves_staff_mfa(): void
    {
        $user = User::factory()->create(['email' => 'mfa-reset@example.test', 'password' => 'Old-password-12345']);
        $user->roles()->attach(Role::query()->where('name', 'moderator')->valueOrFail('id'));
        $this->confirmMfa($user);
        $token = Password::createToken($user);
        $payload = ['email' => $user->email, 'token' => $token, 'password' => 'New-password-12345', 'password_confirmation' => 'New-password-12345'];

        $this->postJson('/api/auth/password/reset', $payload)->assertOk()->assertJsonPath('message', 'La contraseña se actualizó. Inicia sesión con tu nueva contraseña.');
        $this->assertTrue(Hash::check('New-password-12345', $user->fresh()->password));
        $this->assertNotNull($user->fresh()->two_factor_confirmed_at);
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'New-password-12345'])
            ->assertStatus(202)->assertJsonPath('mfa_required', true);
        $this->postJson('/api/auth/password/reset', $payload)->assertUnprocessable();
    }

    public function test_expired_or_invalid_password_reset_token_has_a_generic_error(): void
    {
        $user = User::factory()->create(['email' => 'token-invalido@example.test']);

        $this->postJson('/api/auth/password/reset', [
            'email' => $user->email,
            'token' => 'invalid-token',
            'password' => 'New-password-12345',
            'password_confirmation' => 'New-password-12345',
        ])->assertUnprocessable()->assertJsonPath('message', 'El enlace venció o no es válido. Solicita uno nuevo.');
    }

    public function test_registering_a_producer_records_versioned_consents_and_starts_unverified(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'Productora Local',
            'email' => 'productora@example.test',
            'password' => 'mercado-seguro-2026',
            'public_name' => 'Finca La Esperanza',
            'location_id' => Location::query()->where('slug', 'las-tablas')->valueOrFail('id'),
            'phone' => '+50760001122',
            'terms_version' => 'terms-2026-10',
            'privacy_version' => 'privacy-2026-10',
            'terms_confirmed' => true,
            'privacy_confirmed' => true,
        ])->assertCreated()->assertJsonPath('data.roles.0', 'producer');

        $user = User::where('email', 'productora@example.test')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertSame('unverified', $user->producerProfile->contact_level);
        $this->assertDatabaseHas('producer_consents', ['producer_profile_id' => $user->producerProfile->id, 'consent_type' => 'terms', 'version' => 'terms-2026-10']);
        $this->assertDatabaseHas('producer_consents', ['producer_profile_id' => $user->producerProfile->id, 'consent_type' => 'privacy', 'version' => 'privacy-2026-10']);
    }

    public function test_registration_requires_explicit_acceptance_of_terms_and_privacy(): void
    {
        $payload = [
            'name' => 'Productora sin aceptación',
            'email' => 'sin-aceptacion@example.test',
            'password' => 'mercado-seguro-2026',
            'public_name' => 'Finca sin aceptación',
            'location_id' => Location::query()->where('slug', 'las-tablas')->valueOrFail('id'),
            'phone' => '+50760001123',
            'terms_version' => config('marketplace.consent_versions.terms'),
            'privacy_version' => config('marketplace.consent_versions.privacy'),
        ];

        $this->postJson('/api/auth/register', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['terms_confirmed', 'privacy_confirmed']);

        $this->assertDatabaseMissing('users', ['email' => 'sin-aceptacion@example.test']);
    }

    public function test_manual_producer_marketplace_flow_requires_human_moderation_and_needs_no_ai(): void
    {
        config([
            'services.contact_verification.driver' => 'fake',
            'services.contact_verification.development_code' => '123456',
        ]);

        $this->postJson('/api/auth/register', [
            'name' => 'Productora Local',
            'email' => 'flujo-manual@example.test',
            'password' => 'mercado-seguro-2026',
            'public_name' => 'Finca del Flujo Manual',
            'location_id' => Location::query()->where('slug', 'las-tablas')->valueOrFail('id'),
            'phone' => '+50760001234',
            'terms_version' => 'terms-2026-10',
            'privacy_version' => 'privacy-2026-10',
            'terms_confirmed' => true,
            'privacy_confirmed' => true,
        ])->assertCreated();

        $producer = User::query()->where('email', 'flujo-manual@example.test')->firstOrFail();
        $this->assertAuthenticatedAs($producer);
        $this->postJson('/api/me/verify-phone/start')->assertAccepted();
        $this->postJson('/api/auth/verify', ['phone' => '+50760001234', 'code' => '123456'])
            ->assertOk()
            ->assertJsonPath('data.contact_level', 'contact_confirmed');

        if (! extension_loaded('gd')) {
            $this->markTestSkipped('La normalización de imágenes requiere GD; está instalado en la imagen Docker de PHP.');
        }
        $photo = new UploadedFile(base_path('tests/fixture-product.jpg'), 'yuca.jpg', 'image/jpeg', null, true);
        $draft = $this->actingAs($producer)->post('/api/me/products', [
            'title' => 'Yuca cosechada hoy',
            'category_id' => Category::query()->where('active', true)->valueOrFail('id'),
            'description' => 'Yuca fresca cosechada esta semana en la finca familiar.',
            'unit' => 'libra',
            'price_type' => 'fixed',
            'price_amount' => '0.75',
            'currency' => 'PAB',
            'delivery_method' => 'Recogida en punto acordado',
            'images' => [$photo],
        ], ['Accept' => 'application/json'])->assertCreated();
        $productId = $draft->json('data.id');
        $slug = $draft->json('data.slug');

        $edited = $this->actingAs($producer)->patchJson("/api/me/products/{$productId}", [
            'title' => 'Yuca fresca de Las Tablas',
            'category_id' => Category::query()->where('active', true)->valueOrFail('id'),
            'description' => 'Yuca fresca cosechada esta semana en la finca familiar de Las Tablas.',
            'unit' => 'libra',
            'price_type' => 'fixed',
            'price_amount' => '0.75',
            'currency' => 'PAB',
            'delivery_method' => 'Recogida en punto acordado',
        ])->assertOk();
        $slug = $edited->json('data.slug');

        $this->postJson("/api/me/products/{$productId}/submit", ['reason' => 'Lista para revisión humana.'])
            ->assertAccepted()
            ->assertJsonPath('data.status', 'pending');
        $this->getJson('/api/products/'.$slug)->assertNotFound();

        $admin = User::factory()->create();
        $admin->roles()->attach(Role::query()->where('name', 'admin')->firstOrFail()->id);
        $this->confirmMfa($admin);
        $this->actingAs($admin)->putJson('/api/admin/producers/'.$producer->producerProfile->id.'/status', [
            'profile_status' => 'active',
            'reason' => 'Perfil verificado para publicación.',
        ])->assertOk()->assertJsonPath('data.profile_status', 'active');
        $this->postJson("/api/admin/products/{$productId}/approve", ['reason' => 'Oferta revisada por el equipo.'])
            ->assertOk()
            ->assertJsonPath('data.status', 'published');

        $this->getJson('/api/products/'.$slug)->assertOk()->assertJsonPath('data.slug', $slug);
        $this->getJson('/api/products?q='.urlencode('Yuca fresca de Las Tablas'))
            ->assertOk()->assertJsonPath('data.0.slug', $slug);
        $this->postJson('/api/contact-events', ['product_id' => $productId, 'channel' => 'whatsapp'])
            ->assertAccepted()
            ->assertJsonPath('message', 'Intención de contacto registrada. Esto no confirma una conversación ni una venta.');
        $this->assertDatabaseHas('contact_events', ['product_id' => $productId, 'channel' => 'whatsapp']);
        $this->assertDatabaseHas('product_status_history', [
            'product_id' => $productId,
            'actor_id' => $admin->id,
            'to_status' => 'published',
            'reason' => 'Oferta revisada por el equipo.',
        ]);
    }

    public function test_assisted_registration_requires_permission_and_records_authorization_and_actor(): void
    {
        $operator = User::factory()->create();
        $operator->roles()->attach(Role::where('name', 'support_operator')->firstOrFail()->id);
        $this->confirmMfa($operator);
        $payload = ['name' => 'Productor Asistido', 'email' => 'asistido@example.test', 'password' => 'mercado-seguro-2026', 'public_name' => 'Finca Asistida', 'location_id' => Location::query()->where('slug', 'las-tablas')->valueOrFail('id'), 'phone' => '+50760009999', 'terms_version' => 'terms-2026-10', 'privacy_version' => 'privacy-2026-10', 'registration_method' => 'assisted', 'producer_authorized' => true, 'terms_confirmed' => true, 'privacy_confirmed' => true];

        $this->postJson('/api/auth/register', $payload)->assertForbidden();
        $this->actingAs($operator)->postJson('/api/admin/producers/assisted', [...$payload, 'email' => 'asistido-autorizado@example.test'])->assertCreated();
        $profile = ProducerProfile::where('public_name', 'Finca Asistida')->firstOrFail();
        $this->assertSame($operator->id, $profile->registered_by);
        $this->assertSame('assisted', $profile->registration_method);
        $this->assertDatabaseHas('producer_consents', ['producer_profile_id' => $profile->id, 'consent_type' => 'assisted_registration_authorization', 'recorded_by' => $operator->id]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $operator->id, 'action' => 'producer.assisted_registration_created', 'resource_id' => $profile->id]);
        $this->assertAuthenticatedAs($operator);
    }

    public function test_suspended_producer_can_submit_one_open_appeal_and_only_see_their_own_history(): void
    {
        $producer = User::factory()->create();
        $profile = $producer->producerProfile()->create(['slug' => 'suspended-appeal-owner', 'public_name' => 'Finca en revisión', 'phone_private' => '+50760009921', 'profile_status' => 'suspended', 'suspension_reason' => 'La oferta requiere confirmar el origen declarado.']);
        $this->actingAs($producer)->getJson('/api/me/appeals')->assertOk()
            ->assertJsonPath('data.profile_status', 'suspended')
            ->assertJsonPath('data.suspension_reason', 'La oferta requiere confirmar el origen declarado.')
            ->assertJsonCount(0, 'data.appeals');
        $response = $this->actingAs($producer)->postJson('/api/me/appeals', ['reason' => 'Adjunto la información de origen y solicito que revisen nuevamente mi perfil.']);
        $response->assertCreated()->assertJsonPath('data.status', 'pending');
        $appealId = $response->json('data.id');
        $this->postJson('/api/me/appeals', ['reason' => 'Solicito revisar de nuevo esta suspensión con datos adicionales.'])->assertStatus(409);
        $this->assertDatabaseHas('producer_appeals', ['id' => $appealId, 'producer_profile_id' => $profile->id, 'submitted_by' => $producer->id, 'status' => 'pending']);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $producer->id, 'resource_type' => 'producer_appeal', 'resource_id' => $appealId, 'action' => 'producer.appeal_submitted']);

        $other = User::factory()->create();
        $other->producerProfile()->create(['slug' => 'otra-apelacion', 'public_name' => 'Otra finca', 'phone_private' => '+50760009922', 'profile_status' => 'suspended']);
        $this->actingAs($other)->getJson('/api/me/appeals')->assertOk()->assertJsonCount(0, 'data.appeals');
    }

    public function test_only_mfa_appeal_moderators_can_resolve_appeals_and_reinstatement_is_audited(): void
    {
        $profile = ProducerProfile::factory()->create(['profile_status' => 'suspended', 'suspension_reason' => 'El perfil requiere revisión de identidad.']);
        $appeal = ProducerAppeal::query()->create(['producer_profile_id' => $profile->id, 'submitted_by' => $profile->user_id, 'reason' => 'Presento información adicional para solicitar una revisión humana.', 'status' => 'pending', 'submitted_at' => now()]);
        $unprivileged = User::factory()->create();
        $this->actingAs($unprivileged)->getJson('/api/admin/producer-appeals')->assertForbidden();

        $moderator = User::factory()->create();
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);
        $this->confirmMfa($moderator);
        $this->actingAs($moderator)->getJson('/api/admin/producer-appeals')->assertOk()->assertJsonPath('data.0.id', $appeal->id);
        $this->putJson('/api/admin/producer-appeals/'.$appeal->id, ['decision' => 'reinstated', 'resolution_note' => 'Verificamos los documentos presentados y retiramos la suspensión.'])
            ->assertOk()->assertJsonPath('data.status', 'reinstated')->assertJsonPath('data.producer_profile_status', 'active');
        $this->assertDatabaseHas('producer_profiles', ['id' => $profile->id, 'profile_status' => 'active', 'suspension_reason' => null]);
        $this->assertDatabaseHas('producer_appeals', ['id' => $appeal->id, 'reviewed_by' => $moderator->id, 'status' => 'reinstated']);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $moderator->id, 'resource_type' => 'producer_appeal', 'resource_id' => $appeal->id, 'action' => 'producer.appeal_decided']);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $moderator->id, 'resource_type' => 'producer_profile', 'resource_id' => $profile->id, 'action' => 'producer.status_changed']);
        $this->putJson('/api/admin/producer-appeals/'.$appeal->id, ['decision' => 'upheld', 'resolution_note' => 'Decisión repetida sobre una apelación ya cerrada.'])->assertStatus(409);
    }

    public function test_reapproval_after_profile_reinstatement_does_not_revive_an_expired_listing(): void
    {
        config(['marketplace.listing_ttl_days' => 30]);
        Storage::fake('local');
        $producer = User::factory()->create();
        $profile = $producer->producerProfile()->create([
            'slug' => 'reinstated-expired-listing', 'public_name' => 'Finca reactivada',
            'phone_private' => '+50760009923', 'phone_public' => '+50760009923',
            'phone_verified_at' => now(), 'profile_status' => 'suspended',
            'suspension_reason' => 'Confirma la disponibilidad de la oferta.',
        ]);
        $publishedAt = now()->subDays(31)->startOfSecond();
        $product = Product::factory()->create([
            'producer_profile_id' => $profile->id,
            'status' => ProductStatus::Published,
            'published_at' => $publishedAt,
        ]);
        $this->attachAvailablePhoto($product);
        $appeal = ProducerAppeal::query()->create([
            'producer_profile_id' => $profile->id,
            'submitted_by' => $producer->id,
            'reason' => 'La disponibilidad fue revisada y solicito una nueva evaluación.',
            'status' => 'pending',
            'submitted_at' => now(),
        ]);
        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);

        $this->actingAs($moderator)->putJson('/api/admin/producer-appeals/'.$appeal->id, [
            'decision' => 'reinstated',
            'resolution_note' => 'Verificamos la información y restablecemos el perfil.',
        ])->assertOk()->assertJsonPath('data.products_queued_for_review', 1);
        $this->assertSame(ProductStatus::Pending, $product->fresh()->status);
        $this->assertSame($publishedAt->timestamp, $product->fresh()->published_at->timestamp);
        $this->getJson('/api/products/'.$product->slug)->assertNotFound();

        $this->actingAs($moderator)->postJson('/api/admin/products/'.$product->id.'/approve', [
            'reason' => 'La oferta fue revisada después de reactivar el perfil.',
        ])->assertOk()->assertJsonPath('data.status', 'published');
        $this->assertSame($publishedAt->timestamp, $product->fresh()->published_at->timestamp);
        $this->getJson('/api/products/'.$product->slug)->assertNotFound();

        $this->actingAs($producer)->postJson('/api/me/products/'.$product->id.'/renew')->assertOk();
        $this->getJson('/api/products/'.$product->slug)->assertOk()->assertJsonPath('data.id', $product->id);
    }

    public function test_admin_suspension_reason_is_saved_for_the_producer_appeal_channel(): void
    {
        $operator = User::factory()->create();
        $operator->roles()->attach(Role::where('name', 'super_admin')->firstOrFail()->id);
        $this->confirmMfa($operator);
        $profile = ProducerProfile::factory()->create(['profile_status' => 'active', 'suspension_reason' => null]);

        $this->actingAs($operator)->putJson('/api/admin/producers/'.$profile->id.'/status', ['profile_status' => 'suspended', 'reason' => 'Confirma el origen de los productos antes de reactivar el perfil.'])
            ->assertOk()->assertJsonPath('data.profile_status', 'suspended');
        $this->assertDatabaseHas('producer_profiles', ['id' => $profile->id, 'suspension_reason' => 'Confirma el origen de los productos antes de reactivar el perfil.']);

        $this->putJson('/api/admin/producers/'.$profile->id.'/status', ['profile_status' => 'active', 'reason' => 'Se completó la revisión y se retiró la restricción.'])->assertOk();
        $this->assertDatabaseHas('producer_profiles', ['id' => $profile->id, 'profile_status' => 'active', 'suspension_reason' => null]);
    }

    public function test_manual_suspension_and_reactivation_hide_then_queue_published_offers_once(): void
    {
        Storage::fake('local');
        $profile = ProducerProfile::factory()->create([
            'profile_status' => 'active', 'phone_verified_at' => now(),
            'phone_public' => '+50760009924', 'suspension_reason' => null,
        ]);
        $published = Product::factory()->create([
            'producer_profile_id' => $profile->id, 'status' => ProductStatus::Published,
            'published_at' => now()->subDay(),
        ]);
        $this->attachAvailablePhoto($published);
        $operator = $this->confirmMfa(User::factory()->create());
        $operator->roles()->attach(Role::where('name', 'super_admin')->firstOrFail()->id);

        $this->actingAs($operator)->putJson('/api/admin/producers/'.$profile->id.'/status', [
            'profile_status' => 'suspended',
            'reason' => 'Revisar manualmente la información del perfil.',
        ])->assertOk()->assertJsonPath('data.profile_status', 'suspended');
        $this->getJson('/api/products/'.$published->slug)->assertNotFound();

        $this->putJson('/api/admin/producers/'.$profile->id.'/status', [
            'profile_status' => 'active',
            'reason' => 'Concluyó la revisión manual del perfil.',
        ])->assertOk()->assertJsonPath('data.profile_status', 'active')->assertJsonPath('data.products_queued_for_review', 1);
        $this->assertSame(ProductStatus::Pending, $published->fresh()->status);
        $this->getJson('/api/products/'.$published->slug)->assertNotFound();
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $operator->id, 'action' => 'product.queued_after_producer_reinstatement',
            'resource_type' => 'product', 'resource_id' => $published->id,
        ]);

        $this->putJson('/api/admin/producers/'.$profile->id.'/status', [
            'profile_status' => 'active',
            'reason' => 'Intento repetido de reactivar el perfil.',
        ])->assertStatus(409);
        $this->assertDatabaseCount('product_status_history', 1);
        $this->assertDatabaseCount('audit_logs', 3);
    }

    public function test_only_super_admin_can_assign_critical_roles_and_role_changes_are_audited(): void
    {
        $admin = User::factory()->create();
        $admin->roles()->attach(Role::where('name', 'admin')->firstOrFail()->id);
        $this->confirmMfa($admin);
        $target = User::factory()->create();
        $this->actingAs($admin)->putJson("/api/admin/users/{$target->id}/roles", ['roles' => ['moderator'], 'reason' => 'Asigna tarea de moderación.'])->assertOk()->assertJsonPath('data.roles.0', 'moderator');
        $this->actingAs($admin)->putJson("/api/admin/users/{$target->id}/roles", ['roles' => ['admin'], 'reason' => 'Prueba de asignación crítica.'])->assertForbidden();

        $super = User::factory()->create();
        $super->roles()->attach(Role::where('name', 'super_admin')->firstOrFail()->id);
        $this->confirmMfa($super);
        $this->actingAs($super)->putJson("/api/admin/users/{$target->id}/roles", ['roles' => ['moderator'], 'reason' => 'Asigna tarea de moderación.'])->assertOk()->assertJsonPath('data.roles.0', 'moderator');
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $super->id, 'action' => 'admin.user_roles_changed', 'resource_type' => 'user', 'resource_id' => $target->id]);
        $this->actingAs($admin)->putJson("/api/admin/users/{$target->id}/roles", ['roles' => ['super_admin'], 'reason' => 'Prueba de escalamiento.'])->assertForbidden();
        $this->actingAs($super)->putJson("/api/admin/users/{$super->id}/roles", ['roles' => ['admin'], 'reason' => 'Intento de quitar el último superadministrador.'])->assertUnprocessable();
    }

    public function test_internal_staff_login_requires_totp_and_mfa_setup_is_confirmed(): void
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::where('name', 'super_admin')->firstOrFail()->id);
        $user->forceFill(['two_factor_secret' => 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 'two_factor_confirmed_at' => now()])->save();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertAccepted()->assertJsonPath('mfa_required', true);
        $totp = app(Totp::class);
        $code = $totp->code($user->two_factor_secret, intdiv(now()->timestamp, 30));
        $this->postJson('/api/auth/mfa/challenge', ['code' => $code])->assertOk()->assertJsonPath('data.authenticated', true);
        $this->assertAuthenticatedAs($user);

        $user->forceFill(['two_factor_secret' => null, 'two_factor_confirmed_at' => null])->save();
        $this->actingAs($user->fresh());
        $this->getJson('/api/admin/metrics')->assertStatus(428);
        $setup = $this->actingAs($user)->getJson('/api/auth/mfa/setup')->assertOk()->assertJsonPath('data.enabled', false)->json('data');
        $setupCode = $totp->code($setup['secret'], intdiv(now()->timestamp, 30));
        $this->postJson('/api/auth/mfa/confirm', ['code' => $setupCode])->assertOk()->assertJsonPath('data.enabled', true);
        $this->assertNotNull($user->fresh()->two_factor_confirmed_at);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'action' => 'admin.mfa_enabled']);
    }

    public function test_changing_the_producer_phone_invalidates_the_previous_verification(): void
    {
        $profile = ProducerProfile::factory()->create(['phone_verified_at' => now(), 'contact_level' => 'contact_confirmed']);
        $profile->changePhone('+50769998877');

        $this->assertSame('+50769998877', $profile->fresh()->phone_private);
        $this->assertNull($profile->fresh()->phone_verified_at);
        $this->assertSame('unverified', $profile->fresh()->contact_level);
    }

    public function test_producer_profile_phone_change_hides_old_number_and_expires_pending_verification(): void
    {
        $user = User::factory()->create();
        $profile = $user->producerProfile()->create(['slug' => 'profile-phone-change', 'public_name' => 'Finca Teléfono', 'phone_private' => '+50760001234', 'phone_public' => '+50760001234', 'phone_verified_at' => now(), 'contact_level' => 'contact_confirmed']);
        $verification = $profile->verifications()->create(['channel' => 'sms', 'status' => 'pending', 'code_hash' => app(ContactVerificationSender::class)->hashCode('123456'), 'expires_at' => now()->addMinutes(10)]);
        $response = $this->actingAs($user)->putJson('/api/me/profile', ['public_name' => $profile->public_name, 'activity' => 'Cultivo', 'description' => 'Finca familiar.', 'location_id' => null, 'phone_private' => '+50760009999'])->assertOk();
        $profile->refresh();
        $this->assertSame('+50760009999', $profile->phone_private);
        $this->assertNull($profile->phone_verified_at);
        $this->assertNull($profile->phone_public);
        $this->assertSame('unverified', $profile->contact_level);
        $this->assertSame('expired', $verification->fresh()->status);
        $this->assertNull($verification->fresh()->code_hash);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $user->id, 'action' => 'producer.profile_updated', 'resource_id' => $profile->id]);
        $this->getJson('/api/producers/'.$profile->slug)->assertNotFound();
    }

    public function test_fake_phone_verification_succeeds_only_for_configured_code_and_current_number(): void
    {
        config(['services.contact_verification.development_code' => '123456']);
        $user = User::factory()->create();
        $profile = $user->producerProfile()->create(['slug' => 'verification-profile', 'public_name' => 'Finca Verificada', 'phone_private' => '+50760001234']);
        $verification = $profile->verifications()->create(['channel' => 'sms', 'status' => 'pending', 'code_hash' => app(ContactVerificationSender::class)->hashCode('123456'), 'expires_at' => now()->addMinutes(10)]);
        $response = $this->actingAs($user)->postJson('/api/auth/verify', ['phone' => '+50760001234', 'code' => '123456']);
        $response->assertOk()->assertJsonPath('data.contact_level', 'contact_confirmed');
        $this->assertSame('verified', $verification->fresh()->status);
        $this->assertNull($verification->fresh()->code_hash);
        $this->assertDatabaseHas('verification_attempts', ['producer_verification_id' => $verification->id, 'result' => 'success']);
    }

    public function test_verification_start_rotates_pending_code_and_locks_after_five_failures(): void
    {
        config(['services.contact_verification.development_code' => '123456']);
        $user = User::factory()->create();
        $profile = $user->producerProfile()->create(['slug' => 'verification-rotate', 'public_name' => 'Finca Verificación', 'phone_private' => '+50760001235']);
        $old = $profile->verifications()->create(['channel' => 'sms', 'status' => 'pending', 'expires_at' => now()->addMinutes(10)]);
        $this->actingAs($user)->postJson('/api/me/verify-phone/start')->assertAccepted();
        $this->assertSame('expired', $old->fresh()->status);
        for ($attempt = 0; $attempt < 4; $attempt++) {
            $this->actingAs($user)->postJson('/api/me/verify-phone', ['phone' => '+50760001235', 'code' => '000000'])->assertUnprocessable();
        }
        $response = $this->actingAs($user)->postJson('/api/me/verify-phone', ['phone' => '+50760001235', 'code' => '000000']);
        $response->assertStatus(429);
        $lockedVerification = $profile->verifications()->orderByDesc('id')->firstOrFail();
        $this->assertSame('locked', $lockedVerification->status);
        $this->assertNull($lockedVerification->code_hash);
    }

    public function test_phone_verification_sends_a_hashed_one_time_code_through_configured_provider(): void
    {
        config(['services.contact_verification.driver' => 'twilio', 'services.contact_verification.account_sid' => 'AC123', 'services.contact_verification.auth_token' => 'secret-token', 'services.contact_verification.from' => '+15005550006']);
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM123'], 201)]);
        $user = User::factory()->create();
        $profile = $user->producerProfile()->create(['slug' => 'verification-sms', 'public_name' => 'Finca SMS', 'phone_private' => '+50760001236']);

        $response = $this->actingAs($user)->postJson('/api/me/verify-phone/start')->assertAccepted();
        $verification = $profile->verifications()->latest()->firstOrFail();
        $this->assertNotNull($verification->code_hash);
        $this->assertArrayNotHasKey('development_code', $response->json('data'));
        Http::assertSent(fn ($request) => str_contains($request->url(), 'api.twilio.com') && $request['To'] === '+50760001236' && preg_match('/\b\d{6}\b/', $request['Body']) === 1);
    }

    public function test_phone_verification_delivery_failure_expires_challenge_without_exposing_code(): void
    {
        config(['services.contact_verification.driver' => 'twilio', 'services.contact_verification.account_sid' => 'AC123', 'services.contact_verification.auth_token' => 'secret-token', 'services.contact_verification.from' => '+15005550006']);
        Http::fake(['api.twilio.com/*' => Http::response(['message' => 'unavailable'], 503)]);
        $user = User::factory()->create();
        $profile = $user->producerProfile()->create(['slug' => 'verification-sms-fail', 'public_name' => 'Finca Sin SMS', 'phone_private' => '+50760001237']);

        $response = $this->actingAs($user)->postJson('/api/me/verify-phone/start')->assertStatus(503);
        $this->assertStringNotContainsString('development_code', $response->getContent());
        $this->assertSame('delivery_failed', $profile->verifications()->latest()->value('status'));
        $this->assertNull($profile->verifications()->latest()->value('code_hash'));
    }

    public function test_fake_phone_verification_provider_is_rejected_in_production(): void
    {
        app()->detectEnvironment(fn () => 'production');
        config(['services.contact_verification.driver' => 'fake', 'services.contact_verification.development_code' => '123456']);
        $user = User::factory()->create();
        $profile = $user->producerProfile()->create(['slug' => 'verification-no-fake-prod', 'public_name' => 'Finca Producción', 'phone_private' => '+50760001238']);

        $response = $this->withSession(['_token' => 'production-test-csrf-token'])
            ->withHeader('X-CSRF-TOKEN', 'production-test-csrf-token')
            ->actingAs($user)
            ->postJson('/api/me/verify-phone/start')->assertStatus(503);
        $this->assertStringNotContainsString('123456', $response->getContent());
        $this->assertSame('delivery_failed', $profile->verifications()->latest()->value('status'));
    }

    public function test_an_invalid_product_transition_is_rejected_without_changing_status(): void
    {
        $product = Product::factory()->create(['status' => ProductStatus::Draft]);

        try {
            app(ProductWorkflow::class)->transition($product, 'published', $product->created_by);
            $this->fail('An unreviewed product cannot transition directly to published.');
        } catch (ValidationException) {
            $this->assertSame(ProductStatus::Draft, $product->fresh()->status);
            $this->assertDatabaseCount('audit_logs', 0);
        }
    }

    public function test_a_moderator_decision_requires_permission_and_a_reason_and_is_audited(): void
    {
        $moderator = User::factory()->create();
        $moderatorRole = Role::where('name', 'moderator')->firstOrFail();
        $moderatorRole->permissions()->syncWithoutDetaching([Permission::where('name', 'products.review')->value('id')]);
        $moderator->roles()->attach($moderatorRole->id);
        $this->confirmMfa($moderator);
        Storage::fake('local');
        $profile = ProducerProfile::factory()->create(['profile_status' => 'active', 'phone_verified_at' => now(), 'phone_public' => '+50760000000']);
        $product = Product::factory()->create(['status' => ProductStatus::Pending, 'producer_profile_id' => $profile->id]);
        $this->attachAvailablePhoto($product);

        $this->actingAs($moderator)->postJson("/api/admin/products/{$product->id}/approve", ['reason' => 'Revisado conforme al protocolo'])
            ->assertOk()->assertJsonPath('data.status', 'published');
        $this->assertDatabaseHas('audit_logs', ['resource_type' => 'product', 'resource_id' => $product->id, 'action' => 'product.status_changed']);
        $this->assertDatabaseHas('product_status_history', ['product_id' => $product->id, 'from_status' => 'pending', 'to_status' => 'published']);
    }

    public function test_bulk_moderation_applies_valid_selected_decisions_and_reports_stale_items_individually(): void
    {
        $moderator = User::factory()->create();
        $moderatorRole = Role::where('name', 'moderator')->firstOrFail();
        $moderatorRole->permissions()->syncWithoutDetaching([Permission::where('name', 'products.review')->value('id')]);
        $moderator->roles()->attach($moderatorRole->id);
        $this->confirmMfa($moderator);
        $first = Product::factory()->create(['status' => ProductStatus::Pending]);
        $stale = Product::factory()->create(['status' => ProductStatus::Rejected]);
        $second = Product::factory()->create(['status' => ProductStatus::Pending]);

        $response = $this->actingAs($moderator)->postJson('/api/admin/products/bulk-decision', [
            'ids' => [$first->id, $stale->id, 999999, $second->id],
            'decision' => 'request_changes',
            'reason' => 'Aclara la unidad y disponibilidad antes de publicar.',
        ])->assertOk();

        $response->assertJsonPath('data.processed.0.id', $first->id)
            ->assertJsonPath('data.processed.0.status', 'changes_requested')
            ->assertJsonPath('data.processed.1.id', $second->id)
            ->assertJsonPath('data.processed.1.status', 'changes_requested')
            ->assertJsonCount(2, 'data.processed')
            ->assertJsonCount(2, 'data.failed')
            ->assertJsonPath('data.failed.0.id', $stale->id)
            ->assertJsonPath('data.failed.1.id', 999999);

        $this->assertSame(ProductStatus::ChangesRequested, $first->fresh()->status);
        $this->assertSame(ProductStatus::Rejected, $stale->fresh()->status);
        $this->assertSame(ProductStatus::ChangesRequested, $second->fresh()->status);
        $this->assertDatabaseHas('product_status_history', ['product_id' => $first->id, 'actor_id' => $moderator->id, 'reason' => 'Aclara la unidad y disponibilidad antes de publicar.']);
        $this->assertDatabaseHas('audit_logs', ['resource_type' => 'product', 'resource_id' => $second->id, 'actor_id' => $moderator->id, 'reason' => 'Aclara la unidad y disponibilidad antes de publicar.']);
    }

    public function test_bulk_moderation_requires_internal_mfa_review_permission_and_a_valid_batch(): void
    {
        $payload = ['ids' => [1], 'decision' => 'reject', 'reason' => 'Oferta no cumple la política de publicación.'];
        $this->postJson('/api/admin/products/bulk-decision', $payload)->assertUnauthorized();

        $staff = User::factory()->create();
        $staff->roles()->attach(Role::where('name', 'support_operator')->firstOrFail()->id);
        $this->actingAs($staff)->postJson('/api/admin/products/bulk-decision', $payload)->assertStatus(428);
        $this->confirmMfa($staff);
        $this->postJson('/api/admin/products/bulk-decision', $payload)->assertForbidden();

        $moderator = User::factory()->create();
        $moderatorRole = Role::where('name', 'moderator')->firstOrFail();
        $moderatorRole->permissions()->syncWithoutDetaching([Permission::where('name', 'products.review')->value('id')]);
        $moderator->roles()->attach($moderatorRole->id);
        $this->confirmMfa($moderator);
        $this->actingAs($moderator)
            ->postJson('/api/admin/products/bulk-decision', [...$payload, 'ids' => range(1, 21)])
            ->assertUnprocessable();
        $this->postJson('/api/admin/products/bulk-decision', [...$payload, 'ids' => [1, 1]])->assertUnprocessable();
        $this->postJson('/api/admin/products/bulk-decision', ['ids' => [1], 'decision' => 'reject', 'reason' => '    '])->assertUnprocessable();
    }

    public function test_producer_can_read_the_moderator_feedback_for_own_returned_product(): void
    {
        $owner = User::factory()->create();
        $profile = $owner->producerProfile()->create(['slug' => 'feedback-owner', 'public_name' => 'Productor con comentarios', 'phone_private' => '+50760000041', 'profile_status' => 'active']);
        $product = Product::factory()->create(['producer_profile_id' => $profile->id, 'created_by' => $owner->id, 'status' => ProductStatus::Pending]);
        $moderator = User::factory()->create();
        $moderatorRole = Role::where('name', 'moderator')->firstOrFail();
        $moderatorRole->permissions()->syncWithoutDetaching([Permission::where('name', 'products.review')->value('id')]);
        $moderator->roles()->attach($moderatorRole->id);
        $this->confirmMfa($moderator);

        $this->actingAs($moderator)->postJson("/api/admin/products/{$product->id}/decision", ['decision' => 'request_changes', 'reason' => 'Agrega el peso aproximado por unidad antes de publicar.'])->assertOk()
            ->assertJsonPath('data.status', 'changes_requested');

        $this->actingAs($owner)->getJson('/api/me/products')->assertOk()
            ->assertJsonPath('data.0.latest_moderation_decision.to_status', 'changes_requested')
            ->assertJsonPath('data.0.latest_moderation_decision.reason', 'Agrega el peso aproximado por unidad antes de publicar.')
            ->assertJsonMissingPath('data.0.latest_moderation_decision.actor_id');

        $other = User::factory()->create();
        $this->actingAs($other)->getJson('/api/me/products')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_rejected_product_can_be_corrected_and_resubmitted_with_history_preserved(): void
    {
        $owner = User::factory()->create();
        $profile = $owner->producerProfile()->create(['slug' => 'rejected-owner', 'public_name' => 'Productor rechazado', 'phone_private' => '+50760000042', 'profile_status' => 'active']);
        $product = Product::factory()->create(['producer_profile_id' => $profile->id, 'created_by' => $owner->id, 'status' => ProductStatus::Pending]);
        Storage::fake('local');
        $this->attachAvailablePhoto($product);
        $moderator = User::factory()->create();
        $moderatorRole = Role::where('name', 'moderator')->firstOrFail();
        $moderatorRole->permissions()->syncWithoutDetaching([Permission::where('name', 'products.review')->value('id')]);
        $moderator->roles()->attach($moderatorRole->id);
        $this->confirmMfa($moderator);

        $this->actingAs($moderator)->postJson("/api/admin/products/{$product->id}/decision", ['decision' => 'reject', 'reason' => 'Aclara el origen y la unidad de venta del producto.'])->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        $this->actingAs($owner)->getJson('/api/me/products')->assertOk()
            ->assertJsonPath('data.0.latest_moderation_decision.reason', 'Aclara el origen y la unidad de venta del producto.');
        $this->actingAs($owner)->patchJson('/api/me/products/'.$product->id, [
            'title' => 'Yuca fresca del productor', 'category_id' => $product->category_id,
            'description' => 'Yuca cultivada en la finca familiar de Las Tablas y cosechada esta semana.',
            'unit' => 'libra', 'price_type' => 'from', 'price_amount' => '2.50', 'currency' => 'USD', 'stock_quantity' => '12.5', 'delivery_method' => 'Recogida en punto acordado',
        ])->assertOk();
        $this->assertSame(ProductStatus::Rejected, $product->fresh()->status);
        $this->assertDatabaseHas('products', ['id' => $product->id, 'currency' => 'USD', 'price_amount' => '2.50', 'stock_quantity' => '12.50']);
        $this->actingAs($owner)->postJson('/api/me/products/'.$product->id.'/submit', ['reason' => 'Corregí el origen y aclaré la unidad de venta.'])->assertAccepted()
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('product_status_history', ['product_id' => $product->id, 'from_status' => 'pending', 'to_status' => 'rejected', 'reason' => 'Aclara el origen y la unidad de venta del producto.']);
        $this->assertDatabaseHas('product_status_history', ['product_id' => $product->id, 'from_status' => 'rejected', 'to_status' => 'pending', 'reason' => 'Corregí el origen y aclaré la unidad de venta.']);
    }

    public function test_public_product_index_and_detail_only_expose_published_offers(): void
    {
        $published = $this->publicProduct();
        Product::factory()->create(['status' => ProductStatus::Draft]);
        Product::factory()->create(['status' => ProductStatus::Suspended]);
        $soldOut = Product::factory()->create(['status' => ProductStatus::SoldOut, 'published_at' => now()]);
        $zeroStock = Product::factory()->create(['status' => ProductStatus::Published, 'published_at' => now(), 'stock_quantity' => 0]);

        $this->getJson('/api/products')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $published->id);
        $this->getJson("/api/products/{$published->slug}")->assertOk()->assertJsonPath('data.id', $published->id);
        $this->getJson("/api/products/{$soldOut->slug}")->assertNotFound();
        $this->getJson("/api/products/{$zeroStock->slug}")->assertNotFound();
        $this->getJson('/api/products?per_page=80')->assertUnprocessable();
    }

    public function test_public_catalog_sort_modes_are_stable_and_relevance_prefers_title_matches(): void
    {
        $olderTitleMatch = $this->publicProduct([
            'slug' => 'older-tomate-title',
            'title' => 'Tomate de temporada',
            'description' => 'Cosecha familiar',
            'published_at' => now()->subDay(),
        ]);
        $newerDescriptionMatch = $this->publicProduct([
            'slug' => 'newer-tomate-description',
            'title' => 'Yuca fresca',
            'description' => 'Tomate disponible como referencia',
            'published_at' => now(),
        ]);
        $sameTimeEarlierId = $this->publicProduct([
            'slug' => 'same-time-earlier-id',
            'title' => 'Ají dulce',
            'published_at' => now()->subHours(2),
        ]);
        $sameTimeLaterId = $this->publicProduct([
            'slug' => 'same-time-later-id',
            'title' => 'Maíz nuevo',
            'published_at' => $sameTimeEarlierId->published_at,
        ]);

        $this->getJson('/api/products?q=tomate&sort=relevance')
            ->assertOk()
            ->assertJsonPath('data.0.id', $olderTitleMatch->id)
            ->assertJsonPath('data.1.id', $newerDescriptionMatch->id);

        $this->getJson('/api/products?sort=newest')
            ->assertOk()
            ->assertJsonPath('data.0.id', $newerDescriptionMatch->id)
            ->assertJsonPath('data.1.id', $sameTimeLaterId->id)
            ->assertJsonPath('data.2.id', $sameTimeEarlierId->id);

        $this->getJson('/api/products?sort=unknown')->assertUnprocessable();
    }

    public function test_expired_publications_are_hidden_and_the_owner_can_auditably_renew_them(): void
    {
        config(['marketplace.listing_ttl_days' => 30]);
        $owner = User::factory()->create();
        $profile = $owner->producerProfile()->create([
            'slug' => 'finca-vigencia', 'public_name' => 'Finca vigencia',
            'phone_private' => '+50760008881', 'phone_public' => '+50760008881', 'phone_verified_at' => now(), 'profile_status' => 'active',
        ]);
        $expired = Product::factory()->create([
            'producer_profile_id' => $profile->id, 'status' => ProductStatus::Published,
            'published_at' => now()->subDays(31),
        ]);
        $current = Product::factory()->create([
            'producer_profile_id' => $profile->id, 'status' => ProductStatus::Published,
            'published_at' => now()->subDays(29),
        ]);
        $otherExpired = $this->publicProduct(['published_at' => now()->subDays(31)]);

        $this->getJson('/api/products')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.slug', $current->slug);
        $this->getJson('/api/products/'.$expired->slug)->assertNotFound();
        $this->postJson('/api/contact-events', ['product_id' => $expired->id, 'channel' => 'whatsapp'])->assertNotFound();
        $this->postJson('/api/reports', [
            'resource_type' => 'product', 'resource_id' => $expired->id,
            'reason_code' => 'unavailable', 'description' => 'Esta oferta ya venció.',
        ])->assertNotFound();
        $this->getJson('/api/producers/'.$profile->slug)->assertOk()
            ->assertJsonCount(1, 'data.products')->assertJsonPath('data.products.0.slug', $current->slug);
        $this->get('/sitemap.xml')->assertOk()->assertDontSee($expired->slug, false);

        $this->actingAs($owner)->getJson('/api/me/products')->assertOk()
            ->assertJsonFragment(['id' => $expired->id, 'listing_expired' => true]);
        $this->actingAs($owner)->postJson('/api/me/products/'.$expired->id.'/renew')
            ->assertOk()->assertJsonPath('data.status', 'published');

        $this->assertTrue($expired->fresh()->published_at->greaterThan(now()->subMinute()));
        $this->assertDatabaseHas('product_status_history', [
            'product_id' => $expired->id, 'from_status' => 'published', 'to_status' => 'published',
            'reason' => 'El productor renovó la vigencia de la oferta.',
        ]);
        $this->assertDatabaseHas('audit_logs', [
            'actor_id' => $owner->id, 'resource_type' => 'product', 'resource_id' => $expired->id,
            'action' => 'product.listing_renewed',
        ]);

        $this->actingAs($owner)->postJson('/api/me/products/'.$current->id.'/renew')->assertStatus(409);
        $this->actingAs($owner)->postJson('/api/me/products/'.$otherExpired->id.'/renew')->assertNotFound();
    }

    public function test_zero_listing_lifetime_disables_expiry(): void
    {
        config(['marketplace.listing_ttl_days' => 0]);
        $expiredByAge = $this->publicProduct(['published_at' => now()->subYears(2)]);

        $this->getJson('/api/products')->assertOk()->assertJsonFragment(['slug' => $expiredByAge->slug]);
    }

    public function test_every_nonavailable_lifecycle_state_is_hidden_across_catalog_detail_profile_and_sitemap(): void
    {
        config(['app.frontend_url' => 'https://mercado.example']);
        $owner = User::factory()->create();
        $profile = $owner->producerProfile()->create([
            'slug' => 'finca-ciclo-publico', 'public_name' => 'Finca ciclo público',
            'phone_private' => '+50760009991', 'phone_public' => '+50760009991', 'phone_verified_at' => now(), 'profile_status' => 'active',
        ]);
        $available = Product::factory()->create([
            'producer_profile_id' => $profile->id, 'status' => ProductStatus::Published,
            'published_at' => now(), 'stock_quantity' => null,
        ]);
        $hidden = [];
        foreach ([
            ProductStatus::Draft, ProductStatus::Pending, ProductStatus::ChangesRequested,
            ProductStatus::Paused, ProductStatus::SoldOut, ProductStatus::Rejected,
            ProductStatus::Suspended, ProductStatus::Withdrawn,
        ] as $status) {
            $hidden[] = Product::factory()->create([
                'producer_profile_id' => $profile->id, 'status' => $status,
                'published_at' => $status === ProductStatus::Suspended ? now() : null,
            ]);
        }
        $zeroStock = Product::factory()->create([
            'producer_profile_id' => $profile->id, 'status' => ProductStatus::Published,
            'published_at' => now(), 'stock_quantity' => 0,
        ]);

        $this->getJson('/api/products')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.slug', $available->slug);
        $this->getJson('/api/producers/'.$profile->slug)->assertOk()
            ->assertJsonCount(1, 'data.products')->assertJsonPath('data.products.0.slug', $available->slug);
        foreach ([...$hidden, $zeroStock] as $product) {
            $this->getJson('/api/products/'.$product->slug)->assertNotFound();
        }
        $sitemap = $this->get('/sitemap.xml')->assertOk()->assertSee($available->slug, false);
        foreach ([...$hidden, $zeroStock] as $product) {
            $sitemap->assertDontSee($product->slug, false);
        }
    }

    public function test_public_products_hide_when_producer_or_category_is_inactive(): void
    {
        $product = $this->publicProduct();
        $profile = $product->producer;
        $category = $product->category;
        $this->assertSame('active', $profile->profile_status);
        $this->getJson('/api/products')->assertJsonFragment(['slug' => $product->slug]);

        $profile->update(['profile_status' => 'suspended']);
        $this->getJson('/api/products')->assertJsonMissing(['slug' => $product->slug]);
        $this->getJson('/api/products/'.$product->slug)->assertNotFound();
        $this->getJson('/api/producers/'.$profile->slug)->assertNotFound();

        $profile->update(['profile_status' => 'active']);
        $category->update(['active' => false]);
        $this->getJson('/api/products')->assertJsonMissing(['slug' => $product->slug]);
        $this->getJson('/api/products/'.$product->slug)->assertNotFound();

        $parentCategory = Category::create(['name' => 'Raíz de prueba', 'slug' => 'raiz-de-prueba']);
        $category->update(['active' => true, 'parent_id' => $parentCategory->id]);
        $parentCategory->update(['active' => false]);
        $this->getJson('/api/products')->assertJsonMissing(['slug' => $product->slug]);
    }

    public function test_sitemap_lists_only_public_products_and_active_producer_profiles(): void
    {
        config(['app.frontend_url' => 'https://mercado.example']);
        $producerUser = User::factory()->create();
        $profile = $producerUser->producerProfile()->create(['slug' => 'huerto-de-prueba', 'public_name' => 'Huerto de prueba', 'phone_private' => '+50760000333', 'phone_public' => '+50760000333', 'phone_verified_at' => now(), 'profile_status' => 'active']);
        $published = Product::factory()->create(['producer_profile_id' => $profile->id, 'status' => ProductStatus::Published, 'published_at' => now()]);
        $draft = Product::factory()->create(['producer_profile_id' => $profile->id, 'status' => ProductStatus::Draft]);

        $sitemap = $this->get('/sitemap.xml');
        $sitemap->assertOk()->assertHeader('Content-Type', 'application/xml; charset=UTF-8')
            ->assertSee('<loc>https://mercado.example/productores</loc>', false)
            ->assertSee('https://mercado.example/productos/'.$published->slug, false)
            ->assertSee('https://mercado.example/productores/huerto-de-prueba', false)
            ->assertDontSee($draft->slug, false);
        $this->assertNotFalse(simplexml_load_string($sitemap->getContent()));
        $this->get('/robots.txt')->assertOk()->assertHeader('Content-Type', 'text/plain; charset=UTF-8')
            ->assertSee('Sitemap: https://mercado.example/sitemap.xml', false)
            ->assertSee('Disallow: /mi-panel', false);
    }

    public function test_producer_draft_accepts_valid_images_and_stays_private_until_approved(): void
    {
        if (! extension_loaded('gd')) {
            $this->markTestSkipped('La normalización de imágenes requiere GD; está instalado en la imagen Docker de PHP.');
        }
        $user = User::factory()->create();
        $user->producerProfile()->create(['slug' => 'draft-producer', 'public_name' => 'Productora Draft', 'phone_private' => '+50760000111']);
        $jpeg = base64_decode('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAgMBAQEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAgBAQABPyF//9k=', true);
        $image = new UploadedFile(base_path('tests/fixture-product.jpg'), 'yuca.jpg', 'image/jpeg', null, true);
        $response = $this->actingAs($user)->post('/api/me/products', [
            'title' => 'Yuca del patio', 'category_id' => 1, 'description' => 'Yuca fresca cosechada esta semana en el patio familiar.',
            'unit' => 'libra', 'price_type' => 'fixed', 'price_amount' => '0.75', 'currency' => 'PAB',
            'stock_quantity' => '18.5',
            'delivery_method' => 'Recogida en punto acordado', 'images' => [$image],
        ], ['Accept' => 'application/json'])->assertCreated();
        $productId = $response->json('data.id');
        $this->assertDatabaseHas('products', ['id' => $productId, 'status' => 'draft']);
        $this->assertDatabaseHas('products', ['id' => $productId, 'currency' => 'PAB', 'stock_quantity' => '18.50']);
        $this->assertDatabaseHas('product_images', ['product_id' => $productId, 'is_public' => 0]);
        $this->getJson('/api/products')->assertJsonMissingPath('data.0.id');
    }

    public function test_failed_multi_image_draft_cleans_stored_files_and_rolls_back_database_records(): void
    {
        Storage::fake('local');
        config(['filesystems.media' => 'local']);
        $user = User::factory()->create();
        $user->producerProfile()->create(['slug' => 'photo-rollback-profile', 'public_name' => 'Finca de prueba', 'phone_private' => '+50760008890']);
        $attempt = 0;
        $partialPath = null;
        $partialThumbnailPath = null;
        $optimizer = $this->mock(ProductPhotoOptimizer::class);
        $optimizer->shouldReceive('store')->twice()->andReturnUsing(function (UploadedFile $upload, string $disk, string $directory) use (&$attempt, &$partialPath, &$partialThumbnailPath): array {
            $attempt++;
            if ($attempt === 2) {
                throw new \RuntimeException('Fallo simulado al optimizar la segunda foto.');
            }

            $partialPath = $directory.'/partial.webp';
            $partialThumbnailPath = $directory.'/partial-480.webp';
            Storage::disk($disk)->put($partialPath, 'optimized-image');
            Storage::disk($disk)->put($partialThumbnailPath, 'optimized-thumbnail');

            return ['path' => $partialPath, 'thumbnail_path' => $partialThumbnailPath];
        });
        $firstPhoto = new UploadedFile(base_path('tests/fixture-product.jpg'), 'yuca.jpg', 'image/jpeg', null, true);
        $secondPhoto = new UploadedFile(base_path('tests/fixture-product.jpg'), 'maiz.jpg', 'image/jpeg', null, true);

        $this->actingAs($user)->post('/api/me/products', [
            'title' => 'Productos de la finca', 'category_id' => Category::query()->where('active', true)->valueOrFail('id'),
            'description' => 'Productos frescos cosechados esta semana en la finca familiar.',
            'unit' => 'libra', 'price_type' => 'contact', 'currency' => 'PAB',
            'delivery_method' => 'Recogida en punto acordado', 'images' => [$firstPhoto, $secondPhoto],
        ], ['Accept' => 'application/json'])->assertStatus(500);

        $this->assertDatabaseCount('products', 0);
        $this->assertDatabaseCount('product_images', 0);
        $this->assertNotNull($partialPath);
        $this->assertNotNull($partialThumbnailPath);
        Storage::disk('local')->assertMissing($partialPath);
        Storage::disk('local')->assertMissing($partialThumbnailPath);
    }

    public function test_product_images_use_the_configured_media_disk(): void
    {
        if (! extension_loaded('gd')) {
            $this->markTestSkipped('La normalización de imágenes requiere GD; está instalado en la imagen Docker de PHP.');
        }
        Storage::fake('media-test');
        config(['filesystems.media' => 'media-test']);
        $user = User::factory()->create();
        $user->producerProfile()->create(['slug' => 'media-producer', 'public_name' => 'Productora Media', 'phone_private' => '+50760000112']);
        $image = new UploadedFile(base_path('tests/fixture-product.jpg'), 'yuca.jpg', 'image/jpeg', null, true);

        $response = $this->actingAs($user)->post('/api/me/products', [
            'title' => 'Yuca media alterna', 'category_id' => 1, 'description' => 'Yuca fresca cosechada esta semana en el patio familiar.',
            'unit' => 'libra', 'price_type' => 'fixed', 'price_amount' => '0.75', 'currency' => 'PAB',
            'delivery_method' => 'Recogida en punto acordado', 'images' => [$image],
        ], ['Accept' => 'application/json'])->assertCreated();
        $storedImage = Product::findOrFail($response->json('data.id'))->images()->firstOrFail();

        $this->assertSame('media-test', $storedImage->disk);
        Storage::disk('media-test')->assertExists($storedImage->path);
        Storage::disk('local')->assertMissing($storedImage->path);
    }

    public function test_uploaded_product_photos_are_normalized_to_webp(): void
    {
        if (! extension_loaded('gd')) {
            $this->markTestSkipped('La normalización de imágenes requiere GD; está instalado en la imagen Docker de PHP.');
        }
        Storage::fake('media-test');
        config(['filesystems.media' => 'media-test']);
        $user = User::factory()->create();
        $user->producerProfile()->create(['slug' => 'optimized-producer', 'public_name' => 'Productora Optimizada', 'phone_private' => '+50760000113']);
        $original = imagecreatetruecolor(2000, 1000);
        $temporaryImage = tempnam(sys_get_temp_dir(), 'marketplace-photo-');
        imagejpeg($original, $temporaryImage, 90);
        imagedestroy($original);
        $image = new UploadedFile($temporaryImage, 'yuca.jpg', 'image/jpeg', null, true);

        $response = $this->actingAs($user)->post('/api/me/products', [
            'title' => 'Yuca optimizada', 'category_id' => 1, 'description' => 'Yuca fresca cosechada esta semana en el patio familiar.',
            'unit' => 'libra', 'price_type' => 'fixed', 'price_amount' => '0.75', 'currency' => 'PAB',
            'delivery_method' => 'Recogida en punto acordado', 'images' => [$image],
        ], ['Accept' => 'application/json'])->assertCreated();
        $storedImage = Product::findOrFail($response->json('data.id'))->images()->firstOrFail();
        $storedBytes = Storage::disk('media-test')->get($storedImage->path);
        $metadata = getimagesizefromstring($storedBytes);
        $thumbnailBytes = Storage::disk('media-test')->get($storedImage->thumbnail_path);
        $thumbnailMetadata = getimagesizefromstring($thumbnailBytes);

        $this->assertSame('image/webp', $metadata['mime']);
        $this->assertSame([1600, 800], [$metadata[0], $metadata[1]]);
        $this->assertSame('image/webp', $thumbnailMetadata['mime']);
        $this->assertSame([480, 240], [$thumbnailMetadata[0], $thumbnailMetadata[1]]);
        $this->assertLessThan(filesize($temporaryImage), strlen($storedBytes));
        $this->assertStringEndsWith('.webp', $storedImage->path);
        $this->assertStringEndsWith('.webp', $storedImage->thumbnail_path);
        @unlink($temporaryImage);
    }

    public function test_public_catalog_delivers_a_compact_thumbnail_through_the_same_visibility_gate(): void
    {
        Storage::fake('local');
        $product = $this->publicProduct();
        $originalPath = "products/{$product->id}/original.webp";
        $thumbnailPath = "products/{$product->id}/thumbnail.webp";
        Storage::disk('local')->put($originalPath, 'original-photo');
        Storage::disk('local')->put($thumbnailPath, 'compact-photo');
        $image = $product->images()->create([
            'disk' => 'local', 'path' => $originalPath, 'thumbnail_path' => $thumbnailPath,
            'alt_text' => 'Oferta local', 'position' => 0, 'is_public' => true,
        ]);

        $catalogImage = $this->getJson('/api/products')->assertOk()->json('data.0.images.0');
        $this->assertSame(url("/api/products/{$product->slug}/images/{$image->id}"), $catalogImage['url']);
        $this->assertSame(url("/api/products/{$product->slug}/images/{$image->id}?variant=thumbnail"), $catalogImage['thumbnail_url']);
        $this->assertArrayNotHasKey('thumbnail_path', $catalogImage);
        $thumbnailResponse = $this->get("/api/products/{$product->slug}/images/{$image->id}?variant=thumbnail")
            ->assertOk()->assertHeader('Cache-Control', 'max-age=86400, public');
        $this->assertSame('compact-photo', $thumbnailResponse->streamedContent());

        $pending = Product::factory()->create(['status' => ProductStatus::Pending]);
        $pendingThumbnail = "products/{$pending->id}/private-thumbnail.webp";
        Storage::disk('local')->put($pendingThumbnail, 'private-photo');
        $privateImage = $pending->images()->create([
            'disk' => 'local', 'path' => "products/{$pending->id}/private-original.webp", 'thumbnail_path' => $pendingThumbnail,
            'alt_text' => 'Revisión', 'position' => 0, 'is_public' => false,
        ]);
        $this->getJson("/api/products/{$pending->slug}/images/{$privateImage->id}?variant=thumbnail")->assertNotFound();

        $hiddenImageProduct = $this->publicProduct();
        $hiddenImage = $hiddenImageProduct->images()->create([
            'disk' => 'local', 'path' => "products/{$hiddenImageProduct->id}/hidden-original.webp",
            'thumbnail_path' => "products/{$hiddenImageProduct->id}/hidden-thumbnail.webp",
            'alt_text' => 'No pública', 'position' => 0, 'is_public' => false,
        ]);
        $this->getJson("/api/products/{$hiddenImageProduct->slug}/images/{$hiddenImage->id}?variant=thumbnail")->assertNotFound();
    }

    public function test_catalog_thumbnail_falls_back_to_the_original_for_legacy_images(): void
    {
        Storage::fake('local');
        $product = $this->publicProduct();
        $path = "products/{$product->id}/legacy.webp";
        Storage::disk('local')->put($path, 'legacy-photo');
        $image = $product->images()->create(['disk' => 'local', 'path' => $path, 'alt_text' => 'Foto anterior', 'position' => 0, 'is_public' => true]);

        $catalogImage = $this->getJson('/api/products')->assertOk()->json('data.0.images.0');
        $this->assertSame($catalogImage['url'], $catalogImage['thumbnail_url']);
        $thumbnailResponse = $this->get("/api/products/{$product->slug}/images/{$image->id}?variant=thumbnail")->assertOk();
        $this->assertSame('legacy-photo', $thumbnailResponse->streamedContent());
    }

    public function test_removing_a_product_image_deletes_its_original_and_thumbnail_files(): void
    {
        Storage::fake('local');
        $product = $this->publicProduct();
        $originalPath = "products/{$product->id}/removed-original.webp";
        $thumbnailPath = "products/{$product->id}/removed-thumbnail.webp";
        $remainingOriginalPath = "products/{$product->id}/remaining-original.webp";
        $remainingThumbnailPath = "products/{$product->id}/remaining-thumbnail.webp";
        foreach ([$originalPath, $thumbnailPath, $remainingOriginalPath, $remainingThumbnailPath] as $path) {
            Storage::disk('local')->put($path, 'optimized-photo');
        }
        $removed = $product->images()->create([
            'disk' => 'local', 'path' => $originalPath, 'thumbnail_path' => $thumbnailPath,
            'alt_text' => 'Foto retirada', 'position' => 0, 'is_public' => true,
        ]);
        $product->images()->create([
            'disk' => 'local', 'path' => $remainingOriginalPath, 'thumbnail_path' => $remainingThumbnailPath,
            'alt_text' => 'Foto conservada', 'position' => 1, 'is_public' => true,
        ]);

        $this->actingAs($product->producer->user)->patchJson("/api/me/products/{$product->id}", [
            'title' => $product->title, 'category_id' => $product->category_id,
            'description' => $product->description, 'unit' => $product->unit,
            'price_type' => 'contact', 'price_amount' => null, 'currency' => 'PAB',
            'delivery_method' => $product->delivery_method, 'reason' => 'Retiré una foto repetida.',
            'remove_image_ids' => [$removed->id],
        ])->assertOk()->assertJsonPath('data.status', 'pending');

        Storage::disk('local')->assertMissing($originalPath);
        Storage::disk('local')->assertMissing($thumbnailPath);
        Storage::disk('local')->assertExists($remainingOriginalPath);
        Storage::disk('local')->assertExists($remainingThumbnailPath);
    }

    public function test_contact_event_is_only_recorded_for_public_products_and_is_deduplicated(): void
    {
        $published = $this->publicProduct();
        $payload = ['product_id' => $published->id, 'channel' => 'whatsapp'];
        $this->postJson('/api/contact-events', $payload)->assertAccepted();
        $this->postJson('/api/contact-events', $payload)->assertAccepted()->assertJsonPath('message', 'Intención de contacto registrada. Esto no confirma una conversación ni una venta.');
        $this->assertDatabaseCount('contact_events', 1);
        $draft = Product::factory()->create(['status' => ProductStatus::Draft]);
        $this->postJson('/api/contact-events', ['product_id' => $draft->id, 'channel' => 'phone'])->assertNotFound();
    }

    public function test_report_response_does_not_expose_internal_fields(): void
    {
        $product = $this->publicProduct();
        $response = $this->postJson('/api/reports', ['resource_type' => 'product', 'resource_id' => $product->id, 'reason_code' => 'incorrect', 'description' => 'La disponibilidad indicada no coincide con la oferta.'])
            ->assertAccepted();
        $this->assertDatabaseCount('reports', 1);
        $response->assertJsonMissingPath('data')->assertJsonMissingPath('description')->assertJsonMissingPath('assignee_id');
    }

    public function test_security_alerts_surface_repeated_reports_with_an_explainable_rule(): void
    {
        $product = $this->publicProduct();
        $payload = ['resource_type' => 'product', 'resource_id' => $product->id, 'reason_code' => 'suspicious', 'description' => 'Esta oferta necesita una comprobación de seguridad.'];
        $this->postJson('/api/reports', $payload)->assertAccepted();
        $this->postJson('/api/reports', $payload)->assertAccepted();
        $this->postJson('/api/reports', $payload)->assertAccepted();

        $moderator = User::factory()->create();
        $this->actingAs($moderator)->getJson('/api/admin/security/alerts')->assertForbidden();
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);
        $this->confirmMfa($moderator);
        $this->actingAs($moderator)->getJson('/api/admin/security/alerts')
            ->assertOk()
            ->assertJsonPath('data.0.signal_type', 'repeated_reports')
            ->assertJsonPath('data.0.resource_type', 'product')
            ->assertJsonPath('data.0.resource_id', $product->id)
            ->assertJsonPath('data.0.evidence.report_count_24h', 3)
            ->assertJsonPath('data.0.explanation', 'Tres o más reportes recibidos para el mismo recurso en 24 horas. Requiere revisión humana; no determina fraude.');

        $this->assertDatabaseCount('risk_signals', 1);
    }

    public function test_moderator_can_take_and_resolve_a_security_alert_with_audited_notes(): void
    {
        $signal = RiskSignal::query()->create([
            'signal_key' => 'repeated_reports:product:1:20261019',
            'signal_type' => 'repeated_reports',
            'resource_type' => 'product',
            'resource_id' => 1,
            'severity' => 'warning',
            'explanation' => 'Tres reportes requieren revisión humana.',
            'evidence' => ['report_count_24h' => 3, 'window_hours' => 24],
            'status' => 'open',
            'first_seen_at' => now(),
            'last_seen_at' => now(),
        ]);
        $unauthorized = $this->confirmMfa(User::factory()->create());
        $this->actingAs($unauthorized)->putJson('/api/admin/security/alerts/'.$signal->id, ['status' => 'reviewing', 'resolution_note' => 'Intento de revisión sin permiso suficiente.'])->assertForbidden();
        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);

        $this->actingAs($moderator)->putJson('/api/admin/security/alerts/'.$signal->id, ['status' => 'reviewing', 'resolution_note' => 'Iniciamos una revisión humana de los reportes.'])
            ->assertOk()->assertJsonPath('data.status', 'reviewing')->assertJsonPath('data.assignee_id', $moderator->id);
        $this->actingAs($moderator)->putJson('/api/admin/security/alerts/'.$signal->id, ['status' => 'resolved', 'resolution_note' => 'La revisión concluyó sin evidencia suficiente para una medida.'])
            ->assertOk()->assertJsonPath('data.status', 'resolved');

        $this->assertDatabaseHas('risk_signals', ['id' => $signal->id, 'status' => 'resolved', 'assignee_id' => $moderator->id, 'resolution_note' => 'La revisión concluyó sin evidencia suficiente para una medida.']);
        $this->assertDatabaseCount('audit_logs', 2);
    }

    public function test_alert_view_permission_does_not_allow_management_actions(): void
    {
        $signal = RiskSignal::query()->create([
            'signal_key' => 'repeated_reports:product:permission-check',
            'signal_type' => 'repeated_reports',
            'resource_type' => 'product',
            'resource_id' => 1,
            'severity' => 'warning',
            'explanation' => 'Requiere revisión humana.',
            'evidence' => ['report_count_24h' => 3, 'window_hours' => 24],
            'status' => 'open',
            'first_seen_at' => now(),
            'last_seen_at' => now(),
        ]);
        $viewPermission = Permission::query()->where('name', 'security.alerts.view')->firstOrFail();
        $readerRole = Role::create(['name' => 'alerts_reader', 'display_name' => 'Lector de alertas']);
        $readerRole->permissions()->attach($viewPermission->id);
        $reader = $this->confirmMfa(User::factory()->create());
        $reader->roles()->attach($readerRole->id);

        $this->actingAs($reader)->getJson('/api/admin/security/alerts')->assertOk()->assertJsonPath('data.0.id', $signal->id);
        $this->putJson('/api/admin/security/alerts/'.$signal->id, [
            'status' => 'reviewing',
            'resolution_note' => 'Intento de gestión desde acceso de solo lectura.',
        ])->assertForbidden();

        $this->assertDatabaseHas('risk_signals', ['id' => $signal->id, 'status' => 'open', 'assignee_id' => null]);
    }

    public function test_report_about_a_producer_keeps_reporter_contact_private_in_the_case_queue(): void
    {
        $producer = ProducerProfile::factory()->create([
            'profile_status' => 'active',
            'phone_verified_at' => now(),
            'phone_public' => '+50760008881',
        ]);
        $reporter = User::factory()->create();
        $reference = $this->actingAs($reporter)->postJson('/api/reports', [
            'resource_type' => 'producer',
            'resource_id' => $producer->id,
            'reason_code' => 'incorrect',
            'description' => 'La información de este perfil necesita revisión.',
            'contact_email' => 'privado@example.test',
        ])->assertAccepted()->assertJsonMissing(['contact_email' => 'privado@example.test'])->json('reference');
        $report = Report::query()->where('public_reference', $reference)->firstOrFail();

        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::query()->where('name', 'moderator')->valueOrFail('id'));
        $case = $this->actingAs($moderator)->getJson('/api/admin/reports')->assertOk()
            ->assertJsonPath('data.0.id', $report->id)
            ->assertJsonPath('data.0.resource_type', 'producer')
            ->assertJsonPath('data.0.resource_id', $producer->id)
            ->assertJsonMissingPath('data.0.reporter_id')
            ->assertJsonMissingPath('data.0.contact_email');
        $this->assertDatabaseHas('reports', ['id' => $report->id, 'reporter_id' => $reporter->id, 'contact_email' => 'privado@example.test']);
        $this->assertNotSame('', $case->json('data.0.public_reference'));
    }

    public function test_report_case_can_be_resolved_from_its_dossier_with_private_note_and_audit(): void
    {
        $product = $this->publicProduct(['title' => 'Zapallo de prueba']);
        $this->postJson('/api/reports', ['resource_type' => 'product', 'resource_id' => $product->id, 'reason_code' => 'incorrect', 'description' => 'Solicito confirmar la disponibilidad de esta oferta.'])->assertAccepted();
        $report = Report::query()->latest('id')->firstOrFail();
        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::query()->where('name', 'moderator')->valueOrFail('id'));
        $note = 'Revisamos el caso y confirmamos su resolución.';

        $this->actingAs($moderator)->putJson('/api/admin/reports/'.$report->id, ['status' => 'reviewing', 'priority' => 'high', 'resolution_note' => 'Iniciamos revisión del caso con evidencia.'])->assertOk()->assertJsonPath('data.status', 'reviewing');
        $this->putJson('/api/admin/reports/'.$report->id, ['status' => 'resolved', 'priority' => 'high', 'resolution_note' => $note])->assertOk()->assertJsonPath('data.status', 'resolved');

        $this->assertSame('resolved', $report->fresh()->status);
        $this->assertNotNull($report->fresh()->resolved_at);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $moderator->id, 'action' => 'trust_safety.report_updated', 'resource_type' => 'report', 'resource_id' => $report->id, 'reason' => $note]);
        $this->actingAs($moderator)->getJson('/api/admin/reports/'.$report->id)->assertOk()->assertJsonPath('data.history.2.reason', $note)->assertJsonPath('data.history.2.changes.status.from', 'reviewing')->assertJsonPath('data.history.2.changes.status.to', 'resolved');
    }

    public function test_report_case_can_be_dismissed_from_its_dossier_without_a_prior_assignment(): void
    {
        $product = $this->publicProduct(['title' => 'Yuca de prueba']);
        $this->postJson('/api/reports', ['resource_type' => 'product', 'resource_id' => $product->id, 'reason_code' => 'other', 'description' => 'Este reporte permite validar el descarte documentado.'])->assertAccepted();
        $report = Report::query()->latest('id')->firstOrFail();
        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::query()->where('name', 'moderator')->valueOrFail('id'));

        $this->actingAs($moderator)->putJson('/api/admin/reports/'.$report->id, ['status' => 'dismissed', 'resolution_note' => 'No se confirma una infracción en este reporte.'])->assertOk()->assertJsonPath('data.status', 'dismissed')->assertJsonPath('data.assignee_id', $moderator->id);

        $this->assertSame('dismissed', $report->fresh()->status);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $moderator->id, 'action' => 'trust_safety.report_updated', 'resource_type' => 'report', 'resource_id' => $report->id, 'reason' => 'No se confirma una infracción en este reporte.']);
    }

    public function test_report_case_detail_returns_resource_and_audit_history_without_reporter_or_storage_secrets(): void
    {
        $product = $this->publicProduct(['title' => 'Tomate de patio']);
        $reporter = User::factory()->create();
        $reference = $this->actingAs($reporter)->postJson('/api/reports', [
            'resource_type' => 'product',
            'resource_id' => $product->id,
            'reason_code' => 'incorrect',
            'description' => 'La disponibilidad indicada requiere confirmar revisión.',
            'contact_email' => 'reportante-privado@example.test',
        ])->assertAccepted()->json('reference');
        $report = Report::query()->where('public_reference', $reference)->firstOrFail();
        $evidence = $report->evidence()->create(['private_disk' => 'local', 'private_path' => 'private/secret-evidence.jpg', 'mime_type' => 'image/jpeg', 'size_bytes' => 128]);
        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::query()->where('name', 'moderator')->valueOrFail('id'));
        AuditLog::query()->create([
            'actor_id' => $moderator->id,
            'action' => 'trust_safety.report_updated',
            'resource_type' => 'report',
            'resource_id' => $report->id,
            'before_values' => ['status' => 'new'],
            'after_values' => ['status' => 'reviewing', 'assignee_id' => $moderator->id],
            'reason' => 'Iniciamos una revisión humana del reporte.',
            'created_at' => now(),
        ]);
        AuditLog::query()->create([
            'actor_id' => $moderator->id,
            'action' => 'trust_safety.report_evidence_viewed',
            'resource_type' => 'report_evidence',
            'resource_id' => $evidence->id,
            'created_at' => now(),
        ]);

        $this->actingAs($moderator)->getJson('/api/admin/reports/'.$report->id)
            ->assertOk()
            ->assertJsonPath('data.id', $report->id)
            ->assertJsonPath('data.resource.type', 'product')
            ->assertJsonPath('data.resource.id', $product->id)
            ->assertJsonPath('data.resource.label', 'Tomate de patio')
            ->assertJsonPath('data.evidence.0.id', $evidence->id)
            ->assertJsonPath('data.history.0.action', 'trust_safety.report_received')
            ->assertJsonPath('data.history.1.action', 'trust_safety.report_updated')
            ->assertJsonPath('data.history.2.action', 'trust_safety.report_evidence_viewed')
            ->assertJsonPath('data.history.1.actor.name', $moderator->name)
            ->assertJsonMissingPath('data.reporter_id')
            ->assertJsonMissingPath('data.contact_email')
            ->assertJsonMissingPath('data.evidence.0.private_path')
            ->assertJsonMissing(['reportante-privado@example.test', 'private/secret-evidence.jpg']);

        $this->actingAs(User::factory()->create())->getJson('/api/admin/reports/'.$report->id)->assertForbidden();
        $withoutMfa = User::factory()->create();
        $withoutMfa->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);
        $this->actingAs($withoutMfa)->getJson('/api/admin/reports/'.$report->id)->assertStatus(428);
        $this->actingAs($moderator)->getJson('/api/admin/reports/999999')->assertNotFound();
    }

    public function test_a_new_report_reopens_a_resolved_alert_and_clears_the_previous_review(): void
    {
        $product = $this->publicProduct();
        $payload = ['resource_type' => 'product', 'resource_id' => $product->id, 'reason_code' => 'suspicious', 'description' => 'Solicito revisar esta oferta con información actualizada.'];
        foreach (range(1, 3) as $_) {
            $this->postJson('/api/reports', $payload)->assertAccepted();
        }
        $signal = RiskSignal::query()->sole();
        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::query()->where('name', 'moderator')->valueOrFail('id'));

        $this->actingAs($moderator)->putJson('/api/admin/security/alerts/'.$signal->id, [
            'status' => 'reviewing',
            'resolution_note' => 'Revisamos las denuncias con evidencia disponible.',
        ])->assertOk();
        $this->putJson('/api/admin/security/alerts/'.$signal->id, [
            'status' => 'resolved',
            'resolution_note' => 'Sin evidencia suficiente para tomar una medida.',
        ])->assertOk();
        $this->postJson('/api/reports', $payload)->assertAccepted();

        $reopened = $signal->fresh();
        $this->assertSame('open', $reopened->status);
        $this->assertNull($reopened->assignee_id);
        $this->assertNull($reopened->reviewed_by);
        $this->assertNull($reopened->resolution_note);
        $this->assertNull($reopened->reviewed_at);
        $this->assertNull($reopened->closed_at);
        $this->assertSame(4, $reopened->evidence['report_count_24h']);
        $this->assertDatabaseCount('risk_signals', 1);
    }

    public function test_producer_profile_update_invalidates_phone_verification_and_public_number(): void
    {
        $user = User::factory()->create();
        $profile = $user->producerProfile()->create(['slug' => 'profile-edit', 'public_name' => 'Finca Original', 'phone_private' => '+50760001000', 'phone_public' => '+50760001000', 'phone_verified_at' => now(), 'contact_level' => 'contact_confirmed']);
        $pendingVerification = $profile->verifications()->create(['channel' => 'sms', 'status' => 'pending', 'code_hash' => app(ContactVerificationSender::class)->hashCode('123456'), 'expires_at' => now()->addMinutes(10)]);
        $this->actingAs($user)->putJson('/api/me/profile', ['public_name' => 'Finca Nueva', 'activity' => 'Agricultura', 'description' => 'Cultivamos productos frescos en familia.', 'phone_private' => '+50760002000'])->assertOk()->assertJsonPath('data.contact_level', 'unverified');
        $this->assertNull($profile->fresh()->phone_public);
        $this->assertNull($profile->fresh()->phone_verified_at);
        $this->assertDatabaseHas('producer_profiles', ['id' => $profile->id, 'public_name' => 'Finca Nueva']);
        $this->assertSame('expired', $pendingVerification->fresh()->status);
        $this->assertNull($pendingVerification->fresh()->code_hash);
        $phoneChange = DB::table('audit_logs')->where('resource_type', 'producer_profile')->where('resource_id', $profile->id)->where('action', 'producer.phone_changed')->first();
        $this->assertNotNull($phoneChange);
        $this->assertSame(['contact_level' => 'contact_confirmed'], json_decode($phoneChange->before_values, true));
        $this->assertSame(['contact_level' => 'unverified', 'reverification_required' => true], json_decode($phoneChange->after_values, true));
        $this->assertStringNotContainsString('+50760002000', json_encode([$phoneChange->before_values, $phoneChange->after_values, $phoneChange->reason]));
    }

    public function test_public_producer_profile_never_exposes_unverified_private_phone(): void
    {
        $profile = ProducerProfile::factory()->create(['slug' => 'public-profile', 'profile_status' => 'active', 'phone_private' => '+50760008888', 'phone_public' => '+50760008888', 'contact_level' => 'unverified']);
        $this->getJson('/api/producers/public-profile')->assertOk()->assertJsonPath('data.phone_public', null)->assertJsonMissing(['phone_private' => '+50760008888']);
    }

    public function test_public_producer_profile_offers_include_safe_producer_data_for_product_cards(): void
    {
        $product = $this->publicProduct();
        $producer = $product->producer;
        $producer->update([
            'slug' => 'profile-offer-card',
            'public_name' => 'Huerta de prueba',
            'location_id' => Location::query()->where('slug', 'las-tablas')->valueOrFail('id'),
        ]);

        $this->getJson('/api/producers/profile-offer-card')
            ->assertOk()
            ->assertJsonPath('data.products.0.slug', $product->slug)
            ->assertJsonPath('data.products.0.producer.public_name', 'Huerta de prueba')
            ->assertJsonPath('data.products.0.producer.location.name', 'Las Tablas')
            ->assertJsonMissingPath('data.products.0.producer.phone_private')
            ->assertJsonMissingPath('data.products.0.producer.phone_verified_at')
            ->assertJsonMissingPath('data.products.0.producer.registration_method')
            ->assertJsonMissingPath('data.products.0.producer.profile_status');
    }

    public function test_report_case_requires_permission_and_privately_audits_resolution(): void
    {
        $user = User::factory()->create();
        $product = $this->publicProduct();
        $reportId = $this->postJson('/api/reports', ['resource_type' => 'product', 'resource_id' => $product->id, 'reason_code' => 'unsafe', 'description' => 'Esta publicación requiere una revisión de seguridad.'])->assertAccepted()->json('reference');
        $report = Report::where('public_reference', $reportId)->firstOrFail();
        $this->actingAs($user)->getJson('/api/admin/reports')->assertForbidden();

        $role = Role::where('name', 'moderator')->firstOrFail();
        $user->roles()->attach($role->id);
        $this->confirmMfa($user);
        $this->actingAs($user)->putJson('/api/admin/reports/'.$report->id, ['status' => 'reviewing', 'priority' => 'high', 'resolution_note' => 'Iniciamos la revisión del reporte.'])
            ->assertOk()->assertJsonPath('data.assignee_id', $user->id);
        $secondModerator = User::factory()->create();
        $secondModerator->roles()->attach($role->id);
        $this->confirmMfa($secondModerator);
        $this->actingAs($secondModerator)->putJson('/api/admin/reports/'.$report->id, ['status' => 'resolved', 'priority' => 'high', 'resolution_note' => 'Intento de cierre por una persona no asignada.'])->assertConflict();
        $this->actingAs($user)->putJson('/api/admin/reports/'.$report->id, ['status' => 'resolved', 'priority' => 'high', 'resolution_note' => 'Revisado y atendido conforme al protocolo.'])
            ->assertOk()->assertJsonPath('data.status', 'resolved');
        $this->actingAs($user)->getJson('/api/admin/reports')->assertOk()->assertJsonMissing(['id' => $report->id]);
        $this->assertDatabaseHas('audit_logs', ['resource_type' => 'report', 'resource_id' => $report->id, 'action' => 'trust_safety.report_updated', 'actor_id' => $user->id]);
    }

    public function test_report_case_can_only_be_released_by_its_assignee_with_audited_reason(): void
    {
        $product = $this->publicProduct();
        $reference = $this->postJson('/api/reports', ['resource_type' => 'product', 'resource_id' => $product->id, 'reason_code' => 'unsafe', 'description' => 'Esta publicación requiere una revisión de seguridad.'])->assertAccepted()->json('reference');
        $report = Report::query()->where('public_reference', $reference)->firstOrFail();
        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);
        $other = $this->confirmMfa(User::factory()->create());
        $other->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);
        $this->actingAs($moderator)->putJson('/api/admin/reports/'.$report->id, ['status' => 'reviewing', 'resolution_note' => 'Inicio revisión del caso.'])->assertOk();
        $this->actingAs($other)->postJson('/api/admin/reports/'.$report->id.'/release', ['resolution_note' => 'Libero para reasignación al equipo.'])->assertConflict();
        $this->actingAs($moderator)->postJson('/api/admin/reports/'.$report->id.'/release', ['resolution_note' => '   '])->assertUnprocessable();
        $this->actingAs($moderator)->postJson('/api/admin/reports/'.$report->id.'/release', ['resolution_note' => 'Reasigno por cambio de turno.'])->assertOk()->assertJsonPath('data.status', 'new')->assertJsonPath('data.assignee_id', null);
        $this->assertDatabaseHas('reports', ['id' => $report->id, 'status' => 'new', 'assignee_id' => null, 'resolved_at' => null]);
        $this->assertDatabaseHas('audit_logs', ['resource_type' => 'report', 'resource_id' => $report->id, 'action' => 'trust_safety.report_released', 'actor_id' => $moderator->id, 'reason' => 'Reasigno por cambio de turno.']);
    }

    public function test_report_priority_can_be_changed_without_transitioning_case_and_is_audited(): void
    {
        $product = $this->publicProduct();
        $reference = $this->postJson('/api/reports', ['resource_type' => 'product', 'resource_id' => $product->id, 'reason_code' => 'incorrect', 'description' => 'La oferta requiere confirmar la disponibilidad.'])->assertAccepted()->json('reference');
        $report = Report::query()->where('public_reference', $reference)->firstOrFail();
        $moderator = User::factory()->create();
        $moderator->roles()->attach(Role::query()->where('name', 'moderator')->valueOrFail('id'));
        $this->confirmMfa($moderator);

        $this->actingAs($moderator)->patchJson('/api/admin/reports/'.$report->id.'/priority', ['priority' => 'urgent'])
            ->assertOk()->assertJsonPath('data.id', $report->id)->assertJsonPath('data.priority', 'urgent')->assertJsonPath('data.status', 'new');

        $this->assertDatabaseHas('reports', ['id' => $report->id, 'priority' => 'urgent', 'status' => 'new', 'assignee_id' => null]);
        $this->assertDatabaseHas('audit_logs', ['actor_id' => $moderator->id, 'action' => 'trust_safety.report_priority_changed', 'resource_type' => 'report', 'resource_id' => $report->id]);
        $this->actingAs(User::factory()->create())->patchJson('/api/admin/reports/'.$report->id.'/priority', ['priority' => 'low'])->assertForbidden();

        $otherModerator = User::factory()->create();
        $otherModerator->roles()->attach(Role::query()->where('name', 'moderator')->valueOrFail('id'));
        $report->forceFill(['status' => 'reviewing', 'assignee_id' => $otherModerator->id])->save();
        $this->actingAs($moderator)->patchJson('/api/admin/reports/'.$report->id.'/priority', ['priority' => 'low'])->assertConflict();
        $this->assertDatabaseHas('reports', ['id' => $report->id, 'priority' => 'urgent', 'assignee_id' => $otherModerator->id]);
    }

    public function test_report_queue_orders_by_priority_and_exposes_configured_sla_deadline(): void
    {
        $urgentProduct = $this->publicProduct();
        $normalProduct = $this->publicProduct();
        $urgentRef = $this->postJson('/api/reports', ['resource_type' => 'product', 'resource_id' => $urgentProduct->id, 'reason_code' => 'unsafe', 'description' => 'Esta oferta requiere atención urgente del equipo.'])->assertAccepted()->json('reference');
        $normalRef = $this->postJson('/api/reports', ['resource_type' => 'product', 'resource_id' => $normalProduct->id, 'reason_code' => 'incorrect', 'description' => 'La información de esta oferta parece incorrecta.'])->assertAccepted()->json('reference');
        $urgent = Report::query()->where('public_reference', $urgentRef)->firstOrFail();
        $normal = Report::query()->where('public_reference', $normalRef)->firstOrFail();
        $urgent->forceFill(['priority' => 'urgent', 'created_at' => now()->subHours(7)])->save();
        $normal->forceFill(['priority' => 'normal', 'created_at' => now()->subMinutes(2)])->save();
        config(['trust_safety.report_sla_hours.urgent' => 6]);

        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);
        $response = $this->actingAs($moderator)->getJson('/api/admin/reports')->assertOk();
        $this->assertSame($urgent->id, $response->json('data.0.id'));
        $this->assertEquals($urgent->created_at->copy()->addHours(6)->timestamp, strtotime($response->json('data.0.sla_due_at')));
        $this->assertTrue($response->json('data.0.sla_overdue'));
        $this->assertNull($response->json('data.0.assignee_id'));
    }

    public function test_report_queue_paginates_after_twenty_cases(): void
    {
        $product = $this->publicProduct();
        foreach (range(1, 21) as $number) {
            Report::query()->create([
                'public_reference' => 'RPT-PAGE-'.$number,
                'reporter_id' => null,
                'resource_type' => 'product',
                'resource_id' => $product->id,
                'reason_code' => 'incorrect',
                'description' => 'Reporte de prueba para comprobar la paginación de la cola.',
                'status' => 'new',
                'priority' => 'normal',
                'created_at' => now()->subMinutes(21 - $number),
                'updated_at' => now(),
            ]);
        }

        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);

        $firstPage = $this->actingAs($moderator)->getJson('/api/admin/reports')->assertOk()
            ->assertJsonPath('current_page', 1)
            ->assertJsonPath('per_page', 20)
            ->assertJsonPath('total', 21)
            ->assertJsonPath('last_page', 2)
            ->assertJsonCount(20, 'data');
        $secondPage = $this->actingAs($moderator)->getJson('/api/admin/reports?page=2')->assertOk()
            ->assertJsonPath('current_page', 2)
            ->assertJsonCount(1, 'data');

        $this->assertNotSame($firstPage->json('data.0.id'), $secondPage->json('data.0.id'));
    }

    public function test_security_alert_queue_paginates_after_twenty_alerts(): void
    {
        foreach (range(1, 21) as $number) {
            RiskSignal::query()->create([
                'signal_key' => 'pagination-alert-'.$number,
                'signal_type' => 'repeated_reports',
                'resource_type' => 'product',
                'resource_id' => $number,
                'severity' => 'warning',
                'explanation' => 'La señal requiere revisión humana.',
                'evidence' => ['report_count_24h' => 3, 'window_hours' => 24],
                'status' => 'open',
                'first_seen_at' => now()->subMinutes(21 - $number),
                'last_seen_at' => now()->subMinutes(21 - $number),
            ]);
        }

        $moderator = $this->confirmMfa(User::factory()->create());
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);

        $firstPage = $this->actingAs($moderator)->getJson('/api/admin/security/alerts')->assertOk()
            ->assertJsonPath('current_page', 1)
            ->assertJsonPath('per_page', 20)
            ->assertJsonPath('total', 21)
            ->assertJsonPath('last_page', 2)
            ->assertJsonCount(20, 'data');
        $secondPage = $this->actingAs($moderator)->getJson('/api/admin/security/alerts?page=2')->assertOk()
            ->assertJsonPath('current_page', 2)
            ->assertJsonCount(1, 'data');

        $this->assertNotSame($firstPage->json('data.0.id'), $secondPage->json('data.0.id'));
    }

    public function test_admin_catalog_permissions_and_hierarchy_are_enforced_and_audited(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/admin/categories')->assertForbidden();
        $user->roles()->attach(Role::where('name', 'admin')->firstOrFail()->id);
        $this->confirmMfa($user);
        $this->actingAs($user)->postJson('/api/admin/locations', ['name' => 'Distrito sin padre', 'level' => 'district', 'active' => true])->assertUnprocessable();
        $province = Location::query()->where('level', 'province')->firstOrFail();
        $this->actingAs($user)->postJson('/api/admin/locations', ['name' => 'Distrito de prueba', 'level' => 'district', 'parent_id' => $province->id, 'active' => true])->assertCreated();
        $this->assertDatabaseHas('audit_logs', ['resource_type' => 'location', 'action' => 'catalog.location_created', 'actor_id' => $user->id]);
    }

    public function test_analytics_are_aggregated_and_permission_checked(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->getJson('/api/admin/analytics')->assertForbidden();
        $user->roles()->attach(Role::where('name', 'analyst')->firstOrFail()->id);
        $this->confirmMfa($user);
        SearchEvent::query()->create(['filters' => ['has_keyword' => true], 'occurred_at' => now()]);
        SearchEvent::query()->create(['filters' => ['province' => 'los-santos'], 'occurred_at' => now()->subDays(31)]);
        $this->actingAs($user)->getJson('/api/admin/analytics')->assertOk()
            ->assertJsonStructure(['data' => ['producers', 'products', 'reports_open', 'contact_intentions_30d', 'searches_without_results_30d']])
            ->assertJsonPath('data.searches_without_results_30d', 1)
            ->assertJsonMissingPath('data.producer_emails');
        $export = $this->actingAs($user)->get('/api/admin/analytics/export.csv');
        $export->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8')
            ->assertDownload();
        $csv = $export->streamedContent();
        $this->assertStringContainsString('tipo,estado,cantidad,periodo', $csv);
        $this->assertStringContainsString('contacto,intenciones,', $csv);
        $this->assertStringNotContainsString($user->email, $csv);

        $unauthorized = User::factory()->create();
        $this->actingAs($unauthorized)->get('/api/admin/analytics/export.csv')->assertForbidden();
    }

    public function test_producer_administrative_detail_shows_verification_and_history_without_private_phone_or_secrets(): void
    {
        $producer = User::factory()->create(['name' => 'Productora detalle', 'email' => 'detalle@example.test']);
        $profile = $producer->producerProfile()->create([
            'slug' => 'finca-detalle', 'public_name' => 'Finca detalle', 'activity' => 'Agricultura',
            'description' => 'Cultivo familiar en Azuero.', 'phone_private' => '+50760007777',
            'phone_public' => '+50760007777', 'phone_verified_at' => now(), 'contact_level' => 'contact_confirmed',
            'profile_status' => 'suspended', 'suspension_reason' => 'Confirma el origen de las ofertas antes de volver a publicarlas.',
        ]);
        $profile->consents()->create(['consent_type' => 'privacy', 'version' => 'v1', 'accepted_at' => now()]);
        $profile->verifications()->create(['channel' => 'sms', 'status' => 'verified', 'code_hash' => hash('sha256', 'secret-code'), 'verified_at' => now()]);
        $product = Product::factory()->create(['producer_profile_id' => $profile->id]);
        $product->statusHistory()->create(['actor_id' => $producer->id, 'from_status' => 'draft', 'to_status' => 'pending', 'reason' => 'Oferta enviada a revisión.']);
        AuditLog::create(['actor_id' => $producer->id, 'action' => 'producer.profile_updated', 'resource_type' => 'producer_profile', 'resource_id' => $profile->id, 'after_values' => ['public_name' => 'Finca detalle'], 'reason' => 'Actualizó el nombre público.', 'created_at' => now()]);

        $operator = User::factory()->create();
        $this->actingAs($operator)->getJson('/api/admin/producers/'.$profile->id)->assertForbidden();
        $operator->roles()->attach(Role::where('name', 'support_operator')->firstOrFail()->id);
        $this->confirmMfa($operator);
        $response = $this->actingAs($operator)->getJson('/api/admin/producers/'.$profile->id)->assertOk()
            ->assertJsonPath('data.producer.contact_level', 'contact_confirmed')
            ->assertJsonPath('data.producer.suspension_reason', 'Confirma el origen de las ofertas antes de volver a publicarlas.')
            ->assertJsonPath('data.verifications.0.channel', 'sms')
            ->assertJsonPath('data.consents.0.version', 'v1')
            ->assertJsonPath('data.products.0.title', $product->title)
            ->assertJsonPath('data.audit.0.action', 'producer.profile_updated')
            ->assertJsonMissing(['phone_private' => '+50760007777'])
            ->assertJsonMissing(['code_hash' => hash('sha256', 'secret-code')]);
        $response->assertJsonPath('data.account.email', 'detalle@example.test');
    }

    public function test_only_confirmed_no_result_searches_are_recorded_without_storing_search_terms_or_identifiers(): void
    {
        $this->postJson('/api/search-events', ['q' => 'Tomate sin oferta correo persona@example.test tel +507 6000 1122'])
            ->assertAccepted()->assertJsonPath('data.recorded', true);
        $event = SearchEvent::query()->firstOrFail();
        $this->assertSame(['has_keyword' => true], $event->filters);
        $this->assertFalse(Schema::hasColumn('search_events', 'query_text'));

        $this->publicProduct(['title' => 'Yuca disponible']);
        $this->postJson('/api/search-events', ['q' => 'Yuca'])->assertStatus(409);
        $this->postJson('/api/search-events', [])->assertUnprocessable();
        $this->assertDatabaseCount('search_events', 1);
    }

    public function test_moderator_can_view_pending_product_images_privately_and_view_is_audited(): void
    {
        Storage::fake('local');
        $moderator = User::factory()->create();
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);
        $this->confirmMfa($moderator);
        $product = Product::factory()->create(['status' => ProductStatus::Pending]);
        Storage::disk('local')->put('products/pending.jpg', file_get_contents(base_path('tests/fixture-product.jpg')));
        $image = $product->images()->create(['disk' => 'local', 'path' => 'products/pending.jpg', 'position' => 0, 'is_public' => false]);
        $this->getJson("/api/products/{$product->slug}/images/{$image->id}")->assertNotFound();
        $this->actingAs($moderator)->get("/api/admin/products/{$product->id}/images/{$image->id}")->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertDatabaseHas('audit_logs', ['resource_type' => 'product_image', 'resource_id' => $image->id, 'action' => 'moderation.product_image_viewed', 'actor_id' => $moderator->id]);
    }

    public function test_report_evidence_is_private_and_only_downloadable_by_authorized_moderator(): void
    {
        Storage::fake('local');
        $product = $this->publicProduct();
        $file = UploadedFile::fake()->createWithContent('evidence.pdf', "%PDF-1.4\nprivate report evidence\n%%EOF");
        $reference = $this->post('/api/reports', ['resource_type' => 'product', 'resource_id' => $product->id, 'reason_code' => 'unsafe', 'description' => 'Adjunto información privada para revisión de seguridad.', 'evidence' => [$file]], ['Accept' => 'application/json'])->assertAccepted()->json('reference');
        $report = Report::where('public_reference', $reference)->firstOrFail();
        $evidence = $report->evidence()->firstOrFail();
        $this->getJson("/api/admin/reports/{$report->id}/evidence/{$evidence->id}")->assertUnauthorized();
        $moderator = User::factory()->create();
        $moderator->roles()->attach(Role::where('name', 'moderator')->firstOrFail()->id);
        $this->confirmMfa($moderator);
        $this->actingAs($moderator)->get("/api/admin/reports/{$report->id}/evidence/{$evidence->id}")->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertDatabaseHas('audit_logs', ['resource_type' => 'report_evidence', 'resource_id' => $evidence->id, 'action' => 'trust_safety.report_evidence_viewed', 'actor_id' => $moderator->id]);
    }

    public function test_admin_moderation_metrics_average_each_recent_human_decision_from_its_submission(): void
    {
        $admin = User::factory()->create();
        $admin->roles()->attach(Role::where('name', 'admin')->firstOrFail()->id);
        $this->confirmMfa($admin);
        $now = now();

        $product = Product::factory()->create();
        $submissionOne = $now->copy()->subDays(15);
        $decisionOne = $submissionOne->copy()->addHours(12);
        $submissionTwo = $now->copy()->subDays(8);
        $decisionTwo = $submissionTwo->copy()->addHours(4);
        $this->recordStatusEvent($product, $admin, 'draft', 'pending', $submissionOne);
        $this->recordStatusEvent($product, $admin, 'pending', 'changes_requested', $decisionOne);
        $this->recordStatusEvent($product, $admin, 'changes_requested', 'pending', $submissionTwo);
        $this->recordStatusEvent($product, $admin, 'pending', 'rejected', $decisionTwo);

        $recentProduct = Product::factory()->create();
        $recentSubmission = $now->copy()->subDays(3);
        $this->recordStatusEvent($recentProduct, $admin, 'draft', 'pending', $recentSubmission);
        $this->recordStatusEvent($recentProduct, $admin, 'pending', 'published', $recentSubmission->copy()->addHour());

        $oldProduct = Product::factory()->create();
        $oldSubmission = $now->copy()->subDays(34);
        $this->recordStatusEvent($oldProduct, $admin, 'draft', 'pending', $oldSubmission);
        $this->recordStatusEvent($oldProduct, $admin, 'pending', 'rejected', $now->copy()->subDays(31));

        $orphanProduct = Product::factory()->create();
        $this->recordStatusEvent($orphanProduct, $admin, 'pending', 'rejected', $now->copy()->subDay());

        $this->actingAs($admin)
            ->getJson('/api/admin/metrics')
            ->assertOk()
            ->assertJsonPath('data.moderation_decisions_30d', 3)
            ->assertJsonPath('data.average_moderation_hours_30d', 5.7);

        $csv = $this->actingAs($admin)->get('/api/admin/metrics/export.csv')->assertOk()->streamedContent();
        $rows = array_map(fn (string $line): array => str_getcsv($line), explode("\n", preg_replace('/^\xEF\xBB\xBF/', '', trim($csv))));
        $this->assertContains(['moderación', 'decisiones humanas', '3', 'últimos 30 días'], $rows);
        $this->assertContains(['moderación', 'promedio hasta primera decisión (horas)', '5.7', 'decisiones de los últimos 30 días'], $rows);
        $this->assertStringNotContainsString($admin->email, $csv);
        foreach ([$product, $recentProduct, $oldProduct, $orphanProduct] as $moderatedProduct) {
            $this->assertStringNotContainsString($moderatedProduct->producer->user->email, $csv);
        }
    }

    private function recordStatusEvent(Product $product, User $actor, string $from, string $to, \DateTimeInterface $createdAt): void
    {
        DB::table('product_status_history')->insert([
            'product_id' => $product->id,
            'actor_id' => $actor->id,
            'from_status' => $from,
            'to_status' => $to,
            'reason' => 'Evento sintético de prueba.',
            'created_at' => $createdAt,
            'updated_at' => $createdAt,
        ]);
    }
}

