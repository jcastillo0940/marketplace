<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * user_roles.assigned_by had a FK to users, but role assignment is performed
 * exclusively by AdminUser actors (via the auth:admin route). The column was
 * always written as NULL because an AdminUser ID cannot satisfy a FK to users.
 * This migration drops that FK and adds assigned_by_admin_id → admin_users so
 * the assigner's identity is recorded correctly.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_roles', function (Blueprint $table): void {
            $table->dropForeign(['assigned_by']);
            $table->unsignedBigInteger('assigned_by_admin_id')->nullable()->after('assigned_by');
            $table->foreign('assigned_by_admin_id')->references('id')->on('admin_users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('user_roles', function (Blueprint $table): void {
            $table->dropForeign(['assigned_by_admin_id']);
            $table->dropColumn('assigned_by_admin_id');
            $table->foreign('assigned_by')->references('id')->on('users')->nullOnDelete();
        });
    }
};
