<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->string('cedula', 30)->nullable()->unique()->after('phone_private');
        });
    }

    public function down(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->dropColumn('cedula'); // unique index is dropped automatically
        });
    }
};
