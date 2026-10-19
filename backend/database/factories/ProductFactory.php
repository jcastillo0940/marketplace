<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\ProducerProfile;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Product> */
class ProductFactory extends Factory
{
    protected $model = Product::class;

    public function definition(): array
    {
        $user = User::factory()->create();
        $profile = ProducerProfile::query()->where('user_id', $user->id)->first() ?? ProducerProfile::create(['user_id' => $user->id, 'slug' => (string) Str::uuid(), 'public_name' => fake()->company(), 'phone_private' => '+50760000000', 'profile_status' => 'active']);
        $category = Category::firstOrCreate(['slug' => 'del-campo'], ['name' => 'Del campo']);

        return ['producer_profile_id' => $profile->id, 'category_id' => $category->id, 'created_by' => $profile->user_id, 'slug' => (string) Str::uuid(), 'title' => fake()->words(3, true), 'description' => fake()->paragraph(), 'unit' => 'libra', 'price_type' => 'contact', 'currency' => 'PAB', 'delivery_method' => 'Acordar directamente', 'status' => 'draft'];
    }
}
