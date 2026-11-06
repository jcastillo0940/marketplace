<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $bodies = [
            'product' => 'Hola, vi tu oferta de {product_title} en Mercapro. ¿Sigue disponible?',
            'producer' => 'Hola, encontré el perfil de {producer_name} en Mercapro. ¿Me puedes contar sobre tus ofertas?',
        ];

        foreach ($bodies as $key => $body) {
            DB::table('message_templates')->where('key', $key)->where('body', 'like', '%Empujoncito%')
                ->update(['body' => $body, 'version' => DB::raw('version + 1'), 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        // The previous wording belonged to the retired brand and is not restored.
    }
};
