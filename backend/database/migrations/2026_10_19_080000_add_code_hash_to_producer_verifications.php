<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producer_verifications', function (Blueprint $table): void {
            $table->string('code_hash')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('producer_verifications', function (Blueprint $table): void {
            $table->dropColumn('code_hash');
        });
    }
};
