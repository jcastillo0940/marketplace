<?php

use App\Http\Controllers\Api\PublicCatalogController;
use App\Http\Controllers\SharePreviewController;
use Illuminate\Support\Facades\Route;

Route::get('/sitemap.xml', [PublicCatalogController::class, 'sitemap']);
Route::get('/robots.txt', [PublicCatalogController::class, 'robots']);
Route::get('/compartir/producto/{slug}', [SharePreviewController::class, 'product'])->where('slug', '[A-Za-z0-9-]+');

Route::get('/', function () {
    return view('welcome');
});
