<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_mfa_recovery_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('requester_user_id')->constrained('users')->cascadeOnDelete();
            $table->text('reason');
            $table->string('status', 32)->default('pending_first_approval');
            $table->timestamp('requested_at');
            $table->timestamp('expires_at');
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'expires_at', 'id'], 'mfa_recovery_status_expiry_idx');
            $table->index(['requester_user_id', 'status'], 'mfa_recovery_requester_status_idx');
        });

        Schema::create('admin_mfa_recovery_approvals', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('request_id')->constrained('admin_mfa_recovery_requests')->cascadeOnDelete();
            $table->foreignId('approver_id')->constrained('users')->restrictOnDelete();
            $table->string('decision', 12);
            $table->text('reason');
            $table->timestamp('decided_at');
            $table->unique(['request_id', 'approver_id'], 'mfa_recovery_request_approver_uq');
            $table->index(['request_id', 'decision'], 'mfa_recovery_request_decision_idx');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('mfa_recovery_locked_at')->nullable();
            $table->foreignId('mfa_recovery_request_id')->nullable()
                ->constrained('admin_mfa_recovery_requests')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('mfa_recovery_request_id');
            $table->dropColumn('mfa_recovery_locked_at');
        });
        Schema::dropIfExists('admin_mfa_recovery_approvals');
        Schema::dropIfExists('admin_mfa_recovery_requests');
    }
};
