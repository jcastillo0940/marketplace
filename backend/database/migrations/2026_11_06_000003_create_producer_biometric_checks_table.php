<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('producer_biometric_checks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('producer_profile_id')->constrained()->cascadeOnDelete();
            $table->string('status', 20)->default('pending');
            // Images are removed as soon as an admin decides; only the outcome is kept.
            $table->string('selfie_path', 500)->nullable();
            $table->string('cedula_path', 500)->nullable();
            $table->decimal('match_distance', 5, 3)->nullable();
            $table->json('liveness_challenges');
            $table->foreignId('reviewed_by')->nullable()->constrained('admin_users')->nullOnDelete();
            $table->text('review_reason')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
            $table->index(['producer_profile_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('producer_biometric_checks');
    }
};
