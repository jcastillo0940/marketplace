<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('product_status_history', 'admin_actor_id')) {
            Schema::table('product_status_history', function (Blueprint $table): void {
                $table->unsignedBigInteger('admin_actor_id')->nullable()->after('actor_id');
            });
        }
        if (! Schema::hasColumn('audit_logs', 'admin_actor_id')) {
            Schema::table('audit_logs', function (Blueprint $table): void {
                $table->unsignedBigInteger('admin_actor_id')->nullable()->after('actor_id');
            });
        }
        if (! Schema::hasColumn('producer_trust_reviews', 'admin_actor_id')) {
            Schema::table('producer_trust_reviews', function (Blueprint $table): void {
                $table->unsignedBigInteger('admin_actor_id')->nullable()->after('actor_id');
            });
        }
    }

    public function down(): void
    {
        Schema::table('product_status_history', function (Blueprint $table): void {
            $table->dropColumn('admin_actor_id');
        });
        Schema::table('audit_logs', function (Blueprint $table): void {
            $table->dropColumn('admin_actor_id');
        });
        Schema::table('producer_trust_reviews', function (Blueprint $table): void {
            $table->dropColumn('admin_actor_id');
        });
    }
};
