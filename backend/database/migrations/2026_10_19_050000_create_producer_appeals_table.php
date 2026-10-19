<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            if (! Schema::hasColumn('producer_profiles', 'suspension_reason')) {
                $table->text('suspension_reason')->nullable();
            }
        });

        if (! Schema::hasTable('producer_appeals')) {
            Schema::create('producer_appeals', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('producer_profile_id')->constrained()->cascadeOnDelete();
                $table->foreignId('submitted_by')->constrained('users')->restrictOnDelete();
                $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('reason');
                $table->string('status', 24)->default('pending');
                $table->text('resolution_note')->nullable();
                $table->timestamp('submitted_at')->useCurrent();
                $table->timestamp('reviewed_at')->nullable();
                $table->timestamps();
                $table->index(['status', 'submitted_at']);
                $table->index(['producer_profile_id', 'status']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('producer_appeals');
        Schema::table('producer_profiles', function (Blueprint $table): void {
            if (Schema::hasColumn('producer_profiles', 'suspension_reason')) {
                $table->dropColumn('suspension_reason');
            }
        });
    }
};
