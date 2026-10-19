<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

class SharePreviewController extends Controller
{
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
            'title' => $product->title.' · El Empujoncito',
            'description' => $description,
            'canonicalUrl' => $canonicalUrl,
            'imageUrl' => $imageUrl,
            'productUrl' => $canonicalUrl,
        ])->header('Cache-Control', 'public, max-age=300, stale-while-revalidate=300')
            ->header('X-Content-Type-Options', 'nosniff');
    }
}
