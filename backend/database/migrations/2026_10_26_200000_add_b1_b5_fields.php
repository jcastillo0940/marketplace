<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->string('vendor_type', 30)->default('productor')->after('activity');
            $table->json('payment_methods')->nullable()->after('vendor_type');
            $table->string('cedula_photo_path', 500)->nullable()->after('cedula');
            $table->string('pacto_social_path', 500)->nullable()->after('cedula_photo_path');
        });

        Schema::table('products', function (Blueprint $table): void {
            $table->string('minimum_order', 100)->nullable()->after('unit');
        });
    }

    public function down(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->dropColumn(['vendor_type', 'payment_methods', 'cedula_photo_path', 'pacto_social_path']);
        });

        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn('minimum_order');
        });
    }
};
