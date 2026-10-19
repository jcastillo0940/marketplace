<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\ContactEvent;
use App\Models\ProducerProfile;
use App\Models\Product;
use App\Models\Report;
use App\Models\ReportEvidence;
use App\Models\RiskSignal;
use App\Support\PanamaPhoneNumber;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class TrustSafetyController extends Controller
{
    public function contact(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['nullable', 'integer', 'required_without:producer_id', 'prohibits:producer_id'],
            'producer_id' => ['nullable', 'integer', 'required_without:product_id', 'prohibits:product_id'],
            'channel' => ['required', 'in:whatsapp,phone'],
        ]);
        $key = 'contact:'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 20)) {
            return response()->json(['message' => 'Espera un momento antes de registrar más contactos.'], 429);
        }
        RateLimiter::hit($key, 3600);
        $productId = null;
        if (isset($data['product_id'])) {
            $product = Product::query()->publiclyAvailable()->with('producer')->findOrFail($data['product_id']);
            abort_unless(PanamaPhoneNumber::normalize($product->producer?->phone_public), 404);
            $productId = $product->id;
            $producerId = $product->producer_profile_id;
        } else {
            $producer = ProducerProfile::query()->where('profile_status', 'active')->whereNotNull('phone_verified_at')->whereNotNull('phone_public')->findOrFail($data['producer_id']);
            abort_unless(PanamaPhoneNumber::normalize($producer->phone_public), 404);
            $producerId = $producer->id;
        }
        $targetKey = $productId === null ? 'producer:'.$producerId : 'product:'.$productId;
        ContactEvent::firstOrCreate(['dedupe_key' => hash('sha256', implode('|', [$request->ip(), $targetKey, $data['channel'], now()->format('Y-m-d-H')]))], ['product_id' => $productId, 'producer_profile_id' => $producerId, 'channel' => $data['channel'], 'occurred_at' => now()]);

        return response()->json(['message' => 'Intención de contacto registrada. Esto no confirma una conversación ni una venta.'], 202);
    }

    public function report(Request $request): JsonResponse
    {
        $data = $request->validate(['resource_type' => ['required', 'in:product,producer'], 'resource_id' => ['required', 'integer'], 'reason_code' => ['required', 'in:incorrect,unavailable,suspicious,unsafe,other'], 'description' => ['required', 'string', 'min:10', 'max:1000'], 'contact_email' => ['nullable', 'email', 'max:255'], 'evidence' => ['nullable', 'array', 'max:3'], 'evidence.*' => ['file', 'mimes:jpg,jpeg,png,pdf', 'max:5120']]);
        if ($data['resource_type'] === 'product') {
            Product::query()->publiclyAvailable()->findOrFail($data['resource_id']);
        } else {
            ProducerProfile::query()->where('profile_status', 'active')->findOrFail($data['resource_id']);
        }
        $key = 'report:'.$request->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json(['message' => 'Espera un momento antes de enviar otro reporte.'], 429);
        }
        RateLimiter::hit($key, 3600);
        $mediaDisk = config('filesystems.media');
        $storedPaths = [];
        try {
            $report = DB::transaction(function () use ($request, $data, $mediaDisk, &$storedPaths): Report {
                $report = Report::create(['public_reference' => (string) Str::uuid(), 'reporter_id' => $request->user()?->id, 'resource_type' => $data['resource_type'], 'resource_id' => $data['resource_id'], 'reason_code' => $data['reason_code'], 'description' => $data['description'], 'contact_email' => $data['contact_email'] ?? null]);
                foreach ($request->file('evidence', []) as $file) {
                    $path = $file->store("reports/{$report->id}", $mediaDisk);
                    $storedPaths[] = $path;
                    $report->evidence()->create(['private_disk' => $mediaDisk, 'private_path' => $path, 'mime_type' => $file->getMimeType(), 'size_bytes' => $file->getSize()]);
                }
                AuditLog::create(['actor_id' => $request->user()?->id, 'action' => 'trust_safety.report_received', 'resource_type' => 'report', 'resource_id' => $report->id, 'after_values' => ['status' => $report->status, 'resource_type' => $report->resource_type, 'resource_id' => $report->resource_id, 'reason_code' => $report->reason_code], 'created_at' => now()]);

                return $report;
            });
        } catch (\Throwable $exception) {
            Storage::disk($mediaDisk)->delete($storedPaths);
            throw $exception;
        }

        $windowStart = now()->subHours(24);
        $reportCount = Report::query()
            ->where('resource_type', $report->resource_type)
            ->where('resource_id', $report->resource_id)
            ->where('created_at', '>=', $windowStart)
            ->count();
        if ($reportCount >= 3) {
            $firstReport = Report::query()
                ->where('resource_type', $report->resource_type)
                ->where('resource_id', $report->resource_id)
                ->where('created_at', '>=', $windowStart)
                ->oldest('created_at')
                ->oldest('id')
                ->firstOrFail(['id', 'created_at']);
            $signalKey = "repeated_reports:{$report->resource_type}:{$report->resource_id}:{$firstReport->id}";
            DB::transaction(function () use ($signalKey, $report, $reportCount, $firstReport): void {
                $signal = RiskSignal::query()->where('signal_key', $signalKey)->lockForUpdate()->first();
                $evidence = ['report_count_24h' => $reportCount, 'window_hours' => 24, 'rule' => 'same_resource_report_threshold'];
                if (! $signal) {
                    RiskSignal::query()->firstOrCreate(
                        ['signal_key' => $signalKey],
                        [
                            'signal_type' => 'repeated_reports',
                            'resource_type' => $report->resource_type,
                            'resource_id' => $report->resource_id,
                            'severity' => 'warning',
                            'explanation' => 'Tres o más reportes recibidos para el mismo recurso en 24 horas. Requiere revisión humana; no determina fraude.',
                            'evidence' => $evidence,
                            'status' => 'open',
                            'first_seen_at' => $firstReport->created_at,
                            'last_seen_at' => now(),
                        ],
                    );

                    return;
                }

                $updates = ['evidence' => $evidence, 'last_seen_at' => now()];
                if (in_array($signal->status, ['resolved', 'dismissed'], true)) {
                    $updates += [
                        'status' => 'open',
                        'assignee_id' => null,
                        'reviewed_by' => null,
                        'resolution_note' => null,
                        'reviewed_at' => null,
                        'closed_at' => null,
                        'first_seen_at' => $firstReport->created_at,
                    ];
                }
                $signal->forceFill($updates)->save();
            });
        }

        return response()->json(['reference' => $report->public_reference, 'message' => 'Recibimos tu reporte. El equipo lo revisará.'], 202);
    }

    public function cases(Request $request): JsonResponse
    {
        Gate::authorize('reports.review');
        $data = $request->validate(['status' => ['nullable', 'in:new,reviewing,resolved,dismissed'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:50']]);
        $query = Report::query()->with(['evidence', 'assignee:id,name'])
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END")
            ->oldest();
        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        } else {
            $query->whereIn('status', ['new', 'reviewing']);
        }

        return response()->json($query->paginate($data['per_page'] ?? 20)->through(function (Report $report): Report {
            $hours = (int) config('trust_safety.report_sla_hours.'.$report->priority, 72);
            $dueAt = $report->created_at?->copy()->addHours($hours);
            $report->setAttribute('sla_due_at', $dueAt);
            $report->setAttribute('sla_overdue', $dueAt !== null && $dueAt->isPast());

            return $report;
        }));
    }

    public function caseDetail(int $id): JsonResponse
    {
        Gate::authorize('reports.review');
        $report = Report::query()->with(['evidence', 'assignee:id,name'])->findOrFail($id);
        $hours = (int) config('trust_safety.report_sla_hours.'.$report->priority, 72);
        $dueAt = $report->created_at?->copy()->addHours($hours);
        $resource = $report->resource_type === 'product'
            ? Product::query()->whereKey($report->resource_id)->first(['id', 'title', 'slug', 'status'])
            : ProducerProfile::query()->whereKey($report->resource_id)->first(['id', 'public_name', 'slug', 'profile_status']);
        $evidenceIds = $report->evidence->pluck('id');
        $history = AuditLog::query()->with('actor:id,name')
            ->where(function ($query) use ($report, $evidenceIds): void {
                $query->where(fn ($reports) => $reports->where('resource_type', 'report')->where('resource_id', $report->id));
                if ($evidenceIds->isNotEmpty()) {
                    $query->orWhere(fn ($evidence) => $evidence->where('resource_type', 'report_evidence')->whereIn('resource_id', $evidenceIds));
                }
            })
            ->oldest('created_at')->get()->map(function (AuditLog $audit): array {
                $before = $audit->before_values ?? [];
                $after = $audit->after_values ?? [];
                $changes = [];
                foreach (['status', 'priority', 'assignee_id'] as $field) {
                    if (array_key_exists($field, $before) || array_key_exists($field, $after)) {
                        $changes[$field] = ['from' => $before[$field] ?? null, 'to' => $after[$field] ?? null];
                    }
                }

                return [
                    'action' => $audit->action,
                    'reason' => $audit->reason,
                    'changes' => $changes,
                    'actor' => $audit->actor ? ['name' => $audit->actor->name] : null,
                    'created_at' => $audit->created_at,
                ];
            })->values();

        return response()->json(['data' => [
            'id' => $report->id,
            'public_reference' => $report->public_reference,
            'resource_type' => $report->resource_type,
            'resource_id' => $report->resource_id,
            'resource' => $resource ? [
                'type' => $report->resource_type,
                'id' => $resource->id,
                'label' => $report->resource_type === 'product' ? $resource->title : $resource->public_name,
                'slug' => $resource->slug,
            ] : null,
            'reason_code' => $report->reason_code,
            'description' => $report->description,
            'status' => $report->status,
            'priority' => $report->priority,
            'assignee_id' => $report->assignee_id,
            'assignee' => $report->assignee ? ['id' => $report->assignee->id, 'name' => $report->assignee->name] : null,
            'can_release' => $report->status === 'reviewing' && $report->assignee_id === request()->user()?->id,
            'created_at' => $report->created_at,
            'sla_due_at' => $dueAt,
            'sla_overdue' => $dueAt !== null && $dueAt->isPast(),
            'evidence' => $report->evidence->map(fn (ReportEvidence $evidence): array => [
                'id' => $evidence->id,
                'mime_type' => $evidence->mime_type,
                'size_bytes' => $evidence->size_bytes,
                'created_at' => $evidence->created_at,
            ])->values(),
            'history' => $history,
        ]]);
    }

    public function alerts(Request $request): JsonResponse
    {
        Gate::authorize('security.alerts.view');
        $data = $request->validate(['status' => ['nullable', 'in:open,reviewing,resolved,dismissed'], 'per_page' => ['nullable', 'integer', 'min:1', 'max:50']]);
        $query = RiskSignal::query()->with('assignee:id,name')->latest('last_seen_at');
        if (! empty($data['status'])) {
            $query->where('status', $data['status']);
        } else {
            $query->whereIn('status', ['open', 'reviewing']);
        }

        return response()->json($query->paginate($data['per_page'] ?? 20));
    }

    public function updateAlert(Request $request, int $id): JsonResponse
    {
        Gate::authorize('security.alerts.manage');
        $data = $request->validate([
            'status' => ['required', 'in:reviewing,resolved,dismissed'],
            'resolution_note' => ['required', 'string', 'min:10', 'max:1000'],
        ]);

        $signal = DB::transaction(function () use ($data, $id, $request): RiskSignal {
            $signal = RiskSignal::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            $allowed = ['open' => ['reviewing', 'dismissed'], 'reviewing' => ['resolved', 'dismissed']];
            abort_unless(in_array($data['status'], $allowed[$signal->status] ?? [], true), 409, 'La transición no está permitida desde el estado actual.');
            abort_if($signal->assignee_id !== null && $signal->assignee_id !== $request->user()->id, 409, 'Esta alerta está asignada a otro moderador.');

            $before = ['status' => $signal->status, 'assignee_id' => $signal->assignee_id];
            $signal->forceFill([
                'status' => $data['status'],
                'assignee_id' => $signal->assignee_id ?? $request->user()->id,
                'reviewed_by' => $request->user()->id,
                'resolution_note' => $data['resolution_note'],
                'reviewed_at' => now(),
                'closed_at' => in_array($data['status'], ['resolved', 'dismissed'], true) ? now() : null,
            ])->save();
            AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'trust_safety.risk_signal_updated', 'resource_type' => 'risk_signal', 'resource_id' => $signal->id, 'before_values' => $before, 'after_values' => ['status' => $signal->status, 'assignee_id' => $signal->assignee_id], 'reason' => $data['resolution_note'], 'created_at' => now()]);

            return $signal->fresh();
        });

        return response()->json(['data' => ['id' => $signal->id, 'status' => $signal->status, 'assignee_id' => $signal->assignee_id, 'reviewed_by' => $signal->reviewed_by, 'resolution_note' => $signal->resolution_note, 'reviewed_at' => $signal->reviewed_at, 'closed_at' => $signal->closed_at]]);
    }

    public function releaseCase(Request $request, int $id): JsonResponse
    {
        Gate::authorize('reports.review');
        $data = $request->validate(['resolution_note' => ['required', 'string', 'min:10', 'max:1000']]);
        $report = DB::transaction(function () use ($data, $id, $request): Report {
            $report = Report::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            abort_unless($report->status === 'reviewing', 409, 'Solo se puede liberar un caso que esté en revisión.');
            abort_unless($report->assignee_id === $request->user()->id, 409, 'Solo el responsable actual puede liberar este caso.');
            $before = ['status' => $report->status, 'assignee_id' => $report->assignee_id];
            $report->forceFill(['status' => 'new', 'assignee_id' => null, 'resolved_at' => null])->save();
            AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'trust_safety.report_released', 'resource_type' => 'report', 'resource_id' => $report->id, 'before_values' => $before, 'after_values' => ['status' => $report->status, 'assignee_id' => null], 'reason' => $data['resolution_note'], 'created_at' => now()]);

            return $report->fresh(['assignee:id,name']);
        });

        return response()->json(['data' => ['id' => $report->id, 'status' => $report->status, 'assignee_id' => $report->assignee_id, 'assignee' => $report->assignee]]);
    }

    public function updateCase(Request $request, int $id): JsonResponse
    {
        Gate::authorize('reports.review');
        $data = $request->validate(['status' => ['required', 'in:reviewing,resolved,dismissed'], 'priority' => ['nullable', 'in:low,normal,high,urgent'], 'resolution_note' => ['required', 'string', 'min:5', 'max:1000']]);
        $report = DB::transaction(function () use ($data, $id, $request): Report {
            $report = Report::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            $allowed = ['new' => ['reviewing', 'dismissed'], 'reviewing' => ['resolved', 'dismissed']];
            if (! in_array($data['status'], $allowed[$report->status] ?? [], true)) {
                throw ValidationException::withMessages(['status' => ['La transición no está permitida desde el estado actual.']]);
            }
            abort_if($report->assignee_id !== null && $report->assignee_id !== $request->user()->id, 409, 'Este caso está asignado a otro moderador.');
            $before = ['status' => $report->status, 'priority' => $report->priority, 'assignee_id' => $report->assignee_id];
            $report->status = $data['status'];
            $report->priority = $data['priority'] ?? $report->priority;
            $report->assignee_id ??= $request->user()->id;
            $report->resolved_at = in_array($data['status'], ['resolved', 'dismissed'], true) ? now() : null;
            $report->save();
            AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'trust_safety.report_updated', 'resource_type' => 'report', 'resource_id' => $report->id, 'before_values' => $before, 'after_values' => ['status' => $report->status, 'priority' => $report->priority, 'assignee_id' => $report->assignee_id], 'reason' => $data['resolution_note'], 'created_at' => now()]);

            return $report->fresh(['assignee:id,name']);
        });

        return response()->json(['data' => ['id' => $report->id, 'status' => $report->status, 'priority' => $report->priority, 'assignee_id' => $report->assignee_id, 'assignee' => $report->assignee, 'resolved_at' => $report->resolved_at]]);
    }

    public function updateCasePriority(Request $request, int $id): JsonResponse
    {
        Gate::authorize('reports.review');
        $data = $request->validate(['priority' => ['required', 'in:low,normal,high,urgent']]);
        $report = DB::transaction(function () use ($data, $id, $request): Report {
            $report = Report::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            abort_if($report->assignee_id !== null && $report->assignee_id !== $request->user()->id, 409, 'Este caso está asignado a otro moderador.');
            $before = $report->priority;
            if ($before !== $data['priority']) {
                $report->priority = $data['priority'];
                $report->save();
                AuditLog::create([
                    'actor_id' => $request->user()->id,
                    'action' => 'trust_safety.report_priority_changed',
                    'resource_type' => 'report',
                    'resource_id' => $report->id,
                    'before_values' => ['priority' => $before],
                    'after_values' => ['priority' => $report->priority],
                    'reason' => 'Prioridad y plazo de atención ajustados durante el triaje.',
                    'created_at' => now(),
                ]);
            }

            return $report->fresh();
        });

        $hours = (int) config('trust_safety.report_sla_hours.'.$report->priority, 72);
        $dueAt = $report->created_at?->copy()->addHours($hours);

        return response()->json(['data' => [
            'id' => $report->id,
            'status' => $report->status,
            'priority' => $report->priority,
            'assignee_id' => $report->assignee_id,
            'sla_due_at' => $dueAt,
            'sla_overdue' => $dueAt !== null && $dueAt->isPast(),
        ]]);
    }

    public function evidence(Request $request, int $id, int $evidenceId)
    {
        Gate::authorize('reports.review');
        $evidence = ReportEvidence::query()->where('report_id', $id)->findOrFail($evidenceId);
        abort_unless(Storage::disk($evidence->private_disk)->exists($evidence->private_path), 404);
        AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'trust_safety.report_evidence_viewed', 'resource_type' => 'report_evidence', 'resource_id' => $evidence->id, 'created_at' => now()]);

        return Storage::disk($evidence->private_disk)->response($evidence->private_path, null, ['Cache-Control' => 'private, no-store', 'X-Content-Type-Options' => 'nosniff', 'Content-Disposition' => 'attachment']);
    }
}
