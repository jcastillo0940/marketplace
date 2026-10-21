<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $tree = [
            'Carnes' => [
                'Res', 'Cerdo', 'Pollo', 'Oveja', 'Chivo y Cabra',
                'Pato', 'Conejo', 'Embutidos y chorizos',
            ],
            'Pescados y mariscos' => [
                'Pescado fresco', 'Camarones', 'Cangrejos y langostas',
                'Pulpo y calamar', 'Ostras y almejas', 'Pescado seco y ahumado',
            ],
            'Lácteos y huevos' => [
                'Leche fresca', 'Quesos', 'Mantequilla y crema',
                'Yogur', 'Huevos de gallina', 'Huevos de pato y codorniz',
            ],
            'Frutas tropicales' => [
                'Plátano y banano', 'Mango', 'Papaya',
                'Piña', 'Sandía y melón', 'Naranja y cítricos',
                'Aguacate', 'Guanábana y mamón', 'Maracuyá y otros',
            ],
            'Verduras y hortalizas' => [
                'Tomate', 'Cebolla y ajo', 'Pimentón y ají',
                'Lechuga y hojas verdes', 'Pepino y calabacín',
                'Zanahoria y remolacha', 'Repollo y brócoli',
            ],
            'Tubérculos y raíces' => [
                'Yuca', 'Ñame', 'Otoe', 'Papa', 'Camote y Batata', 'Tiquisque',
            ],
            'Hierbas y especias' => [
                'Culantro y cilantro', 'Orégano y tomillo', 'Albahaca y menta',
                'Jengibre y cúrcuma', 'Achiote', 'Ají chombo y picantes',
            ],
            'Granos y cereales' => [
                'Arroz', 'Maíz', 'Frijoles y guandú',
                'Lentejas y garbanzos', 'Cebada y avena', 'Semillas y granos varios',
            ],
            'Café y cacao' => [
                'Café en grano', 'Café molido', 'Café procesado y geisha',
                'Cacao en pepa', 'Chocolate artesanal',
            ],
            'Miel y apicultura' => [
                'Miel de abeja', 'Polen y propóleos', 'Cera de abeja', 'Raspadura',
            ],
            'Panadería y repostería' => [
                'Pan artesanal', 'Tortas y pasteles', 'Galletas y bizcochitos',
                'Rosquillas y hojaldras', 'Empanadas y pasteles de maíz', 'Tamales y bollos',
            ],
            'Dulces y conservas' => [
                'Mermeladas y jaleas', 'Dulces típicos', 'Cocadas y confites',
                'Encurtidos y salsas', 'Conservas de frutas',
            ],
            'Bebidas artesanales' => [
                'Jugos y refrescos naturales', 'Chicha fermentada',
                'Vino y vinagre artesanal', 'Ron y licores', 'Agua de coco',
            ],
            'Plantas y viveros' => [
                'Plantas ornamentales', 'Plantas medicinales', 'Plantas frutales',
                'Semillas y esquejes', 'Abono orgánico y compost',
            ],
            'Artesanías' => [
                'Sombreros pintaos y cestería', 'Tejidos y bordados', 'Cerámica y barro',
                'Madera tallada', 'Joyería y bisutería', 'Cuero trabajado',
                'Molas y textiles', 'Figuritas y decoración',
            ],
            'Ropa y accesorios' => [
                'Polleras y trajes típicos', 'Ropa confeccionada',
                'Bolsos y carteras', 'Cinturones y sandalias',
            ],
            'Productos del hogar' => [
                'Jabones artesanales', 'Velas y aromaterapia',
                'Artículos de limpieza', 'Cestas y utensilios',
            ],
            'Otros productos' => [],
        ];

        $position = 0;
        $created = 0;

        foreach ($tree as $parentName => $children) {
            $parentSlug = Str::slug($parentName);
            $parent = Category::firstOrCreate(
                ['slug' => $parentSlug],
                ['name' => $parentName, 'parent_id' => null, 'position' => $position]
            );
            if ($parent->wasRecentlyCreated) {
                $created++;
            }
            $position++;

            foreach ($children as $childName) {
                $childSlug = $parentSlug . '-' . Str::slug($childName);
                $child = Category::firstOrCreate(
                    ['slug' => $childSlug],
                    ['name' => $childName, 'parent_id' => $parent->id, 'position' => 0]
                );
                if ($child->wasRecentlyCreated) {
                    $created++;
                }
            }
        }

        $this->command->info("Total en BD: " . Category::count() . " ({$created} nuevas creadas).");

        foreach (Category::whereNull('parent_id')->orderBy('position')->get() as $cat) {
            $subs = Category::where('parent_id', $cat->id)->count();
            $this->command->line("  [{$cat->id}] {$cat->name}" . ($subs ? " ({$subs} subcategorías)" : ''));
        }
    }
}
