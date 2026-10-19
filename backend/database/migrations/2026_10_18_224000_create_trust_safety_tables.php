<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('account_restrictions')) {
            return;
        }
        if (! Schema::hasTable('producer_verifications')) {
            Schema::create('producer_verifications', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('producer_profile_id')->constrained()->cascadeOnDelete();
                $table->string('channel', 20);
                $table->string('status', 20)->default('pending');
                $table->timestamp('verified_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();
                $table->index(['producer_profile_id', 'status']);
            });
        }
        if (! Schema::hasTable('verification_attempts')) {
            Schema::create('verification_attempts', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('producer_verification_id')->constrained()->cascadeOnDelete();
                $table->string('result', 24);
                $table->timestamp('attempted_at')->useCurrent();
                $table->index(['producer_verification_id', 'attempted_at'], 'verification_attempt_time_idx');
            });
        }
        if (! Schema::hasTable('contact_events')) {
            Schema::create('contact_events', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('product_id')->constrained()->cascadeOnDelete();
                $table->foreignId('producer_profile_id')->constrained()->cascadeOnDelete();
                $table->string('channel', 20);
                $table->string('dedupe_key', 64);
                $table->timestamp('occurred_at')->useCurrent();
                $table->unique('dedupe_key', 'contact_dedupe_key_uq');
                $table->index(['producer_profile_id', 'occurred_at']);
            });
        }
        if (! Schema::hasTable('reports')) {
            Schema::create('reports', function (Blueprint $table): void {
                $table->id();
                $table->uuid('public_reference')->unique();
                $table->foreignId('reporter_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('assignee_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('resource_type', 24);
                $table->unsignedBigInteger('resource_id');
                $table->string('reason_code', 40);
                $table->text('description');
                $table->string('contact_email')->nullable();
                $table->string('status', 24)->default('new');
                $table->string('priority', 16)->default('normal');
                $table->timestamp('resolved_at')->nullable();
                $table->timestamps();
                $table->index(['status', 'priority', 'created_at']);
                $table->index(['resource_type', 'resource_id']);
            });
        }
        if (! Schema::hasTable('report_evidence')) {
            Schema::create('report_evidence', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('report_id')->constrained()->cascadeOnDelete();
                $table->string('private_disk', 50)->default('local');
                $table->string('private_path', 255);
                $table->string('mime_type', 100);
                $table->unsignedBigInteger('size_bytes');
                $table->timestamps();
            });
        }
        if (! Schema::hasTable('security_events')) {
            Schema::create('security_events', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
                $table->string('event_type', 60);
                $table->string('severity', 16)->default('info');
                $table->json('metadata')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->index(['event_type', 'created_at']);
            });
        }
        if (! Schema::hasTable('account_restrictions')) {
            Schema::create('account_restrictions', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('imposed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->string('restriction_type', 40);
                $table->text('reason');
                $table->timestamp('starts_at');
                $table->timestamp('ends_at')->nullable();
                $table->timestamps();
                $table->index(['user_id', 'starts_at', 'ends_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('account_restrictions');
        Schema::dropIfExists('security_events');
        Schema::dropIfExists('report_evidence');
        Schema::dropIfExists('reports');
        Schema::dropIfExists('contact_events');
        Schema::dropIfExists('verification_attempts');
        Schema::dropIfExists('producer_verifications');
    }
};
