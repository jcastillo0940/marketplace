<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    private array $createdLocationIds = [];

    private bool $renamedLosSantosDistrict = false;

    /**
     * Herrera and Los Santos district names follow INEC, División Política
     * Administrativa, year 2023:
     * https://www.inec.gob.pa/archivos/P0705547520260325115152Algunas%20caract-Cartografia%20Demograf%C3%ADa%202023%20%28CSE%29.pdf
     * Keep the existing La Villa slug as a stable identifier for profiles
     * and saved filters while correcting its label.
     */
    public function up(): void
    {
        if (! Schema::hasTable('marketplace_migration_location_changes')) {
            Schema::create('marketplace_migration_location_changes', function (Blueprint $table): void {
                $table->string('migration', 120)->primary();
                $table->json('created_ids');
                $table->boolean('renamed_los_santos_district')->default(false);
                $table->timestamp('created_at');
            });
        }

        DB::transaction(function (): void {
            $this->createdLocationIds = [];
            $this->renamedLosSantosDistrict = false;
            $this->upLocations();

            DB::table('marketplace_migration_location_changes')->updateOrInsert(['migration' => '2026_10_19_130000_correct_azuero_reference_districts'], [
                'created_ids' => json_encode($this->createdLocationIds, JSON_THROW_ON_ERROR),
                'renamed_los_santos_district' => $this->renamedLosSantosDistrict,
                'created_at' => now(),
            ]);
        });
    }

    private function upLocations(): void
    {
        $azueroLocations = require database_path('data/azuero_locations.php');
        $provinceIds = [];
        foreach ($azueroLocations as $provinceName => $districts) {
            $provinceSlug = Str::slug($provinceName);
            $provinceId = DB::table('locations')->where('slug', $provinceSlug)->where('level', 'province')->value('id');
            if ($provinceId === null) {
                $provinceId = $this->insertLocation($provinceName, $provinceSlug, 'province', null);
                $this->createdLocationIds[] = $provinceId;
            }
            $provinceIds[$provinceName] = (int) $provinceId;
        }

        $losSantosId = DB::table('locations')->where('slug', 'los-santos')->where('level', 'province')->value('id');
        if ($losSantosId === null) {
            $losSantosId = $this->insertLocation('Los Santos', 'los-santos', 'province', null);
            $this->createdLocationIds[] = $losSantosId;
        }

        $renamed = DB::table('locations')
            ->where('slug', 'la-villa-de-los-santos')
            ->where('level', 'district')
            ->where('parent_id', $losSantosId)
            ->where('name', 'La Villa de Los Santos')
            ->update(['name' => 'Los Santos', 'updated_at' => now()]);
        $this->renamedLosSantosDistrict = $renamed > 0;

        foreach ($azueroLocations as $provinceName => $districts) {
            $provinceId = $provinceName === 'Los Santos' ? (int) $losSantosId : $provinceIds[$provinceName];
            foreach ($districts as $districtName => $corregimientos) {
                $districtSlug = $provinceName === 'Los Santos' && $districtName === 'Los Santos'
                    ? 'la-villa-de-los-santos'
                    : Str::slug($districtName);
                $districtId = $this->ensureLocation($districtName, $districtSlug, 'district', $provinceId);
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
    }

    public function down(): void
    {
        if (! Schema::hasTable('marketplace_migration_location_changes')) {
            return;
        }

        $change = DB::table('marketplace_migration_location_changes')
            ->where('migration', '2026_10_19_130000_correct_azuero_reference_districts')->first();
        if ($change === null) {
            return;
        }

        DB::transaction(function () use ($change): void {
            $createdIds = json_decode($change->created_ids, true, 512, JSON_THROW_ON_ERROR);
            foreach (array_reverse($createdIds) as $locationId) {
                $hasProducer = DB::table('producer_profiles')->where('location_id', $locationId)->exists();
                $hasChildren = DB::table('locations')->where('parent_id', $locationId)->exists();
                if (! $hasProducer && ! $hasChildren) {
                    DB::table('locations')->where('id', $locationId)->delete();
                }
            }

            if ($change->renamed_los_santos_district) {
                DB::table('locations')->where('slug', 'la-villa-de-los-santos')
                    ->where('level', 'district')->where('name', 'Los Santos')
                    ->update(['name' => 'La Villa de Los Santos', 'updated_at' => now()]);
            }

            DB::table('marketplace_migration_location_changes')
                ->where('migration', '2026_10_19_130000_correct_azuero_reference_districts')->delete();
        });

        Schema::dropIfExists('marketplace_migration_location_changes');
    }

    private function ensureLocation(string $name, string $slug, string $level, int $parentId): int
    {
        $existing = DB::table('locations')->where('slug', $slug)->first();
        if ($existing !== null) {
            if ($existing->level !== $level || (int) $existing->parent_id !== $parentId) {
                throw new RuntimeException("La localidad {$slug} ya existe fuera de la jerarquía de Azuero; no se modificó.");
            }

            return (int) $existing->id;
        }

        $locationId = $this->insertLocation($name, $slug, $level, $parentId);
        $this->createdLocationIds[] = $locationId;

        return $locationId;
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
