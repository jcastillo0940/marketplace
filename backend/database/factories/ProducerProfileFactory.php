<?php

namespace Database\Factories;

use App\Models\ProducerProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<ProducerProfile> */
class ProducerProfileFactory extends Factory
{
    protected $model = ProducerProfile::class;

    public function definition(): array
    {
        return ['user_id' => User::factory(), 'slug' => (string) Str::uuid(), 'public_name' => fake()->company(), 'phone_private' => '+50760000000', 'contact_level' => 'unverified', 'profile_status' => 'pending'];
    }
}
