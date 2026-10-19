<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('search_events') && Schema::hasColumn('search_events', 'query_text')) {
            Schema::table('search_events', function (Blueprint $table): void {
                $table->dropColumn('query_text');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('search_events') && ! Schema::hasColumn('search_events', 'query_text')) {
            Schema::table('search_events', function (Blueprint $table): void {
                $table->string('query_text', 120)->nullable();
            });
        }
    }
};
