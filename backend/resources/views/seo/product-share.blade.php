<!doctype html>
<html lang="es-PA">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="{{ $description }}">
    <meta property="og:site_name" content="El Empujoncito">
    <meta property="og:locale" content="es_PA">
    <meta property="og:type" content="product">
    <meta property="og:title" content="{{ $title }}">
    <meta property="og:description" content="{{ $description }}">
    <meta property="og:url" content="{{ $canonicalUrl }}">
    @if ($imageUrl)
        <meta property="og:image" content="{{ $imageUrl }}">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:image" content="{{ $imageUrl }}">
    @else
        <meta name="twitter:card" content="summary">
    @endif
    <meta name="twitter:title" content="{{ $title }}">
    <meta name="twitter:description" content="{{ $description }}">
    <link rel="canonical" href="{{ $canonicalUrl }}">
    <meta http-equiv="refresh" content="0;url={{ $productUrl }}">
    <title>{{ $title }}</title>
</head>
<body>
    <main>
        <p>Abriendo la oferta en El Empujoncito…</p>
        <p><a href="{{ $productUrl }}">Ver {{ $title }}</a></p>
    </main>
    <script>window.location.replace(@json($productUrl));</script>
</body>
</html>
