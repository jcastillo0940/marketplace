<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function (): void {
            $locations = require database_path('data/panama_locations.php');

            foreach ($locations as $provinceName => $districts) {
                $provinceSlug = Str::slug($provinceName);

                $provinceId = DB::table('locations')
                    ->where('level', 'province')
                    ->where('slug', $provinceSlug)
                    ->value('id');

                if ($provinceId === null) {
                    $provinceId = DB::table('locations')->insertGetId([
                        'name' => $provinceName,
                        'slug' => $provinceSlug,
                        'level' => 'province',
                        'parent_id' => null,
                        'active' => true,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                } else {
                    DB::table('locations')->where('id', $provinceId)->update([
                        'name' => $provinceName,
                        'active' => true,
                        'updated_at' => now(),
                    ]);
                }

                foreach ($districts as $districtName => $corregimientos) {
                    $districtSlugBase = Str::slug($districtName);

                    // Prefer scoped slug when there's a province/district name collision
                    $districtSlugScoped = $provinceSlug . '-' . $districtSlugBase;

                    // Look up by scoped slug first (new format), then plain slug under this province
                    $districtRow = DB::table('locations')
                        ->where('level', 'district')
                        ->where(function ($q) use ($districtSlugBase, $districtSlugScoped, $provinceId) {
                            $q->where(function ($q2) use ($districtSlugScoped) {
                                $q2->where('slug', $districtSlugScoped);
                            })->orWhere(function ($q2) use ($districtSlugBase, $provinceId) {
                                $q2->where('slug', $districtSlugBase)->where('parent_id', $provinceId);
                            });
                        })
                        ->first(['id', 'slug']);

                    if ($districtRow === null) {
                        // Check if plain slug is taken by another record (e.g., a province)
                        $plainSlugTaken = DB::table('locations')
                            ->where('slug', $districtSlugBase)
                            ->exists();

                        $districtSlug = $plainSlugTaken ? $districtSlugScoped : $districtSlugBase;

                        $districtId = DB::table('locations')->insertGetId([
                            'name' => $districtName,
                            'slug' => $districtSlug,
                            'level' => 'district',
                            'parent_id' => $provinceId,
                            'active' => true,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                    } else {
                        $districtId = $districtRow->id;
                        DB::table('locations')->where('id', $districtId)->update([
                            'name' => $districtName,
                            'parent_id' => $provinceId,
                            'active' => true,
                            'updated_at' => now(),
                        ]);
                    }

                    // Re-fetch to get actual slug used
                    $districtSlug = DB::table('locations')->where('id', $districtId)->value('slug');

                    foreach ($corregimientos as $corregimientoName) {
                        $corrSlug = $districtSlug . '-' . Str::slug($corregimientoName);

                        $existing = DB::table('locations')
                            ->where('level', 'corregimiento')
                            ->where('slug', $corrSlug)
                            ->first(['id']);

                        if ($existing === null) {
                            DB::table('locations')->insert([
                                'name' => $corregimientoName,
                                'slug' => $corrSlug,
                                'level' => 'corregimiento',
                                'parent_id' => $districtId,
                                'active' => true,
                                'created_at' => now(),
                                'updated_at' => now(),
                            ]);
                        } else {
                            DB::table('locations')->where('id', $existing->id)->update([
                                'name' => $corregimientoName,
                                'parent_id' => $districtId,
                                'active' => true,
                                'updated_at' => now(),
                            ]);
                        }
                    }
                }
            }
        });
    }

    public function down(): void
    {
        // no rollback — locations may be referenced by producer_profiles
    }
};
