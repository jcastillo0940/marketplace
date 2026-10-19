<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('search_events')) {
            Schema::create('search_events', function (Blueprint $table): void {
                $table->id();
                $table->string('query_text', 120)->nullable();
                $table->json('filters')->nullable();
                $table->timestamp('occurred_at')->useCurrent();
                $table->index('occurred_at');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('search_events');
    }
};
