<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('risk_signals')) {
            return;
        }

        Schema::create('risk_signals', function (Blueprint $table): void {
            $table->id();
            $table->string('signal_key', 191)->unique();
            $table->string('signal_type', 60);
            $table->string('resource_type', 24);
            $table->unsignedBigInteger('resource_id');
            $table->string('severity', 16)->default('warning');
            $table->text('explanation');
            $table->json('evidence');
            $table->string('status', 24)->default('open');
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->timestamps();
            $table->index(['status', 'severity', 'last_seen_at']);
            $table->index(['resource_type', 'resource_id', 'signal_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('risk_signals');
    }
};
