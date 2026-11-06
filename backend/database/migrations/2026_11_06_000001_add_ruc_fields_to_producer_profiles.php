<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->string('ruc', 30)->nullable()->unique()->after('cedula');
            $table->string('ruc_dv', 2)->nullable()->after('ruc');
            $table->string('aviso_operacion_path', 500)->nullable()->after('pacto_social_path');
        });
    }

    public function down(): void
    {
        Schema::table('producer_profiles', function (Blueprint $table): void {
            $table->dropUnique(['ruc']);
            $table->dropColumn(['ruc', 'ruc_dv', 'aviso_operacion_path']);
        });
    }
};
