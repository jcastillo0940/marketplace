<?php

namespace App\Http\Controllers;

use App\Models\Product;
use App\Models\ProducerProfile;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

class SharePreviewController extends Controller
{
    public function producer(string $slug)
    {
        $profile = ProducerProfile::query()
            ->where('slug', $slug)
            ->where('profile_status', 'active')
            ->with(['location.parent', 'products' => fn ($q) => $q->publiclyAvailable()->with(['images' => fn ($i) => $i->where('is_public', true)->orderBy('position')])->latest('id')->limit(1)])
            ->firstOrFail();

        $frontendUrl = rtrim((string) config('app.frontend_url'), '/');
        $canonicalUrl = $frontendUrl.'/productores/'.$profile->slug;
        $location = implode(', ', array_filter([$profile->location?->name, $profile->location?->parent?->name]));

        $firstProduct = $profile->products->first();
        $image = $firstProduct ? $firstProduct->images->first() : null;
        $imageUrl = ($image && $firstProduct) ? URL::to('/api/products/'.$firstProduct->slug.'/images/'.$image->id) : null;
        $activity = $profile->activity ? $profile->activity.' · ' : '';
        $bio = $profile->description ?: 'Productor local de Panamá. Contacta directamente en Mercapro.';
        $description = Str::limit($activity.$bio, 200);

        return response()->view('seo.product-share', [
            'title' => $profile->public_name.' · Productor en Mercapro',
            'description' => $description.($location ? " Ubicado en {$location}." : ''),
            'canonicalUrl' => $canonicalUrl,
            'imageUrl' => $imageUrl,
            'productUrl' => $canonicalUrl,
        ])->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=300')
            ->header('X-Content-Type-Options', 'nosniff');
    }

    public function product(string $slug)
    {
        $product = Product::query()
            ->publiclyAvailable()
            ->with(['producer.location', 'images' => fn ($images) => $images->where('is_public', true)->orderBy('position')])
            ->where('slug', $slug)
            ->firstOrFail();

        $frontendUrl = rtrim((string) config('app.frontend_url'), '/');
        $canonicalUrl = $frontendUrl.'/productos/'.$product->slug;
        $image = $product->images->first();
        $imageUrl = $image ? URL::to('/api/products/'.$product->slug.'/images/'.$image->id) : null;
        $description = Str::limit(trim(preg_replace('/\s+/u', ' ', strip_tags($product->description)) ?? ''), 200);

        return response()->view('seo.product-share', [
            'title' => $product->title.' · Mercapro',
            'description' => $description,
            'canonicalUrl' => $canonicalUrl,
            'imageUrl' => $imageUrl,
            'productUrl' => $canonicalUrl,
        ])->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=300')
            ->header('X-Content-Type-Options', 'nosniff');
    }
}
