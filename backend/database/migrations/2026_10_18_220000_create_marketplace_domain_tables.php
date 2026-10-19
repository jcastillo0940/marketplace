<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('roles')) {
            Schema::create('roles', function (Blueprint $table) {
                $table->id();
                $table->string('name', 60)->unique();
                $table->string('display_name', 100);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('permissions')) {
            Schema::create('permissions', function (Blueprint $table) {
                $table->id();
                $table->string('name', 100)->unique();
                $table->string('description', 255)->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('role_permissions')) {
            Schema::create('role_permissions', function (Blueprint $table) {
                $table->foreignId('role_id')->constrained()->cascadeOnDelete();
                $table->foreignId('permission_id')->constrained()->cascadeOnDelete();
                $table->primary(['role_id', 'permission_id']);
            });
        }

        if (! Schema::hasTable('user_roles')) {
            Schema::create('user_roles', function (Blueprint $table) {
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('role_id')->constrained()->cascadeOnDelete();
                $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('assigned_at')->useCurrent();
                $table->primary(['user_id', 'role_id']);
            });
        }

        if (! Schema::hasTable('locations')) {
            Schema::create('locations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('parent_id')->nullable()->constrained('locations')->nullOnDelete();
                $table->string('level', 24);
                $table->string('name', 100);
                $table->string('slug', 120)->unique();
                $table->boolean('active')->default(true);
                $table->timestamps();
                $table->index(['parent_id', 'level', 'active']);
            });
        }

        if (! Schema::hasTable('categories')) {
            Schema::create('categories', function (Blueprint $table) {
                $table->id();
                $table->foreignId('parent_id')->nullable()->constrained('categories')->nullOnDelete();
                $table->string('name', 100);
                $table->string('slug', 120)->unique();
                $table->boolean('active')->default(true);
                $table->unsignedSmallInteger('position')->default(0);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('producer_profiles')) {
            Schema::create('producer_profiles', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
                $table->foreignId('location_id')->nullable()->constrained('locations')->nullOnDelete();
                $table->string('slug', 140)->unique();
                $table->string('public_name', 120);
                $table->string('activity', 120)->nullable();
                $table->string('phone_private', 40);
                $table->string('phone_public', 40)->nullable();
                $table->timestamp('phone_verified_at')->nullable();
                $table->string('contact_level', 40)->default('unverified');
                $table->string('profile_status', 32)->default('pending');
                $table->text('description')->nullable();
                $table->timestamps();
                $table->index(['location_id', 'profile_status']);
            });
        }

        if (! Schema::hasTable('producer_consents')) {
            Schema::create('producer_consents', function (Blueprint $table) {
                $table->id();
                $table->foreignId('producer_profile_id')->constrained()->cascadeOnDelete();
                $table->string('consent_type', 50);
                $table->string('version', 40);
                $table->timestamp('accepted_at');
                $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['producer_profile_id', 'consent_type', 'accepted_at'], 'consent_profile_type_time_idx');
            });
        }

        if (! Schema::hasTable('products')) {
            Schema::create('products', function (Blueprint $table) {
                $table->id();
                $table->foreignId('producer_profile_id')->constrained()->cascadeOnDelete();
                $table->foreignId('category_id')->constrained()->restrictOnDelete();
                $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
                $table->string('slug', 160)->unique();
                $table->string('title', 120);
                $table->text('description');
                $table->string('unit', 40);
                $table->string('price_type', 20)->default('contact');
                $table->decimal('price_amount', 10, 2)->nullable();
                $table->string('currency', 3)->default('PAB');
                $table->decimal('stock_quantity', 10, 2)->nullable();
                $table->string('delivery_method', 120);
                $table->string('status', 32)->default('draft');
                $table->timestamp('published_at')->nullable();
                $table->timestamps();
                $table->index(['status', 'published_at', 'id']);
                $table->index(['category_id', 'status']);
                $table->index(['title', 'created_at']);
            });
        }

        if (! Schema::hasTable('product_images')) {
            Schema::create('product_images', function (Blueprint $table) {
                $table->id();
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
                $table->string('disk', 50)->default('public');
                $table->string('path', 255);
                $table->string('alt_text', 160)->nullable();
                $table->unsignedTinyInteger('position');
                $table->boolean('is_public')->default(false);
                $table->timestamps();
                $table->unique(['product_id', 'position']);
            });
        }

        if (! Schema::hasTable('product_status_history')) {
            Schema::create('product_status_history', function (Blueprint $table) {
                $table->id();
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('from_status', 32)->nullable();
                $table->string('to_status', 32);
                $table->text('reason')->nullable();
                $table->timestamps();
                $table->index(['product_id', 'created_at']);
            });
        }

        if (! Schema::hasTable('audit_logs')) {
            Schema::create('audit_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('actor_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('action', 100);
                $table->string('resource_type', 100);
                $table->unsignedBigInteger('resource_id')->nullable();
                $table->json('before_values')->nullable();
                $table->json('after_values')->nullable();
                $table->text('reason')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->index(['resource_type', 'resource_id', 'created_at']);
                $table->index(['actor_id', 'created_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('product_status_history');
        Schema::dropIfExists('product_images');
        Schema::dropIfExists('products');
        Schema::dropIfExists('producer_consents');
        Schema::dropIfExists('producer_profiles');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('locations');
        Schema::dropIfExists('user_roles');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
    }
};
