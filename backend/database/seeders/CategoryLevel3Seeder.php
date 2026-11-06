<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Third category level. Run by hand once the tree has been reviewed:
 * php artisan db:seed --class=CategoryLevel3Seeder --force
 * It is deliberately not called from DatabaseSeeder.
 */
class CategoryLevel3Seeder extends Seeder
{
    private const TREE = [
        'Leche fresca' => ['Leche grado A', 'Leche grado B', 'Leche de cabra'],
        'Quesos' => ['Queso blanco', 'Queso prensado', 'Queso mozzarella', 'Queso de cabra', 'Queso ahumado'],
        'Res' => ['Cortes de res', 'Carne molida de res', 'Vísceras de res'],
        'Cerdo' => ['Cortes de cerdo', 'Carne molida de cerdo', 'Costillas de cerdo'],
        'Pollo' => ['Pollo entero', 'Presas de pollo', 'Pollo de patio'],
        'Pescado fresco' => ['Corvina', 'Pargo', 'Tilapia', 'Atún'],
        'Miel de abeja' => ['Miel multifloral', 'Miel de una sola flor', 'Miel en panal'],
        'Arroz' => ['Arroz en cáscara', 'Arroz pilado', 'Arroz de monte'],
        'Café en grano' => ['Café verde', 'Café tostado'],
        'Sombreros pintaos y cestería' => ['Sombrero pintao', 'Sombrero de junco', 'Canastas y cestas'],
        'Molas y textiles' => ['Molas', 'Blusas con mola', 'Tejidos gunas'],
        'Joyería y bisutería' => ['Joyería en plata', 'Bisutería', 'Tembleques'],
    ];

    public function run(): void
    {
        foreach (self::TREE as $parentName => $children) {
            $parent = Category::query()->where('name', $parentName)->whereNotNull('parent_id')->first();
            if (! $parent) {
                $this->command->warn("No existe la subcategoría: {$parentName}");

                continue;
            }

            foreach ($children as $position => $name) {
                Category::firstOrCreate(
                    ['slug' => Str::slug($parent->name.' '.$name)],
                    ['name' => $name, 'parent_id' => $parent->id, 'position' => $position, 'active' => true],
                );
            }
        }
    }
}
