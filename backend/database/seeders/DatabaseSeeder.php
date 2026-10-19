<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Location;
use App\Models\MessageTemplate;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $permissions = collect(['products.review', 'reports.manage', 'producers.assist', 'producers.suspend', 'producers.verify', 'producers.appeals.manage', 'catalogs.manage', 'messages.manage', 'analytics.view', 'audit.view', 'users.manage', 'security.alerts.view', 'security.alerts.manage', 'security.mfa_recovery.review']);
        $permissions->each(fn (string $name) => Permission::firstOrCreate(['name' => $name], ['description' => str_replace('.', ' ', $name)]));
        $roles = [
            'producer' => ['display_name' => 'Productor', 'permissions' => []],
            'support_operator' => ['display_name' => 'Operador de apoyo', 'permissions' => ['producers.assist']],
            'moderator' => ['display_name' => 'Moderador', 'permissions' => ['products.review', 'reports.manage', 'producers.suspend', 'producers.appeals.manage', 'security.alerts.view', 'security.alerts.manage']],
            'analyst' => ['display_name' => 'Analista', 'permissions' => ['analytics.view']],
            'admin' => ['display_name' => 'Administrador', 'permissions' => ['products.review', 'reports.manage', 'producers.assist', 'producers.verify', 'producers.appeals.manage', 'catalogs.manage', 'messages.manage', 'analytics.view', 'audit.view', 'users.manage', 'security.alerts.view', 'security.alerts.manage', 'security.mfa_recovery.review']],
            'super_admin' => ['display_name' => 'Superadministrador', 'permissions' => $permissions->all()],
        ];
        foreach ($roles as $name => $config) {
            $role = Role::firstOrCreate(['name' => $name], ['display_name' => $config['display_name']]);
            $role->permissions()->sync(Permission::whereIn('name', $config['permissions'])->pluck('id'));
        }
        foreach ([
            'product' => 'Hola, vi tu oferta de {product_title} en El Empujoncito. ¿Sigue disponible?',
            'producer' => 'Hola, encontré el perfil de {producer_name} en El Empujoncito. ¿Me puedes contar sobre tus ofertas?',
        ] as $key => $body) {
            MessageTemplate::query()->firstOrCreate(['key' => $key], ['body' => $body]);
        }
        foreach (['Frutas y verduras', 'Del campo', 'Artesanías', 'Otros productos'] as $position => $name) {
            Category::firstOrCreate(['slug' => Str::slug($name)], ['name' => $name, 'position' => $position]);
        }
        $azueroLocations = require database_path('data/azuero_locations.php');
        foreach ($azueroLocations as $provinceName => $districts) {
            $province = Location::firstOrCreate(
                ['slug' => Str::slug($provinceName)],
                ['level' => 'province', 'name' => $provinceName, 'active' => true],
            );

            foreach ($districts as $districtName => $corregimientos) {
                $districtSlug = $provinceName === 'Los Santos' && $districtName === 'Los Santos'
                    ? 'la-villa-de-los-santos'
                    : Str::slug($districtName);
                $district = Location::firstOrCreate(
                    ['slug' => $districtSlug],
                    ['parent_id' => $province->id, 'level' => 'district', 'name' => $districtName, 'active' => true],
                );
                if ($district->level !== 'district' || (int) $district->parent_id !== (int) $province->id) {
                    throw new \RuntimeException("La localidad {$districtSlug} ya existe fuera de la jerarquía esperada.");
                }
                foreach ($corregimientos as $corregimientoName) {
                    $corregimientoSlug = $district->slug.'-'.Str::slug($corregimientoName);
                    $corregimiento = Location::firstOrCreate(
                        ['slug' => $corregimientoSlug],
                        ['parent_id' => $district->id, 'level' => 'corregimiento', 'name' => $corregimientoName, 'active' => true],
                    );
                    if ($corregimiento->level !== 'corregimiento' || (int) $corregimiento->parent_id !== (int) $district->id) {
                        throw new \RuntimeException("La localidad {$corregimientoSlug} ya existe fuera de la jerarquía esperada.");
                    }
                }
            }
        }

    }
}
