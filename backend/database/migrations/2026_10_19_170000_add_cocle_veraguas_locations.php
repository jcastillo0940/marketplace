<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    private array $createdLocationIds = [];

    public function up(): void
    {
        DB::transaction(function (): void {
            $this->createdLocationIds = [];
            $locations = require database_path('data/azuero_locations.php');
            foreach (['Coclé', 'Veraguas'] as $targetProvince) {
                if (! isset($locations[$targetProvince])) {
                    continue;
                }
                $provinceSlug = Str::slug($targetProvince);
                $provinceId = DB::table('locations')->where('slug', $provinceSlug)->where('level', 'province')->value('id');
                if ($provinceId === null) {
                    $provinceId = $this->insertLocation($targetProvince, $provinceSlug, 'province', null);
                }
                foreach ($locations[$targetProvince] as $districtName => $corregimientos) {
                    $districtSlug = Str::slug($districtName);
                    $districtId = $this->ensureLocation($districtName, $districtSlug, 'district', (int) $provinceId);
                    foreach ($corregimientos as $corregimientoName) {
                        $this->ensureLocation(
                            $corregimientoName,
                            $districtSlug.'-'.Str::slug($corregimientoName),
                            'corregimiento',
                            $districtId,
                        );
                    }
                }
            }
        });
    }

    public function down(): void
    {
        DB::transaction(function (): void {
            foreach (['Coclé', 'Veraguas'] as $provinceName) {
                $provinceSlug = Str::slug($provinceName);
                $province = DB::table('locations')->where('slug', $provinceSlug)->where('level', 'province')->first();
                if ($province === null) {
                    continue;
                }
                $hasProducer = DB::table('producer_profiles')->where('location_id', $province->id)->exists();
                if ($hasProducer) {
                    continue;
                }
                $districts = DB::table('locations')->where('parent_id', $province->id)->where('level', 'district')->get(['id']);
                foreach ($districts as $district) {
                    $hasDistrictProducer = DB::table('producer_profiles')->where('location_id', $district->id)->exists();
                    if ($hasDistrictProducer) {
                        continue;
                    }
                    $corregimientos = DB::table('locations')->where('parent_id', $district->id)->where('level', 'corregimiento')->get(['id']);
                    foreach ($corregimientos as $corregimiento) {
                        $inUse = DB::table('producer_profiles')->where('location_id', $corregimiento->id)->exists();
                        if (! $inUse) {
                            DB::table('locations')->where('id', $corregimiento->id)->delete();
                        }
                    }
                    if (! DB::table('locations')->where('parent_id', $district->id)->exists()) {
                        DB::table('locations')->where('id', $district->id)->delete();
                    }
                }
                if (! DB::table('locations')->where('parent_id', $province->id)->exists()) {
                    DB::table('locations')->where('id', $province->id)->delete();
                }
            }
        });
    }

    private function ensureLocation(string $name, string $slug, string $level, int $parentId): int
    {
        $existing = DB::table('locations')->where('slug', $slug)->first();
        if ($existing !== null) {
            return (int) $existing->id;
        }

        return $this->insertLocation($name, $slug, $level, $parentId);
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
