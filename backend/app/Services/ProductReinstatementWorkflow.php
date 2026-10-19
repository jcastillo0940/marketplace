<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\ProducerProfile;
use App\Models\Product;

class ProductReinstatementWorkflow
{
    public function queuePublishedProductsForReview(ProducerProfile $profile, int $actorId, string $reason): int
    {
        $products = Product::query()->where('producer_profile_id', $profile->id)
            ->where('status', 'published')->lockForUpdate()->get();
        $reviewReason = 'Revisión requerida tras reactivar el perfil: '.$reason;

        foreach ($products as $product) {
            $product->forceFill(['status' => 'pending'])->save();
            $product->statusHistory()->create([
                'actor_id' => $actorId,
                'from_status' => 'published',
                'to_status' => 'pending',
                'reason' => $reviewReason,
            ]);
            AuditLog::create([
                'actor_id' => $actorId,
                'action' => 'product.queued_after_producer_reinstatement',
                'resource_type' => 'product',
                'resource_id' => $product->id,
                'before_values' => ['status' => 'published'],
                'after_values' => ['status' => 'pending'],
                'reason' => $reviewReason,
                'created_at' => now(),
            ]);
        }

        return $products->count();
    }
}
