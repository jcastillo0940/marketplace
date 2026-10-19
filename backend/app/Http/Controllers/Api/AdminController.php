<?php

namespace App\Http\Controllers\Api;

use App\Enums\ProducerVerificationLevel;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\ContactEvent;
use App\Models\Location;
use App\Models\ProducerProfile;
use App\Models\Product;
use App\Models\ProductStatusHistory;
use App\Models\Report;
use App\Models\Role;
use App\Models\SearchEvent;
use App\Models\User;
use App\Services\ProducerTrustLevelWorkflow;
use App\Services\ProductReinstatementWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminController extends Controller
{
    public function producers(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('producers.assist') || $request->user()->can('producers.suspend') || $request->user()->can('producers.verify'), 403);
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:120'], 'status' => ['nullable', 'in:pending,active,suspended'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:50']]);
        $query = ProducerProfile::query()->with(['location.parent', 'user:id,name,email'])->withCount(['products as products_count' => fn ($products) => $products->whereIn('status', ['draft', 'pending', 'published'])])->latest();
        if (! empty($filters['q'])) {
            $query->where(fn ($builder) => $builder->where('public_name', 'like', '%'.$filters['q'].'%')->orWhereHas('user', fn ($user) => $user->where('email', 'like', '%'.$filters['q'].'%')));
        }
        if (! empty($filters['status'])) {
            $query->where('profile_status', $filters['status']);
        }
        $page = $query->paginate($filters['per_page'] ?? 20);
        $page->getCollection()->transform(fn (ProducerProfile $profile) => ['id' => $profile->id, 'public_name' => $profile->public_name, 'slug' => $profile->slug, 'activity' => $profile->activity, 'location' => $profile->location, 'profile_status' => $profile->profile_status, 'contact_level' => $profile->contact_level, 'verification_level' => $profile->publicVerificationLevel(), 'created_at' => $profile->created_at, 'products_count' => $profile->products_count, 'account' => $request->user()->can('producers.assist') || $request->user()->can('producers.suspend') ? ['name' => $profile->user->name, 'email' => $profile->user->email] : null]);

        return response()->json($page);
    }

    public function producerDetail(Request $request, int $id): JsonResponse
    {
        abort_unless($request->user()->can('producers.assist') || $request->user()->can('producers.suspend') || $request->user()->can('producers.verify'), 403);
        $profile = ProducerProfile::query()->with([
            'user:id,name,email,created_at',
            'registeredBy:id,name',
            'location:id,name,level,parent_id',
            'location.parent:id,name,level,parent_id',
            'consents' => fn ($query) => $query->select(['id', 'producer_profile_id', 'consent_type', 'version', 'accepted_at'])->orderByDesc('accepted_at'),
            'verifications' => fn ($query) => $query->select(['id', 'producer_profile_id', 'channel', 'status', 'verified_at', 'expires_at'])->withCount('attempts')->orderByDesc('id'),
            'trustReviews' => fn ($query) => $query->with('actor:id,name')->orderByDesc('id')->limit(50),
        ])->findOrFail($id);
        $products = Product::query()->where('producer_profile_id', $profile->id)
            ->select('id', 'producer_profile_id', 'title', 'status', 'updated_at')->latest('id')->limit(10)->get();
        $productHistory = ProductStatusHistory::query()->with(['product:id,title,producer_profile_id', 'actor:id,name'])
            ->whereHas('product', fn ($query) => $query->where('producer_profile_id', $profile->id))
            ->latest('created_at')->limit(30)->get()
            ->map(fn (ProductStatusHistory $entry) => [
                'product_title' => $entry->product->title,
                'from_status' => $entry->from_status,
                'to_status' => $entry->to_status,
                'reason' => $entry->reason,
                'actor' => $entry->actor?->name,
                'created_at' => $entry->created_at,
            ]);
        $audit = AuditLog::query()->with('actor:id,name')->where('resource_type', 'producer_profile')
            ->where('resource_id', $profile->id)->latest('created_at')->limit(50)->get()
            ->map(fn (AuditLog $entry) => [
                'action' => $entry->action,
                'before_values' => $entry->before_values,
                'after_values' => $entry->after_values,
                'reason' => $entry->reason,
                'actor' => $entry->actor?->name,
                'created_at' => $entry->created_at,
            ]);
        $statusCounts = Product::query()->where('producer_profile_id', $profile->id)
            ->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status');

        return response()->json(['data' => [
            'producer' => [
                'id' => $profile->id,
                'public_name' => $profile->public_name,
                'slug' => $profile->slug,
                'activity' => $profile->activity,
                'description' => $profile->description,
                'profile_status' => $profile->profile_status,
                'suspension_reason' => $profile->suspension_reason,
                'contact_level' => $profile->contact_level,
                'verification_level' => $profile->publicVerificationLevel(),
                'phone_verified_at' => $profile->phone_verified_at,
                'registration_method' => $profile->registration_method,
                'registered_by' => $profile->registeredBy?->name,
                'location' => $profile->location,
            ],
            'account' => ['name' => $profile->user->name, 'email' => $profile->user->email, 'created_at' => $profile->user->created_at],
            'consents' => $profile->consents,
            'verifications' => $profile->verifications,
            'trust_reviews' => $profile->trustReviews->map(fn ($review) => [
                'from_level' => $review->from_level,
                'to_level' => $review->to_level,
                'reason' => $review->reason,
                'actor' => $review->actor?->name,
                'created_at' => $review->created_at,
            ]),
            'product_status_counts' => $statusCounts,
            'products' => $products,
            'product_history' => $productHistory,
            'audit' => $audit,
        ]]);
    }

    public function setProducerStatus(Request $request, int $id, ProductReinstatementWorkflow $workflow): JsonResponse
    {
        $data = $request->validate(['profile_status' => ['required', 'in:active,suspended'], 'reason' => ['required', 'string', 'min:5', 'max:1000']]);
        Gate::authorize($data['profile_status'] === 'suspended' ? 'producers.suspend' : 'producers.assist');
        $result = DB::transaction(function () use ($id, $data, $request, $workflow): array {
            $profile = ProducerProfile::query()->lockForUpdate()->findOrFail($id);
            $before = $profile->profile_status;
            abort_if($before === $data['profile_status'], 409, 'El perfil ya tiene ese estado. Actualiza el directorio antes de continuar.');
            $profile->profile_status = $data['profile_status'];
            $profile->suspension_reason = $data['profile_status'] === 'suspended' ? $data['reason'] : null;
            $profile->save();
            $queuedProducts = 0;
            if ($data['profile_status'] === 'active' && $before === 'suspended') {
                $queuedProducts = $workflow->queuePublishedProductsForReview($profile, $request->user()->id, $data['reason']);
            }
            AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'producer.status_changed', 'resource_type' => 'producer_profile', 'resource_id' => $profile->id, 'before_values' => ['profile_status' => $before], 'after_values' => ['profile_status' => $profile->profile_status], 'reason' => $data['reason'], 'created_at' => now()]);

            return [$profile, $queuedProducts];
        });

        [$profile, $queuedProducts] = $result;

        return response()->json(['data' => ['id' => $profile->id, 'profile_status' => $profile->profile_status, 'products_queued_for_review' => $queuedProducts]]);
    }

    public function setProducerTrustLevel(Request $request, int $id, ProducerTrustLevelWorkflow $workflow): JsonResponse
    {
        Gate::authorize('producers.verify');
        $data = $request->validate([
            'level' => ['required', 'in:contact_confirmed,identity_reviewed,producer_validated'],
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ]);
        $profile = ProducerProfile::query()->findOrFail($id);
        $review = $workflow->change($profile, $request->user(), ProducerVerificationLevel::from($data['level']), $data['reason']);
        $level = ProducerVerificationLevel::from($review->to_level);

        return response()->json(['data' => [
            'verification_level' => $level->value,
            'verification_label' => $level->label(),
        ]]);
    }

    public function categories(): JsonResponse
    {
        Gate::authorize('catalogs.manage');

        return response()->json(Category::query()->withCount(['products as products_count' => fn ($query) => $query->whereIn('status', ['draft', 'pending', 'published'])])->orderBy('position')->get());
    }

    public function saveCategory(Request $request, ?int $id = null): JsonResponse
    {
        Gate::authorize('catalogs.manage');
        $data = $request->validate(['name' => ['required', 'string', 'min:2', 'max:100'], 'parent_id' => ['nullable', 'integer', 'exists:categories,id'], 'active' => ['required', 'boolean'], 'position' => ['required', 'integer', 'min:0', 'max:65535']]);
        if (! empty($data['parent_id']) && $id && (int) $data['parent_id'] === $id) {
            throw ValidationException::withMessages(['parent_id' => ['Una categoría no puede depender de sí misma.']]);
        }
        $category = $id ? Category::findOrFail($id) : new Category;
        if ($id && $category->active && ! $data['active']) {
            $this->assertCategoryCanDeactivate($category);
        }
        if (! empty($data['parent_id'])) {
            $parent = Category::findOrFail($data['parent_id']);
            if ($parent->id === $category->id || ! $parent->active) {
                throw ValidationException::withMessages(['parent_id' => ['Selecciona una categoría padre activa y distinta.']]);
            }
            if ($parent->parent_id !== null) {
                throw ValidationException::withMessages(['parent_id' => ['Las subcategorías deben depender de una categoría principal, no de otra subcategoría.']]);
            }
            if ($id && $category->children()->exists()) {
                throw ValidationException::withMessages(['parent_id' => ['Una categoría con subcategorías no puede convertirse en subcategoría.']]);
            }
        }
        $category->fill([...$data, 'slug' => Str::slug($data['name'])]);
        $category->save();
        AuditLog::create(['actor_id' => $request->user()->id, 'action' => $id ? 'catalog.category_updated' : 'catalog.category_created', 'resource_type' => 'category', 'resource_id' => $category->id, 'after_values' => $category->only(['name', 'slug', 'active', 'position', 'parent_id']), 'created_at' => now()]);

        return response()->json(['data' => $category], $id ? 200 : 201);
    }

    public function deactivateCategory(Request $request, int $id): JsonResponse
    {
        Gate::authorize('catalogs.manage');
        $category = Category::findOrFail($id);
        $this->assertCategoryCanDeactivate($category);
        $category->active = false;
        $category->save();
        AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'catalog.category_deactivated', 'resource_type' => 'category', 'resource_id' => $category->id, 'after_values' => ['active' => false], 'created_at' => now()]);

        return response()->json(['data' => ['id' => $category->id, 'active' => false]]);
    }

    private function assertCategoryCanDeactivate(Category $category): void
    {
        if ($category->products()->where('status', '!=', 'withdrawn')->exists()) {
            throw ValidationException::withMessages(['category' => ['La categoría aún tiene publicaciones; reasígnalas o retíralas antes de desactivarla.']]);
        }
        if ($category->children()->where('active', true)->exists()) {
            throw ValidationException::withMessages(['category' => ['Desactiva primero las subcategorías activas para conservar su disponibilidad.']]);
        }
    }

    public function locations(): JsonResponse
    {
        Gate::authorize('catalogs.manage');

        return response()->json(Location::query()->with('parent:id,name')->withCount('children')->orderBy('level')->orderBy('name')->get());
    }

    public function saveLocation(Request $request, ?int $id = null): JsonResponse
    {
        Gate::authorize('catalogs.manage');
        $data = $request->validate(['name' => ['required', 'string', 'min:2', 'max:100'], 'level' => ['required', 'in:province,district,corregimiento'], 'parent_id' => ['present', 'nullable', 'integer', 'exists:locations,id'], 'active' => ['required', 'boolean']]);
        if (($data['level'] === 'province' && ! empty($data['parent_id'])) || ($data['level'] !== 'province' && empty($data['parent_id']))) {
            throw ValidationException::withMessages(['parent_id' => ['La provincia no tiene padre y los niveles inferiores requieren una ubicación padre.']]);
        }
        $location = $id ? Location::findOrFail($id) : new Location;
        if ($id && $data['parent_id'] === $id) {
            throw ValidationException::withMessages(['parent_id' => ['Una ubicación no puede depender de sí misma.']]);
        }
        $parent = null;
        if ($data['level'] !== 'province' && ! empty($data['parent_id'])) {
            $parent = Location::findOrFail($data['parent_id']);
            $expectedParentLevel = $data['level'] === 'district' ? 'province' : 'district';
            if ($parent->level !== $expectedParentLevel) {
                throw ValidationException::withMessages(['parent_id' => ['El nivel padre no corresponde a la ubicación seleccionada.']]);
            }
            if ($parent->id === $location->id || ! $parent->active) {
                throw ValidationException::withMessages(['parent_id' => ['Selecciona una ubicación padre activa y distinta.']]);
            }
        }
        $siblings = Location::query()
            ->where('level', $data['level'])
            ->where('name', $data['name']);
        if ($data['parent_id'] === null) {
            $siblings->whereNull('parent_id');
        } else {
            $siblings->where('parent_id', $data['parent_id']);
        }
        if ($id) {
            $siblings->where('id', '!=', $id);
        }
        if ($siblings->exists()) {
            throw ValidationException::withMessages(['name' => ['Ya existe una ubicación con ese nombre bajo el mismo nivel geográfico.']]);
        }
        if ($id && $location->children()->exists()) {
            foreach ($location->children as $child) {
                $expectedParentLevel = $child->level === 'district' ? 'province' : 'district';
                if ($data['level'] !== $expectedParentLevel) {
                    throw ValidationException::withMessages(['level' => ['No puedes cambiar este nivel mientras tenga ubicaciones hijas.']]);
                }
            }
        }
        $slug = $location->exists && $location->name === $data['name'] && $location->parent_id === $data['parent_id']
            ? $location->slug
            : ($parent ? $parent->slug.'-'.Str::slug($data['name']) : Str::slug($data['name']));
        if (Str::length($slug) > 120) {
            $slug = Str::substr($slug, 0, 111).'-'.substr(hash('sha256', $slug), 0, 8);
        }
        $slugCollision = Location::query()->where('slug', $slug)->when($id, fn ($query) => $query->where('id', '!=', $id))->exists();
        if ($slugCollision) {
            throw ValidationException::withMessages(['name' => ['No se pudo generar una ruta única para esta ubicación. Ajusta el nombre o la ubicación padre.']]);
        }
        $location->fill([...$data, 'slug' => $slug]);
        $location->save();
        AuditLog::create(['actor_id' => $request->user()->id, 'action' => $id ? 'catalog.location_updated' : 'catalog.location_created', 'resource_type' => 'location', 'resource_id' => $location->id, 'after_values' => $location->only(['name', 'slug', 'level', 'active', 'parent_id']), 'created_at' => now()]);

        return response()->json(['data' => $location], $id ? 200 : 201);
    }

    public function deactivateLocation(Request $request, int $id): JsonResponse
    {
        Gate::authorize('catalogs.manage');
        $location = Location::findOrFail($id);
        if ($location->children()->exists() || $location->producerProfiles()->exists()) {
            throw ValidationException::withMessages(['location' => ['La ubicación tiene zonas hijas o perfiles asociados y no se puede desactivar.']]);
        }
        $location->active = false;
        $location->save();
        AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'catalog.location_deactivated', 'resource_type' => 'location', 'resource_id' => $location->id, 'after_values' => ['active' => false], 'created_at' => now()]);

        return response()->json(['data' => ['id' => $location->id, 'active' => false]]);
    }

    public function metrics(): JsonResponse
    {
        Gate::authorize('analytics.view');
        $since = now()->subDays(30);

        return response()->json(['data' => [
            'producers' => ProducerProfile::query()->select('profile_status', DB::raw('count(*) as total'))->groupBy('profile_status')->pluck('total', 'profile_status'),
            'products' => Product::query()->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status'),
            'reports_open' => Report::query()->whereIn('status', ['new', 'reviewing'])->count(),
            'contact_intentions_30d' => ContactEvent::query()->where('occurred_at', '>=', $since)->count(),
            'searches_without_results_30d' => SearchEvent::query()->where('occurred_at', '>=', $since)->count(),
            ...$this->moderationTurnaroundMetrics($since),
        ]]);
    }

    public function exportMetrics(): StreamedResponse
    {
        Gate::authorize('analytics.view');
        $since = now()->subDays(30);
        $producers = ProducerProfile::query()->select('profile_status', DB::raw('count(*) as total'))->groupBy('profile_status')->pluck('total', 'profile_status');
        $products = Product::query()->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status');
        $moderationMetrics = $this->moderationTurnaroundMetrics($since);
        $rows = [];
        foreach ($producers as $status => $total) {
            $rows[] = ['productores', $status, (int) $total, 'total'];
        }
        foreach ($products as $status => $total) {
            $rows[] = ['publicaciones', $status, (int) $total, 'total'];
        }
        $rows[] = ['denuncias', 'abiertas', Report::query()->whereIn('status', ['new', 'reviewing'])->count(), 'actual'];
        $rows[] = ['contacto', 'intenciones', ContactEvent::query()->where('occurred_at', '>=', $since)->count(), 'últimos 30 días'];
        $rows[] = ['búsqueda', 'sin resultados', SearchEvent::query()->where('occurred_at', '>=', $since)->count(), 'últimos 30 días'];
        $rows[] = ['moderación', 'decisiones humanas', $moderationMetrics['moderation_decisions_30d'], 'últimos 30 días'];
        $rows[] = ['moderación', 'promedio hasta primera decisión (horas)', $moderationMetrics['average_moderation_hours_30d'] ?? '', 'decisiones de los últimos 30 días'];

        return response()->streamDownload(function () use ($rows): void {
            $output = fopen('php://output', 'wb');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['tipo', 'estado', 'cantidad', 'periodo']);
            foreach ($rows as $row) {
                fputcsv($output, $row);
            }
            fclose($output);
        }, 'metricas-mercado-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function moderationTurnaroundMetrics(\DateTimeInterface $since): array
    {
        $decisions = DB::table('product_status_history as decision')
            ->select(['decision.id', 'decision.product_id', 'decision.created_at'])
            ->selectSub(
                DB::table('product_status_history as submitted')
                    ->select('submitted.created_at')
                    ->whereColumn('submitted.product_id', 'decision.product_id')
                    ->where('submitted.to_status', 'pending')
                    ->whereColumn('submitted.id', '<', 'decision.id')
                    ->orderByDesc('submitted.id')
                    ->limit(1),
                'submitted_at',
            )
            ->where('decision.from_status', 'pending')
            ->whereIn('decision.to_status', ['published', 'changes_requested', 'rejected'])
            ->whereNotNull('decision.actor_id')
            ->where('decision.created_at', '>=', $since)
            ->get();

        $durationsInHours = $decisions
            ->filter(fn (object $decision): bool => $decision->submitted_at !== null)
            ->map(function (object $decision): float {
                $submittedAt = Carbon::parse($decision->submitted_at);
                $decidedAt = Carbon::parse($decision->created_at);

                return max(0, $submittedAt->diffInSeconds($decidedAt)) / 3600;
            });

        return [
            'moderation_decisions_30d' => $durationsInHours->count(),
            'average_moderation_hours_30d' => $durationsInHours->isEmpty() ? null : round($durationsInHours->avg(), 1),
        ];
    }

    public function audit(Request $request): JsonResponse
    {
        Gate::authorize('audit.view');
        $filters = $request->validate(['resource_type' => ['nullable', 'string', 'max:100'], 'action' => ['nullable', 'string', 'max:100'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $query = AuditLog::query()->with('actor:id,name')->latest('created_at');
        if (! empty($filters['resource_type'])) {
            $query->where('resource_type', $filters['resource_type']);
        }
        if (! empty($filters['action'])) {
            $query->where('action', $filters['action']);
        }

        return response()->json($query->paginate($filters['per_page'] ?? 50));
    }

    public function roles(Request $request): JsonResponse
    {
        Gate::authorize('users.manage');
        $query = Role::query()->with('permissions:id,name,description')->withCount('users')->orderBy('name');
        if (! $request->user()->hasRole('super_admin')) {
            $query->whereNotIn('name', ['admin', 'super_admin']);
        }

        return response()->json($query->get());
    }

    public function users(Request $request): JsonResponse
    {
        Gate::authorize('users.manage');
        $filters = $request->validate(['q' => ['nullable', 'string', 'max:120'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:100']]);
        $query = User::query()->with('roles:id,name,display_name')->select(['id', 'name', 'email', 'created_at'])->latest('id');
        if (! empty($filters['q'])) {
            $query->where(fn ($builder) => $builder->where('name', 'like', '%'.$filters['q'].'%')->orWhere('email', 'like', '%'.$filters['q'].'%'));
        }

        return response()->json($query->paginate($filters['per_page'] ?? 20));
    }

    public function setUserRoles(Request $request, int $id): JsonResponse
    {
        Gate::authorize('users.manage');
        $data = $request->validate(['roles' => ['required', 'array', 'min:1'], 'roles.*' => ['required', 'string', 'distinct', 'exists:roles,name'], 'reason' => ['required', 'string', 'min:5', 'max:1000']]);
        $requested = collect($data['roles'])->sort()->values()->all();
        $updatedRoles = DB::transaction(function () use ($id, $requested, $request, $data): array {
            // Serialize every role change against one row so two concurrent
            // demotions cannot both pass the last-super-admin check.
            $superAdminRole = Role::query()->where('name', 'super_admin')->lockForUpdate()->firstOrFail();
            $actor = User::query()->lockForUpdate()->findOrFail($request->user()->id);
            abort_unless($actor->hasPermission('users.manage'), 403);
            $user = User::query()->with('roles')->lockForUpdate()->findOrFail($id);
            $current = $user->roles->pluck('name')->sort()->values()->all();
            $criticalRoles = ['admin', 'super_admin'];
            $isSuperAdmin = $actor->hasRole('super_admin');
            if (! $isSuperAdmin && (array_intersect($criticalRoles, $current) || array_intersect($criticalRoles, $requested))) {
                abort(403, 'Solo un superadministrador puede asignar o modificar roles administrativos.');
            }
            if ($user->is($actor) && $user->hasRole('super_admin') && ! in_array('super_admin', $requested, true)) {
                abort(422, 'Otro superadministrador debe retirar tu rol para conservar una cuenta de emergencia.');
            }
            if ($user->hasRole('super_admin') && ! in_array('super_admin', $requested, true)) {
                if ($superAdminRole->users()->count() <= 1) {
                    abort(422, 'Debe quedar al menos un superadministrador activo.');
                }
            }
            $ids = Role::whereIn('name', $requested)->pluck('id')->all();
            $roleAssignments = collect($ids)->mapWithKeys(fn (int $roleId) => [$roleId => ['assigned_by' => $request->user()->id, 'assigned_at' => now()]])->all();
            $user->roles()->sync($roleAssignments);
            AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'admin.user_roles_changed', 'resource_type' => 'user', 'resource_id' => $user->id, 'before_values' => ['roles' => $current], 'after_values' => ['roles' => $requested], 'reason' => $data['reason'], 'created_at' => now()]);

            return $requested;
        });

        return response()->json(['data' => ['id' => $id, 'roles' => $updatedRoles]]);
    }
}
