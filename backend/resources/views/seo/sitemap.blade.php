<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
@foreach ($entries as $entry)
    <url>
        <loc>{{ $entry['loc'] }}</loc>
        <lastmod>{{ $entry['lastmod']->toAtomString() }}</lastmod>
        <changefreq>{{ $entry['changefreq'] }}</changefreq>
@if (!empty($entry['images']))
@foreach ($entry['images'] as $image)
        <image:image>
            <image:loc>{{ $image['url'] }}</image:loc>
            <image:title>{{ htmlspecialchars($image['title']) }}</image:title>
        </image:image>
@endforeach
@endif
    </url>
@endforeach
</urlset>
