<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function (): void {
            $locations = require database_path('data/azuero_locations.php');

            foreach ($locations as $provinceName => $districts) {
                $provinceSlug = Str::slug($provinceName);
                $provinceId = DB::table('locations')
                    ->where('slug', $provinceSlug)
                    ->where('level', 'province')
                    ->value('id');
                if ($provinceId === null) {
                    $provinceId = $this->insertLocation($provinceName, $provinceSlug, 'province', null);
                }

                $expectedDistrictSlugs = [];
                foreach ($districts as $districtName => $corregimientos) {
                    $districtSlug = Str::slug($districtName);
                    $expectedDistrictSlugs[] = $districtSlug;

                    $districtId = DB::table('locations')->where('slug', $districtSlug)->value('id');
                    if ($districtId === null) {
                        $districtId = $this->insertLocation($districtName, $districtSlug, 'district', (int) $provinceId);
                    } else {
                        DB::table('locations')->where('id', $districtId)->update([
                            'name' => $districtName,
                            'parent_id' => $provinceId,
                            'active' => true,
                            'updated_at' => now(),
                        ]);
                    }

                    $expectedCorregimientoSlugs = [];
                    foreach ($corregimientos as $corregimientoName) {
                        $corregimientoSlug = $districtSlug . '-' . Str::slug($corregimientoName);
                        $expectedCorregimientoSlugs[] = $corregimientoSlug;

                        $existing = DB::table('locations')->where('slug', $corregimientoSlug)->first();
                        if ($existing === null) {
                            $this->insertLocation($corregimientoName, $corregimientoSlug, 'corregimiento', (int) $districtId);
                        } else {
                            DB::table('locations')->where('id', $existing->id)->update([
                                'name' => $corregimientoName,
                                'parent_id' => $districtId,
                                'active' => true,
                                'updated_at' => now(),
                            ]);
                        }
                    }

                    // deactivate corregimientos no longer in the official list
                    DB::table('locations')
                        ->where('parent_id', $districtId)
                        ->where('level', 'corregimiento')
                        ->whereNotIn('slug', $expectedCorregimientoSlugs)
                        ->whereNotExists(function ($q) {
                            $q->select(DB::raw(1))
                                ->from('producer_profiles')
                                ->whereColumn('producer_profiles.location_id', 'locations.id');
                        })
                        ->update(['active' => false, 'updated_at' => now()]);
                }

                // deactivate districts no longer in the official list
                DB::table('locations')
                    ->where('parent_id', $provinceId)
                    ->where('level', 'district')
                    ->whereNotIn('slug', $expectedDistrictSlugs)
                    ->whereNotExists(function ($q) {
                        $q->select(DB::raw(1))
                            ->from('producer_profiles')
                            ->whereColumn('producer_profiles.location_id', 'locations.id');
                    })
                    ->update(['active' => false, 'updated_at' => now()]);
            }
        });
    }

    public function down(): void
    {
        // re-activating removed records is not safe without the prior state; no-op
    }

    private function insertLocation(string $name, string $slug, string $level, ?int $parentId): int
    {
        return (int) DB::table('locations')->insertGetId([
            'parent_id' => $parentId,
            'level' => $level,
            'name' => $name,
            'slug' => $slug,
            'active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
};
