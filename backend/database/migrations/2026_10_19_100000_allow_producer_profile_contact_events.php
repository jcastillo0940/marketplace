<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contact_events', function (Blueprint $table): void {
            $table->foreignId('product_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        if (DB::table('contact_events')->whereNull('product_id')->exists()) {
            throw new RuntimeException('Cannot restore required product_id while producer-level contact events exist.');
        }

        Schema::table('contact_events', function (Blueprint $table): void {
            $table->foreignId('product_id')->nullable(false)->change();
        });
    }
};
