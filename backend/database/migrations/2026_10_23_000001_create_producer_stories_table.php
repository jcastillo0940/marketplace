<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('producer_stories')) {
            return;
        }

        Schema::create('producer_stories', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('producer_profile_id')->constrained()->cascadeOnDelete();
            $table->foreignId('submitted_by')->constrained('users')->restrictOnDelete();
            $table->string('title', 120);
            $table->string('quote', 220)->nullable();
            $table->text('body');
            $table->string('video_provider', 16)->nullable();
            $table->string('video_id', 64)->nullable();
            $table->string('image_disk', 32)->nullable();
            $table->string('image_path')->nullable();
            $table->string('thumbnail_path')->nullable();
            $table->string('status', 24)->default('pending');
            $table->text('review_note')->nullable();
            $table->unsignedBigInteger('reviewed_by_admin_id')->nullable();
            $table->timestamp('submitted_at')->useCurrent();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('published_at')->nullable();
            $table->timestamps();
            $table->index(['status', 'published_at']);
            $table->index(['producer_profile_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('producer_stories');
    }
};
