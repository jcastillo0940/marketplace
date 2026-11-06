<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('units', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name', 60);
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        $units = [
            'lb' => 'Libra (lb)', 'kg' => 'Kilogramo (kg)', 'unidad' => 'Unidad', 'docena' => 'Docena', 'caja' => 'Caja',
            'quintal' => 'Quintal', 'saco' => 'Saco', 'galón' => 'Galón', 'litro' => 'Litro',
        ];
        $position = 0;
        foreach ($units as $code => $name) {
            DB::table('units')->insert(['code' => $code, 'name' => $name, 'position' => $position++, 'active' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('units');
    }
};
