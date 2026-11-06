<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The approver of an MFA recovery request can be either a User (internal staff) or
 * an AdminUser (via the admin panel). The original schema only referenced users, which
 * caused a FK violation when AdminUser actors wrote their IDs. This migration converts
 * the column to a polymorphic pair (approver_type + approver_id) and updates the unique
 * constraint so that User id=N and AdminUser id=N are never confused.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Step 1: drop the old unique constraint and FK, then add the column (nullable
        // so existing rows are not rejected before the backfill runs).
        Schema::table('admin_mfa_recovery_approvals', function (Blueprint $table): void {
            $table->dropUnique('mfa_recovery_request_approver_uq');
            $table->dropForeign(['approver_id']);
            $table->string('approver_type', 20)->nullable()->after('approver_id');
        });

        // Step 2: backfill — all rows written before this migration used the users table.
        \DB::table('admin_mfa_recovery_approvals')
            ->whereNull('approver_type')
            ->update(['approver_type' => 'user']);

        // Step 3: add the new composite unique constraint scoped to entity type so that
        // User id=3 and AdminUser id=3 occupy distinct slots.
        Schema::table('admin_mfa_recovery_approvals', function (Blueprint $table): void {
            $table->unique(['request_id', 'approver_type', 'approver_id'], 'mfa_recovery_request_approver_uq');
        });
    }

    public function down(): void
    {
        Schema::table('admin_mfa_recovery_approvals', function (Blueprint $table): void {
            $table->dropUnique('mfa_recovery_request_approver_uq');
            $table->dropColumn('approver_type');
            $table->foreign('approver_id')->references('id')->on('users')->restrictOnDelete();
            $table->unique(['request_id', 'approver_id'], 'mfa_recovery_request_approver_uq');
        });
    }
};
