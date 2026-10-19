<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->foreignId('registered_by')->nullable()->after('user_id')->constrained('users')->nullOnDelete();
            $table->string('registration_method', 24)->default('self')->after('registered_by');
        });
    }

    public function down(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('registered_by');
            $table->dropColumn('registration_method');
        });
    }
};
