<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use RuntimeException;
use Tests\TestCase;

class ExampleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    /**
     * A basic test example.
     */
    public function test_the_application_returns_a_successful_response(): void
    {
        $response = $this->get('/');

        $response->assertStatus(200);
    }

    public function test_health_endpoint_reports_liveness_without_database_dependency(): void
    {
        $this->getJson('/api/health')->assertOk()->assertExactJson(['status' => 'ok']);
    }

    public function test_readiness_endpoint_reports_database_cache_and_redis_health(): void
    {
        $redis = \Mockery::mock();
        $redis->shouldReceive('ping')->once()->andReturn('PONG');
        Redis::shouldReceive('connection')->once()->andReturn($redis);

        $this->getJson('/api/ready')->assertOk()->assertExactJson([
            'status' => 'ready',
            'checks' => ['database' => 'ok', 'cache' => 'ok', 'redis' => 'ok'],
            'setup' => ['reference_data' => 'ready'],
        ]);
    }

    public function test_readiness_endpoint_returns_service_unavailable_when_redis_is_down(): void
    {
        Redis::shouldReceive('connection')->once()->andThrow(new RuntimeException('Redis unavailable'));

        $this->getJson('/api/ready')
            ->assertStatus(503)
            ->assertExactJson(['status' => 'not_ready']);
    }

    public function test_readiness_endpoint_returns_service_unavailable_when_database_is_down(): void
    {
        DB::shouldReceive('select')->once()->with('SELECT 1')->andThrow(new RuntimeException('Database unavailable'));

        $this->getJson('/api/ready')
            ->assertStatus(503)
            ->assertExactJson(['status' => 'not_ready']);
    }

    public function test_readiness_endpoint_returns_service_unavailable_when_cache_is_down(): void
    {
        config(['session.driver' => 'array']);
        Cache::shouldReceive('put')->once()->with('health:readiness', 'ok', 5)->andThrow(new RuntimeException('Cache unavailable'));

        $this->getJson('/api/ready')
            ->assertStatus(503)
            ->assertExactJson(['status' => 'not_ready']);
    }
}
