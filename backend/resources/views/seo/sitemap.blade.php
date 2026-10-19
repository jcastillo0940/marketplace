<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
@foreach ($entries as $entry)
    <url>
        <loc>{{ $entry['loc'] }}</loc>
        <lastmod>{{ $entry['lastmod']->toAtomString() }}</lastmod>
        <changefreq>{{ $entry['changefreq'] }}</changefreq>
    </url>
@endforeach
</urlset>
