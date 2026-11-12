<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producer_biometric_checks', function (Blueprint $table): void {
            // Cosine similarity from the server-side model (OpenCV SFace); higher means more alike.
            $table->decimal('server_similarity', 5, 4)->nullable()->after('match_distance');
            // strong | possible | no_match | unavailable
            $table->string('server_result', 20)->nullable()->after('server_similarity');
            // automatic | admin
            $table->string('decision_source', 20)->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('producer_biometric_checks', function (Blueprint $table): void {
            $table->dropColumn(['server_similarity', 'server_result', 'decision_source']);
        });
    }
};
