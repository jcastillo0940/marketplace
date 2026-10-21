<?php

namespace App\Services;

use App\Enums\ProductStatus;
use App\Models\AuditLog;
use App\Models\ProducerProfile;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ProductWorkflow
{
    private const PRODUCER_TRANSITIONS = [
        'draft' => ['pending', 'withdrawn'],
        'pending' => ['withdrawn'],
        'changes_requested' => ['pending', 'withdrawn'],
        'rejected' => ['pending', 'withdrawn'],
        'published' => ['paused', 'sold_out', 'withdrawn'],
        'paused' => ['published', 'withdrawn'],
        'sold_out' => ['published', 'withdrawn'],
    ];

    public function transition(Product $product, string $target, ?int $actorId, ?string $reason = null, bool $moderator = false, ?int $adminActorId = null): Product
    {
        $to = ProductStatus::tryFrom($target);
        if (! $to) {
            throw ValidationException::withMessages(['status' => ['Estado no válido.']]);
        }
        if (($moderator || in_array($target, ['pending', 'withdrawn'], true)) && mb_strlen(trim((string) $reason)) < 5) {
            throw ValidationException::withMessages(['reason' => ['Explica el motivo con al menos 5 caracteres.']]);
        }

        return DB::transaction(function () use ($product, $target, $to, $actorId, $adminActorId, $reason, $moderator): Product {
            $product = Product::query()->lockForUpdate()->with(['producer', 'category.parent'])->findOrFail($product->id);
            $producer = ProducerProfile::query()->lockForUpdate()->findOrFail($product->producer_profile_id);
            $from = $product->status;
            $allowed = $moderator ? ['published', 'rejected', 'changes_requested'] : (self::PRODUCER_TRANSITIONS[$from->value] ?? []);
            if ($moderator && $from !== ProductStatus::Pending) {
                throw ValidationException::withMessages(['status' => ['Solo se pueden revisar publicaciones pendientes. Actualiza la cola antes de decidir.']]);
            }
            if (! in_array($target, $allowed, true)) {
                throw ValidationException::withMessages(['status' => ['La publicación cambió de estado. Actualiza la página antes de continuar.']]);
            }
            if (in_array($target, ['pending', 'published'], true)) {
                $this->assertProductPhotosAvailable($product);
            }
            if ($target === 'pending' && $producer->profile_status === 'suspended') {
                throw ValidationException::withMessages(['producer' => ['No puedes enviar publicaciones mientras el perfil esté suspendido.']]);
            }
            if ($target === 'pending' || $target === 'published') {
                $category = $product->category;
                if (! $category || ! $category->active || ($category->parent && ! $category->parent->active)) {
                    throw ValidationException::withMessages(['category_id' => ['Selecciona una categoría activa antes de enviar o aprobar la publicación.']]);
                }
            }
            if ($target === 'published' && $producer->profile_status !== 'active') {
                throw ValidationException::withMessages(['producer' => ['No se puede publicar la oferta hasta que el perfil del productor esté activo.']]);
            }
            if ($target === 'published' && $producer->phone_verified_at === null && $adminActorId === null) {
                throw ValidationException::withMessages(['producer' => ['El productor debe verificar su teléfono antes de publicar ofertas.']]);
            }

            $product->status = $to;
            if ($to === ProductStatus::Published) {
                if ($from !== ProductStatus::Pending || $product->published_at === null) {
                    $product->published_at = now();
                }
                $product->images()->update(['is_public' => true]);
            }
            $product->save();
            $product->statusHistory()->create(['actor_id' => $actorId, 'admin_actor_id' => $adminActorId, 'from_status' => $from->value, 'to_status' => $to->value, 'reason' => $reason]);
            AuditLog::create(['actor_id' => $actorId, 'admin_actor_id' => $adminActorId, 'action' => 'product.status_changed', 'resource_type' => 'product', 'resource_id' => $product->id, 'before_values' => ['status' => $from->value], 'after_values' => ['status' => $to->value], 'reason' => $reason, 'created_at' => now()]);

            return $product;
        });
    }

    public function renewExpiredListing(Product $product, int $actorId): Product
    {
        return DB::transaction(function () use ($product, $actorId): Product {
            $product = Product::query()->with(['producer', 'category.parent'])->lockForUpdate()->findOrFail($product->id);
            $producer = ProducerProfile::query()->lockForUpdate()->findOrFail($product->producer_profile_id);
            abort_unless($product->listingIsExpired(), 409, 'Solo puedes renovar una oferta publicada cuya vigencia haya vencido.');
            abort_unless($producer->profile_status === 'active', 409, 'No puedes renovar ofertas mientras el perfil del productor esté inactivo.');
            abort_unless($producer->phone_verified_at !== null, 409, 'Verifica tu teléfono antes de renovar ofertas públicas.');
            abort_unless($product->category?->active && (! $product->category->parent || $product->category->parent->active), 409, 'No puedes renovar la oferta hasta que su categoría esté activa.');

            $previousPublishedAt = $product->published_at;
            $product->published_at = now();
            $product->save();

            $reason = 'El productor renovó la vigencia de la oferta.';
            $product->statusHistory()->create([
                'actor_id' => $actorId,
                'from_status' => ProductStatus::Published->value,
                'to_status' => ProductStatus::Published->value,
                'reason' => $reason,
            ]);
            AuditLog::create([
                'actor_id' => $actorId,
                'action' => 'product.listing_renewed',
                'resource_type' => 'product',
                'resource_id' => $product->id,
                'before_values' => ['published_at' => $previousPublishedAt?->toISOString()],
                'after_values' => ['published_at' => $product->published_at?->toISOString()],
                'reason' => $reason,
                'created_at' => now(),
            ]);

            return $product;
        });
    }

    private function assertProductPhotosAvailable(Product $product): void
    {
        $images = $product->images()->get();
        if ($images->isEmpty()) {
            throw ValidationException::withMessages(['images' => ['Agrega al menos una fotografía antes de enviar la oferta.']]);
        }

        try {
            $hasUnavailableImage = $images->contains(fn ($image): bool => ! Storage::disk($image->disk)->exists($image->path));
        } catch (\Throwable $exception) {
            report($exception);
            throw ValidationException::withMessages(['images' => ['No pudimos verificar las fotografías. Inténtalo de nuevo en unos minutos.']]);
        }

        if ($hasUnavailableImage) {
            throw ValidationException::withMessages(['images' => ['Una o más fotografías ya no están disponibles. Edita la oferta, retíralas y vuelve a subirlas antes de enviarla o aprobarla.']]);
        }
    }
}
