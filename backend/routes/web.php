<?php

use App\Http\Controllers\Api\PublicCatalogController;
use App\Http\Controllers\SharePreviewController;
use Illuminate\Support\Facades\Route;

Route::get('/sitemap.xml', [PublicCatalogController::class, 'sitemap']);
Route::get('/robots.txt', [PublicCatalogController::class, 'robots']);
Route::get('/llms.txt', [PublicCatalogController::class, 'llms']);
Route::get('/llms-full.txt', [PublicCatalogController::class, 'llmsFull']);
Route::get('/compartir/producto/{slug}', [SharePreviewController::class, 'product'])->where('slug', '[A-Za-z0-9-]+');
Route::get('/compartir/productor/{slug}', [SharePreviewController::class, 'producer'])->where('slug', '[A-Za-z0-9-]+');

Route::get('/', function () {
    return view('welcome');
});
