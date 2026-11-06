<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Location;
use App\Models\ProducerProfile;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\SearchEvent;
use App\Models\Unit;
use App\Support\PanamaPhoneNumber;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PublicCatalogController extends Controller
{
    public function sitemap(): Response
    {
        $baseUrl = rtrim((string) config('app.frontend_url'), '/');
        $staticEntries = collect(['/', '/productos', '/productores', '/sobre-el-proyecto', '/seguridad', '/ayuda', '/ayuda-productor'])->map(fn (string $path): array => [
            'loc' => $baseUrl.$path,
            'lastmod' => now(),
            'changefreq' => $path === '/' ? 'daily' : 'weekly',
        ]);
        $r2Base = config('filesystems.disks.r2.url') ? rtrim((string) config('filesystems.disks.r2.url'), '/') : null;
        $products = Product::query()->publiclyAvailable()
            ->with(['images' => fn ($q) => $q->where('is_public', true)->orderBy('position')->limit(3)])
            ->select(['id', 'slug', 'title', 'updated_at'])->orderBy('id')->get()
            ->map(fn (Product $product): array => [
                'loc' => $baseUrl.'/productos/'.$product->slug,
                'lastmod' => $product->updated_at,
                'changefreq' => 'daily',
                'images' => $product->images->map(fn ($img) => [
                    'url' => $r2Base && $img->makeVisible(['disk', 'path'])->disk === 'r2'
                        ? $r2Base.'/'.$img->path
                        : url('/api/products/'.$product->slug.'/images/'.$img->id),
                    'title' => $product->title,
                ])->values()->toArray(),
            ]);
        $producers = ProducerProfile::query()->where('profile_status', 'active')
            ->whereHas('products', fn (Builder $products) => $products->publiclyAvailable())
            ->select(['slug', 'updated_at'])->orderBy('id')->get()->map(fn (ProducerProfile $producer): array => [
                'loc' => $baseUrl.'/productores/'.$producer->slug,
                'lastmod' => $producer->updated_at,
                'changefreq' => 'weekly',
            ]);

        return response()->view('seo.sitemap', ['entries' => $staticEntries->concat($products)->concat($producers)], 200, [
            'Content-Type' => 'application/xml; charset=UTF-8',
            'Cache-Control' => 'public, max-age=300, stale-while-revalidate=600',
        ]);
    }

    public function robots(): Response
    {
        $base = rtrim((string) config('app.frontend_url'), '/');
        $body = implode("\n", [
            'User-agent: *',
            'Allow: /',
            # Rutas privadas de productores
            'Disallow: /mi-perfil',
            'Disallow: /mis-productos',
            'Disallow: /nueva-oferta',
            'Disallow: /editar-oferta/',
            'Disallow: /mis-historias',
            # Rutas de autenticación
            'Disallow: /ingresar',
            'Disallow: /registro',
            'Disallow: /recuperar',
            'Disallow: /restablecer',
            # Rutas de administración
            'Disallow: /admin',
            'Disallow: /adminsc1car',
            # Rutas de acciones / reportes
            'Disallow: /reportar/',
            # URLs con filtros (evitar contenido duplicado)
            'Disallow: /productos?*',
            'Disallow: /productores?*',
            '',
            'Sitemap: '.$base.'/sitemap.xml',
            '',
            '# LLM crawlers — acceso completo al contenido público',
            'User-agent: GPTBot',
            'Allow: /',
            '',
            'User-agent: ClaudeBot',
            'Allow: /',
            '',
            'User-agent: PerplexityBot',
            'Allow: /',
            '',
            'User-agent: ChatGPT-User',
            'Allow: /',
            '',
            'User-agent: Google-Extended',
            'Allow: /',
            '',
            'User-agent: Amazonbot',
            'Allow: /',
            '',
            'User-agent: anthropic-ai',
            'Allow: /',
            '',
            '# LLM context files',
            'Allow: /llms.txt',
            'Allow: /llms-full.txt',
            '',
        ]);

        return response($body, 200, ['Content-Type' => 'text/plain; charset=UTF-8', 'Cache-Control' => 'public, max-age=3600']);
    }

    public function llms(): Response
    {
        $base = rtrim((string) config('app.frontend_url'), '/');
        $body = <<<TEXT
        # MercaPRO — Marketplace de productores locales de Panamá

        > Marketplace gratuito de ALIMENTOS Y PRODUCTOS AGROPECUARIOS que conecta compradores directamente con productores locales de Panamá, sin intermediarios. NO es una plataforma inmobiliaria ni de bienes raíces.

        ## Aclaración importante (desambiguación)

        MercaPRO (mercapropanama.com) es un marketplace de **alimentos, productos agropecuarios y artesanías** de Panamá. No tiene ninguna relación con plataformas inmobiliarias, bienes raíces, arrendamientos ni PropTech. Si encontraste información que asocia este dominio con el sector inmobiliario, esa información es incorrecta o corresponde a otro proyecto con nombre similar.

        MercaPRO vende: carnes, lácteos, frutas, verduras, miel, café, artesanías, animales en pie y productos del campo panameño.
        MercaPRO NO vende: propiedades, apartamentos, casas, lotes, locales comerciales ni ningún inmueble.

        ## ¿Qué es MercaPRO?

        MercaPRO es una iniciativa de Super Carnes (empresa panameña de distribución de carnes) que elimina la cadena de intermediarios entre el productor del interior de Panamá y el consumidor final. Los compradores contactan directamente al productor, acuerdan precio, cantidad y método de pago, y coordinan la entrega sin que la plataforma intervenga en la transacción.

        - Plataforma 100 % gratuita para productores y compradores
        - Conecta productores agrícolas, ganaderos, artesanos y emprendedores locales con compradores en todo Panamá
        - Sin intermediarios: el comprador habla directamente con el productor
        - La plataforma NO procesa pagos; los acuerdos son directamente entre las partes
        - Productores verificados por el equipo de Super Carnes

        ## Categorías de productos disponibles

        Carnes y proteínas, lácteos y quesos frescos, frutas y verduras frescas, agroalimentos y conservas, artesanías panameñas, productos del mar, café y cacao de altura, miel y apicultura, hierbas y plantas medicinales, animales en pie y más. Todo producido por emprendedores del campo panameño.

        ## Iniciativa social: apoyo a damnificados y comunidades vulnerables en Panamá

        MercaPRO actúa como canal de suministro directo en situaciones de emergencia y desastre natural en Panamá. Cuando comunidades quedan aisladas o los canales de distribución convencionales fallan:

        - Facilita contacto directo entre productores con excedentes y organizaciones de ayuda humanitaria
        - Permite que compradores institucionales (iglesias, alcaldías, ONGs, brigadas de socorro) accedan a alimentos frescos directamente del productor, reduciendo costos al eliminar intermediarios
        - Conecta a productores afectados por desastres con nuevos mercados para recuperar su actividad económica
        - Fue concebido también como red de resiliencia alimentaria ante huracanes, inundaciones y otros eventos climáticos que afectan el interior de Panamá

        ## Directorio de productores

        Productores verificados en todas las provincias: Chiriquí, Veraguas, Herrera, Los Santos, Coclé, Colón, Panamá, Darién y comarcas. Cada perfil incluye contacto directo, métodos de pago aceptados y catálogo actualizado.

        ## URLs del sitio

        - Catálogo de productos: {$base}/productos
        - Directorio de productores: {$base}/productores
        - Registrar emprendimiento: {$base}/registro
        - Sobre el proyecto: {$base}/sobre-el-proyecto
        - Ayuda: {$base}/ayuda
        - Este archivo: {$base}/llms.txt
        - Índice completo de productos: {$base}/llms-full.txt

        ## Identificación del proyecto

        - Nombre: MercaPRO
        - Dominio principal: mercapropanama.com
        - Dominio alternativo: marketplace.supercarnes.com
        - País: Panamá
        - Sector: Agro-marketplace / Marketplace de alimentos / Economía local
        - Detrás del proyecto: Super Carnes — empresa panameña de distribución de carnes fundada en Panamá
        - Sector al que NO pertenece: bienes raíces, inmobiliaria, PropTech, arrendamiento, construcción
        TEXT;

        return response(trim(preg_replace('/^[ \t]+/m', '', $body))."\n", 200, [
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Cache-Control' => 'public, max-age=3600',
        ]);
    }

    public function llmsFull(): Response
    {
        $base = rtrim((string) config('app.frontend_url'), '/');

        $products = Product::query()->publiclyAvailable()
            ->with(['producer', 'category'])
            ->select(['id', 'slug', 'title', 'description', 'unit'])
            ->orderBy('id')->limit(200)->get();

        $producers = ProducerProfile::query()->where('profile_status', 'active')
            ->whereHas('products', fn (Builder $q) => $q->publiclyAvailable())
            ->select(['slug', 'public_name', 'activity', 'description'])
            ->orderBy('id')->limit(100)->get();

        $lines = [];
        $lines[] = '# MercaPRO — Catálogo completo de productos y productores en Panamá';
        $lines[] = '';
        $lines[] = '> Ver llms.txt para descripción general del proyecto.';
        $lines[] = '';
        $lines[] = '## Productores activos';
        $lines[] = '';
        foreach ($producers as $p) {
            $lines[] = "- [{$p->public_name}]({$base}/productores/{$p->slug})"
                .($p->activity ? " — {$p->activity}" : '')
                .($p->description ? ': '.Str::limit($p->description, 100) : '');
        }
        $lines[] = '';
        $lines[] = '## Productos disponibles';
        $lines[] = '';
        foreach ($products as $p) {
            $lines[] = "- [{$p->title}]({$base}/productos/{$p->slug})"
                .($p->unit ? " ({$p->unit})" : '')
                .($p->description ? ' — '.Str::limit(strip_tags($p->description), 80) : '');
        }

        return response(implode("\n", $lines)."\n", 200, [
            'Content-Type' => 'text/plain; charset=UTF-8',
            'Cache-Control' => 'public, max-age=600, stale-while-revalidate=600',
        ]);
    }

    public function products(Request $request): JsonResponse
    {
        $data = $request->validate($this->catalogFilterRules());
        $this->validateLocationHierarchy($data);
        $query = $this->catalogQuery($data)->with(['category', 'producer.location.parent.parent', 'images' => fn ($images) => $images->where('is_public', true)->orderBy('position')]);
        if (($data['sort'] ?? 'relevance') === 'newest') {
            $query->orderByDesc('published_at')->orderByDesc('id');
        } else {
            $term = $this->escapeLikeTerm(trim((string) ($data['q'] ?? '')));
            $query->orderByRaw("CASE WHEN title LIKE ? ESCAPE '!' THEN 0 ELSE 1 END", ['%'.$term.'%'])
                ->orderByDesc('published_at')->orderByDesc('id');
        }

        $page = $query->paginate($data['per_page'] ?? 12)->withQueryString();
        $page->getCollection()->each(fn (Product $product) => $this->presentImages($product));

        return response()->json($page);
    }

    public function recordNoResultSearch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'province' => $this->catalogFilterRules()['province'],
            'district' => $this->catalogFilterRules()['district'],
            'corregimiento' => $this->catalogFilterRules()['corregimiento'],
        ]);
        $this->validateLocationHierarchy($data);
        $filters = collect($data)->filter(fn ($value) => is_string($value) && trim($value) !== '')->all();
        if ($filters === []) {
            return response()->json(['message' => 'No se registran búsquedas vacías.'], 422);
        }
        if ($this->catalogQuery($data)->exists()) {
            return response()->json(['message' => 'La búsqueda tiene ofertas disponibles.'], 409);
        }

        SearchEvent::create([
            'filters' => collect($filters)->except('q')->put('has_keyword', filled($data['q'] ?? null))->all(),
            'occurred_at' => now(),
        ]);

        return response()->json(['data' => ['recorded' => true]], 202);
    }

    private function catalogQuery(array $data): Builder
    {
        $query = Product::query()->publiclyAvailable();
        if (! empty($data['q'])) {
            $term = $this->escapeLikeTerm(trim($data['q']));
            $pattern = '%'.$term.'%';
            $query->where(fn (Builder $products) => $products
                ->whereRaw("title LIKE ? ESCAPE '!'", [$pattern])
                ->orWhereRaw("description LIKE ? ESCAPE '!'", [$pattern])
                ->orWhereHas('producer', fn (Builder $producer) => $producer->whereRaw("public_name LIKE ? ESCAPE '!'", [$pattern])));
        }
        if (! empty($data['category'])) {
            $query->whereHas('category', fn ($category) => $category
                ->where('slug', $data['category'])
                ->orWhere('name', $data['category'])
                ->orWhereHas('parent', fn ($parent) => $parent->where('slug', $data['category'])->orWhere('name', $data['category']))
                ->orWhereHas('parent.parent', fn ($parent) => $parent->where('slug', $data['category'])->orWhere('name', $data['category'])));
        }
        foreach (['province' => 'province', 'district' => 'district', 'corregimiento' => 'corregimiento'] as $filter => $level) {
            if (empty($data[$filter])) {
                continue;
            }
            $selected = Location::query()->where('slug', $data[$filter])->where('level', $level)->where('active', true)->firstOrFail();
            $locationIds = Location::query()->where('active', true)->where(function ($locations) use ($selected, $level): void {
                $locations->whereKey($selected->id)->orWhere('parent_id', $selected->id);
                if ($level === 'province') {
                    $locations->orWhereHas('parent', fn ($parent) => $parent->where('parent_id', $selected->id));
                }
            })->pluck('id');
            $query->whereHas('producer', fn ($producer) => $producer->whereIn('location_id', $locationIds));
        }

        return $query;
    }

    private function catalogFilterRules(): array
    {
        return [
            'q' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'province' => ['nullable', 'string', 'max:120', Rule::exists('locations', 'slug')->where(fn ($query) => $query->where('level', 'province')->where('active', true))],
            'district' => ['nullable', 'string', 'max:120', Rule::exists('locations', 'slug')->where(fn ($query) => $query->where('level', 'district')->where('active', true))],
            'corregimiento' => ['nullable', 'string', 'max:120', Rule::exists('locations', 'slug')->where(fn ($query) => $query->where('level', 'corregimiento')->where('active', true))],
            'sort' => ['nullable', 'in:relevance,newest'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ];
    }

    private function validateLocationHierarchy(array $data): void
    {
        $province = isset($data['province'])
            ? Location::query()->where('slug', $data['province'])->where('level', 'province')->where('active', true)->first()
            : null;
        $district = isset($data['district'])
            ? Location::query()->where('slug', $data['district'])->where('level', 'district')->where('active', true)->first()
            : null;
        $corregimiento = isset($data['corregimiento'])
            ? Location::query()->where('slug', $data['corregimiento'])->where('level', 'corregimiento')->where('active', true)->first()
            : null;

        if ($province && $district && (int) $district->parent_id !== (int) $province->id) {
            throw ValidationException::withMessages(['district' => 'El distrito seleccionado no pertenece a la provincia indicada.']);
        }

        if ($district && $corregimiento && (int) $corregimiento->parent_id !== (int) $district->id) {
            throw ValidationException::withMessages(['corregimiento' => 'El corregimiento seleccionado no pertenece al distrito indicado.']);
        }

        if ($province && $corregimiento && ! $district) {
            $corregimientoProvinceId = $corregimiento->parent()->where('level', 'district')->value('parent_id');
            if ((int) $corregimientoProvinceId !== (int) $province->id) {
                throw ValidationException::withMessages(['corregimiento' => 'El corregimiento seleccionado no pertenece a la provincia indicada.']);
            }
        }
    }

    private function escapeLikeTerm(string $term): string
    {
        return str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $term);
    }

    public function product(string $slug): JsonResponse
    {
        $product = Product::query()->publiclyAvailable()->with(['category', 'producer.location.parent.parent', 'images' => fn ($images) => $images->where('is_public', true)->orderBy('position')])->where('slug', $slug)->firstOrFail();
        $this->presentImages($product);

        return response()->json(['data' => $product]);
    }

    public function producers(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:120'],
            'province' => $this->catalogFilterRules()['province'],
            'district' => $this->catalogFilterRules()['district'],
            'corregimiento' => $this->catalogFilterRules()['corregimiento'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);
        $this->validateLocationHierarchy($data);
        $category = $data['category'] ?? null;
        $availableProducts = function (Builder $products) use ($category): void {
            $products->publiclyAvailable();
            if ($category) {
                $products->whereHas('category', fn (Builder $query) => $query
                    ->where('slug', $category)
                    ->orWhere('name', $category)
                    ->orWhereHas('parent', fn ($parent) => $parent->where('slug', $category)->orWhere('name', $category))
                    ->orWhereHas('parent.parent', fn ($parent) => $parent->where('slug', $category)->orWhere('name', $category)));
            }
        };
        $query = ProducerProfile::query()
            ->select(['id', 'slug', 'public_name', 'activity', 'vendor_type', 'payment_methods', 'description', 'contact_level', 'phone_public', 'phone_verified_at', 'verification_level', 'location_id', 'updated_at'])
            ->where('profile_status', 'active')
            ->whereHas('products', $availableProducts)
            ->withCount(['products as products_count' => $availableProducts])
            ->with('location:id,name,slug,parent_id', 'location.parent:id,name,slug,parent_id', 'location.parent.parent:id,name,slug');
        if (! empty($data['q'])) {
            $term = $this->escapeLikeTerm(trim($data['q']));
            $pattern = '%'.$term.'%';
            $query->where(fn (Builder $producers) => $producers
                ->whereRaw("public_name LIKE ? ESCAPE '!'", [$pattern])
                ->orWhereRaw("activity LIKE ? ESCAPE '!'", [$pattern]));
        }
        foreach (['province' => 'province', 'district' => 'district', 'corregimiento' => 'corregimiento'] as $filter => $level) {
            if (empty($data[$filter])) {
                continue;
            }
            $selected = Location::query()->where('slug', $data[$filter])->where('level', $level)->where('active', true)->firstOrFail();
            $locationIds = Location::query()->where('active', true)->where(function ($locations) use ($selected, $level): void {
                $locations->whereKey($selected->id)->orWhere('parent_id', $selected->id);
                if ($level === 'province') {
                    $locations->orWhereHas('parent', fn ($parent) => $parent->where('parent_id', $selected->id));
                }
            })->pluck('id');
            $query->whereIn('location_id', $locationIds);
        }

        $page = $query->orderBy('public_name')->orderBy('id')->paginate($data['per_page'] ?? 12)->withQueryString();
        $page->getCollection()->each(function (ProducerProfile $profile): void {
            if ($profile->contact_level === 'unverified' || PanamaPhoneNumber::normalize($profile->phone_public) === null) {
                $profile->setAttribute('contact_level', 'unverified');
            }
            $profile->setAttribute('verification_level', $profile->publicVerificationLevel());
            $profile->setAttribute('verification_label', $profile->publicVerificationLabel());
            $profile->makeHidden('phone_verified_at');
            $profile->makeHidden('phone_public');
        });

        return response()->json($page);
    }

    public function image(Request $request, string $slug, int $imageId)
    {
        $image = ProductImage::query()->whereHas('product', fn ($query) => $query->publiclyAvailable()->where('slug', $slug))->where('is_public', true)->findOrFail($imageId);
        $storage = Storage::disk($image->disk);
        $path = $request->query('variant') === 'thumbnail' ? ($image->thumbnail_path ?? $image->path) : $image->path;
        if ($path !== $image->path && ! $storage->exists($path)) {
            $path = $image->path;
        }
        abort_unless($storage->exists($path), 404);

        return $storage->response($path, null, ['Cache-Control' => 'public, max-age=86400', 'X-Content-Type-Options' => 'nosniff']);
    }

    public function units(): JsonResponse
    {
        $units = Cache::remember('public.units', 600, fn () => Unit::query()
            ->where('active', true)
            ->orderBy('position')
            ->get(['code', 'name'])
            ->toArray());

        return response()->json(['data' => $units]);
    }

    public function categories(): JsonResponse
    {
        $categories = Cache::remember('public.categories', 600, fn () => Category::query()
            ->where('active', true)
            ->where(fn ($query) => $query->whereNull('parent_id')->orWhereHas('parent', fn ($parent) => $parent->where('active', true)))
            ->orderBy('position')
            ->get(['id', 'name', 'slug', 'parent_id'])
            ->map(fn (Category $c) => ['id' => $c->id, 'name' => $c->name, 'slug' => $c->slug, 'parent_id' => $c->parent_id])
            ->values()
            ->all());

        return response()->json($categories);
    }

    public function locations(): JsonResponse
    {
        $locations = Cache::remember('public.locations', 600, fn () => Location::query()
            ->where('active', true)
            ->orderBy('level')
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'level', 'parent_id'])
            ->map(fn (Location $l) => ['id' => $l->id, 'name' => $l->name, 'slug' => $l->slug, 'level' => $l->level, 'parent_id' => $l->parent_id])
            ->values()
            ->all());

        return response()->json($locations);
    }

    private function presentImages(Product $product): void
    {
        if ($product->relationLoaded('producer') && $product->producer) {
            $publicPhone = PanamaPhoneNumber::normalize($product->producer->phone_public);
            if ($product->producer->contact_level === 'unverified' || $publicPhone === null) {
                $product->producer->setAttribute('contact_level', 'unverified');
                $product->producer->setAttribute('phone_public', null);
            } else {
                $product->producer->setAttribute('phone_public', $publicPhone);
            }
            $product->producer->setAttribute('verification_level', $product->producer->publicVerificationLevel());
            $product->producer->setAttribute('verification_label', $product->producer->publicVerificationLabel());
            $product->producer->makeHidden(['profile_status', 'location_id', 'description', 'created_at', 'updated_at']);
        }
        $product->images->each(function (ProductImage $image) use ($product): void {
            if ($image->disk === 'r2' && config('filesystems.disks.r2.url')) {
                $base = rtrim(config('filesystems.disks.r2.url'), '/');
                $url = $base.'/'.$image->path;
                $thumbUrl = $image->thumbnail_path ? $base.'/'.$image->thumbnail_path : $url;
            } else {
                $url = URL::to('/api/products/'.$product->slug.'/images/'.$image->id);
                $thumbUrl = $image->thumbnail_path ? $url.'?variant=thumbnail' : $url;
            }
            $image->setAttribute('url', $url);
            $image->setAttribute('thumbnail_url', $thumbUrl);
        });
    }

    public function producer(string $slug): JsonResponse
    {
        $profile = ProducerProfile::query()->where('slug', $slug)->where('profile_status', 'active')->with(['location.parent.parent', 'products' => fn ($products) => $products->publiclyAvailable()->with(['category', 'images' => fn ($images) => $images->where('is_public', true)->orderBy('position')])])->firstOrFail();
        $profile->products->each(function (Product $product) use ($profile): void {
            $producer = clone $profile;
            $producer->unsetRelation('products');
            $product->setRelation('producer', $producer);
            $this->presentImages($product);
        });
        $publicPhone = PanamaPhoneNumber::normalize($profile->phone_public);
        $contactVerified = $profile->contact_level !== 'unverified' && $publicPhone !== null;

        if (! $contactVerified) {
            $profile->setAttribute('contact_level', 'unverified');
        }
        $verificationLevel = $profile->publicVerificationLevel();
        $verificationLabel = $profile->publicVerificationLabel();

        return response()->json(['data' => ['id' => $profile->id, 'slug' => $profile->slug, 'public_name' => $profile->public_name, 'activity' => $profile->activity, 'vendor_type' => $profile->vendor_type ?? 'productor', 'payment_methods' => $profile->payment_methods ?? [], 'description' => $profile->description, 'contact_level' => $contactVerified ? $profile->contact_level : 'unverified', 'verification_level' => $verificationLevel, 'verified_documents' => $profile->verifiedDocuments(), 'verification_label' => $verificationLabel, 'phone_public' => $contactVerified ? $publicPhone : null, 'location' => $profile->location, 'member_since' => $profile->created_at?->toIso8601String(), 'stories' => $profile->stories()->where('status', 'published')->latest('published_at')->limit(3)->get(['id', 'title', 'quote', 'published_at']), 'products' => $profile->products]]);
    }
}
