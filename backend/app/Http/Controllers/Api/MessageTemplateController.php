<?php

namespace App\Http\Controllers\Api;

use App\Models\AuditLog;
use App\Models\MessageTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class MessageTemplateController
{
    private const LABELS = ['product' => 'producto', 'producer' => 'productor'];

    private const DEFAULTS = [
        'product' => 'Hola, vi tu oferta de {product_title} en Mercado Solidario. ¿Sigue disponible?',
        'producer' => 'Hola, encontré el perfil de {producer_name} en Mercado Solidario. ¿Me puedes contar sobre tus ofertas?',
    ];

    public function public(): JsonResponse
    {
        $templates = MessageTemplate::query()->whereIn('key', array_keys(self::DEFAULTS))->pluck('body', 'key');

        return response()->json(['data' => [
            'product' => $templates['product'] ?? self::DEFAULTS['product'],
            'producer' => $templates['producer'] ?? self::DEFAULTS['producer'],
        ]]);
    }

    public function index(): JsonResponse
    {
        Gate::authorize('messages.manage');

        return response()->json(['data' => collect(self::DEFAULTS)->map(fn (string $default, string $key) => $this->resource(
            MessageTemplate::query()->with('updater')->firstOrCreate(['key' => $key], ['body' => $default])
        ))->values()]);
    }

    public function update(Request $request, string $key): JsonResponse
    {
        Gate::authorize('messages.manage');
        abort_unless(array_key_exists($key, self::DEFAULTS), 404);

        $request->merge(['body' => is_string($request->input('body')) ? trim($request->input('body')) : $request->input('body')]);
        $validated = $request->validate(['body' => ['required', 'string', 'min:10', 'max:500']]);
        $required = $key === 'product' ? '{product_title}' : '{producer_name}';
        if (! str_contains($validated['body'], $required)) {
            throw ValidationException::withMessages(['body' => "La plantilla debe incluir la variable {$required}."]);
        }
        preg_match_all('/\{([a-z_]+)\}/', $validated['body'], $matches);
        $allowed = $key === 'product' ? ['product_title', 'producer_name'] : ['producer_name'];
        $unknown = array_diff(array_unique($matches[1]), $allowed);
        if ($unknown !== []) {
            throw ValidationException::withMessages(['body' => 'La plantilla contiene variables no admitidas: '.implode(', ', $unknown).'.']);
        }

        $template = DB::transaction(function () use ($request, $key, $validated): MessageTemplate {
            $template = MessageTemplate::query()->where('key', $key)->lockForUpdate()->firstOrCreate(
                ['key' => $key], ['body' => self::DEFAULTS[$key]]
            );
            $before = ['body' => $template->body, 'version' => $template->version];
            $template->fill(['body' => $validated['body'], 'version' => $template->version + 1, 'updated_by' => $request->user()->id]);
            $template->save();
            AuditLog::query()->create([
                'actor_id' => $request->user()->id,
                'action' => 'message_template.updated',
                'resource_type' => 'message_template',
                'resource_id' => $template->id,
                'before_values' => $before,
                'after_values' => ['body' => $template->body, 'version' => $template->version],
                'reason' => 'Actualizó la plantilla de contacto de '.self::LABELS[$key].'.',
                'created_at' => now(),
            ]);

            return $template->load('updater');
        });

        return response()->json(['data' => $this->resource($template)]);
    }

    private function resource(MessageTemplate $template): array
    {
        $history = AuditLog::query()->with('actor')->where('resource_type', 'message_template')
            ->where('resource_id', $template->id)->where('action', 'message_template.updated')
            ->latest('created_at')->limit(5)->get()->map(fn (AuditLog $audit): array => [
                'version' => $audit->after_values['version'] ?? null,
                'body' => $audit->after_values['body'] ?? null,
                'updated_at' => $audit->created_at,
                'updated_by' => $audit->actor?->name,
            ])->values();

        return [
            'key' => $template->key,
            'label' => self::LABELS[$template->key],
            'body' => $template->body,
            'version' => $template->version,
            'updated_at' => $template->updated_at,
            'updated_by' => $template->updater ? ['id' => $template->updater->id, 'name' => $template->updater->name] : null,
            'history' => $history,
        ];
    }
}
