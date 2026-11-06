<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminUser;
use App\Models\AuditLog;
use App\Models\ProducerProfile;
use App\Models\ProducerStory;
use App\Services\ProductPhotoOptimizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/** Historias y experiencias que cada productor comparte; se publican solo después de la revisión humana. */
class ProducerStoryController extends Controller
{
    /** Historias activas (pendientes o publicadas) que un productor puede tener a la vez. */
    private const ACTIVE_LIMIT = 5;

    public function index(Request $request): JsonResponse
    {
        $stories = ProducerStory::query()->publiclyVisible()
            ->with('producer:id,slug,public_name,activity,location_id', 'producer.location.parent.parent')
            ->latest('published_at')->paginate(min(max((int) $request->query('per_page', 12), 1), 24));
        $stories->getCollection()->transform(fn (ProducerStory $story) => $this->present($story, 'public'));

        return response()->json($stories);
    }

    public function show(int $id): JsonResponse
    {
        $story = ProducerStory::query()->publiclyVisible()
            ->with('producer:id,slug,public_name,activity,location_id', 'producer.location.parent.parent')
            ->findOrFail($id);

        return response()->json(['data' => $this->present($story, 'public')]);
    }

    public function publicImage(Request $request, int $id)
    {
        return $this->imageResponse(ProducerStory::query()->publiclyVisible()->findOrFail($id), $request, 'public, max-age=86400');
    }

    public function mine(Request $request): JsonResponse
    {
        $profile = $this->profile($request);

        return response()->json(['data' => $profile->stories()->latest('submitted_at')->get()->map(fn (ProducerStory $story) => $this->present($story, 'owner'))]);
    }

    public function store(Request $request, ProductPhotoOptimizer $photoOptimizer): JsonResponse
    {
        $profile = $this->profile($request);
        abort_unless($profile->profile_status === 'active', 409, 'Tu perfil debe estar activo para compartir historias.');
        $data = $this->validated($request);
        abort_if($profile->stories()->whereIn('status', ['pending', 'published'])->count() >= self::ACTIVE_LIMIT, 409, 'Puedes tener hasta '.self::ACTIVE_LIMIT.' historias activas. Retira una antes de enviar otra.');

        $story = $this->persist(new ProducerStory(['producer_profile_id' => $profile->id, 'submitted_by' => $request->user()->id]), $data, $request, $photoOptimizer);
        AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'story.submitted', 'resource_type' => 'producer_story', 'resource_id' => $story->id, 'after_values' => ['status' => 'pending', 'producer_profile_id' => $profile->id], 'created_at' => now()]);

        return response()->json(['data' => $this->present($story, 'owner')], 201);
    }

    public function update(Request $request, int $id, ProductPhotoOptimizer $photoOptimizer): JsonResponse
    {
        $profile = $this->profile($request);
        abort_unless($profile->profile_status === 'active', 409, 'Tu perfil debe estar activo para editar historias.');
        $story = $profile->stories()->findOrFail($id);
        $data = $this->validated($request);
        $before = $story->status;

        $story = $this->persist($story, $data, $request, $photoOptimizer);
        AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'story.updated', 'resource_type' => 'producer_story', 'resource_id' => $story->id, 'before_values' => ['status' => $before], 'after_values' => ['status' => 'pending'], 'created_at' => now()]);

        return response()->json(['data' => $this->present($story, 'owner')]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $story = $this->profile($request)->stories()->findOrFail($id);
        $paths = array_filter([$story->image_path, $story->thumbnail_path]);
        $disk = $story->image_disk;
        $story->delete();
        if ($disk && $paths) {
            Storage::disk($disk)->delete($paths);
        }
        AuditLog::create(['actor_id' => $request->user()->id, 'action' => 'story.deleted', 'resource_type' => 'producer_story', 'resource_id' => $id, 'created_at' => now()]);

        return response()->json(['data' => ['id' => $id, 'deleted' => true]]);
    }

    public function ownerImage(Request $request, int $id)
    {
        return $this->imageResponse($this->profile($request)->stories()->findOrFail($id), $request, 'private, no-store');
    }

    public function queue(Request $request): JsonResponse
    {
        Gate::authorize('products.review');
        $status = in_array($request->query('status'), ['pending', 'published', 'rejected'], true) ? $request->query('status') : 'pending';
        $stories = ProducerStory::query()->where('status', $status)
            ->with('producer:id,slug,public_name,activity,location_id,profile_status', 'producer.location.parent.parent')
            ->orderBy($status === 'pending' ? 'submitted_at' : 'reviewed_at', $status === 'pending' ? 'asc' : 'desc')
            ->paginate(20);
        $stories->getCollection()->transform(fn (ProducerStory $story) => $this->present($story, 'admin'));

        return response()->json($stories);
    }

    public function decide(Request $request, int $id): JsonResponse
    {
        Gate::authorize('products.review');
        $data = $request->validate([
            'decision' => ['required', 'in:approve,reject,unpublish'],
            'note' => ['required_unless:decision,approve', 'nullable', 'string', 'min:5', 'max:1000'],
        ]);
        $isAdmin = $request->user() instanceof AdminUser;

        $story = DB::transaction(function () use ($data, $id, $request, $isAdmin): ProducerStory {
            $story = ProducerStory::query()->whereKey($id)->lockForUpdate()->firstOrFail();
            $allowed = $data['decision'] === 'unpublish' ? ['published'] : ['pending'];
            abort_unless(in_array($story->status, $allowed, true), 409, 'Esta historia cambió de estado. Actualiza la cola e inténtalo de nuevo.');
            $before = $story->status;
            $status = $data['decision'] === 'approve' ? 'published' : 'rejected';
            $story->forceFill([
                'status' => $status,
                'review_note' => $data['note'] ?? null,
                'reviewed_by_admin_id' => $isAdmin ? $request->user()->id : null,
                'reviewed_at' => now(),
                'published_at' => $status === 'published' ? now() : null,
            ])->save();
            AuditLog::create([
                $isAdmin ? 'admin_actor_id' : 'actor_id' => $request->user()->id,
                'action' => 'story.'.$data['decision'], 'resource_type' => 'producer_story', 'resource_id' => $story->id,
                'before_values' => ['status' => $before], 'after_values' => ['status' => $status], 'reason' => $data['note'] ?? null, 'created_at' => now(),
            ]);

            return $story;
        });

        return response()->json(['data' => ['id' => $story->id, 'status' => $story->status]]);
    }

    public function adminImage(Request $request, int $id)
    {
        Gate::authorize('products.review');

        return $this->imageResponse(ProducerStory::query()->findOrFail($id), $request, 'private, no-store');
    }

    private function profile(Request $request): ProducerProfile
    {
        return ProducerProfile::query()->where('user_id', $request->user()->id)->firstOrFail();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'min:5', 'max:120'],
            'quote' => ['nullable', 'string', 'max:220'],
            'body' => ['required', 'string', 'min:80', 'max:4000'],
            'video_url' => ['nullable', 'string', 'max:300'],
            'image' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'dimensions:min_width=300,min_height=300,max_width=6000,max_height=6000', 'max:5120'],
            'remove_image' => ['nullable', 'boolean'],
        ]);
        $data['video'] = null;
        if (filled($data['video_url'] ?? null)) {
            $data['video'] = ProducerStory::parseVideoUrl($data['video_url']);
            if ($data['video'] === null) {
                throw ValidationException::withMessages(['video_url' => 'Usa un enlace de YouTube o Vimeo, por ejemplo https://youtu.be/…']);
            }
        }

        return $data;
    }

    /** Guarda texto, video y foto; cualquier cambio vuelve a la cola de revisión. */
    private function persist(ProducerStory $story, array $data, Request $request, ProductPhotoOptimizer $photoOptimizer): ProducerStory
    {
        $disk = config('filesystems.media');
        $oldPaths = array_filter([$story->image_path, $story->thumbnail_path]);
        $oldDisk = $story->image_disk;
        $newPaths = null;
        if ($request->hasFile('image')) {
            $newPaths = $photoOptimizer->store($request->file('image'), $disk, 'stories/'.$story->producer_profile_id);
        }

        try {
            $story->fill([
                'title' => trim($data['title']),
                'quote' => filled($data['quote'] ?? null) ? trim($data['quote']) : null,
                'body' => trim($data['body']),
                'video_provider' => $data['video'][0] ?? null,
                'video_id' => $data['video'][1] ?? null,
                'status' => 'pending',
                'review_note' => null,
                'submitted_at' => now(),
                'reviewed_at' => null,
                'published_at' => null,
            ]);
            if ($newPaths) {
                $story->fill(['image_disk' => $disk, 'image_path' => $newPaths['path'], 'thumbnail_path' => $newPaths['thumbnail_path']]);
            } elseif (! empty($data['remove_image'])) {
                $story->fill(['image_disk' => null, 'image_path' => null, 'thumbnail_path' => null]);
            }
            $story->save();
        } catch (\Throwable $exception) {
            if ($newPaths) {
                Storage::disk($disk)->delete(array_values($newPaths));
            }
            throw $exception;
        }

        if (($newPaths || ! empty($data['remove_image'])) && $oldDisk && $oldPaths) {
            Storage::disk($oldDisk)->delete($oldPaths);
        }

        return $story->fresh();
    }

    private function imageResponse(ProducerStory $story, Request $request, string $cacheControl)
    {
        abort_unless($story->image_disk && $story->image_path, 404);
        $storage = Storage::disk($story->image_disk);
        $path = $request->query('variant') === 'thumbnail' && $story->thumbnail_path && $storage->exists($story->thumbnail_path) ? $story->thumbnail_path : $story->image_path;
        abort_unless($storage->exists($path), 404);

        return $storage->response($path, null, ['Cache-Control' => $cacheControl, 'X-Content-Type-Options' => 'nosniff', 'Content-Disposition' => 'inline']);
    }

    /** @return array<string, mixed> */
    private function present(ProducerStory $story, string $audience): array
    {
        $imageBase = match ($audience) {
            'owner' => "/api/me/stories/{$story->id}/image",
            'admin' => "/api/admin/stories/{$story->id}/image",
            default => "/api/stories/{$story->id}/image",
        };
        $hasImage = $story->image_path !== null;
        $producer = $story->relationLoaded('producer') ? $story->producer : null;
        $location = $producer?->location;
        $presented = [
            'id' => $story->id,
            'title' => $story->title,
            'quote' => $story->quote,
            'body' => $story->body,
            'video' => $story->video_provider ? ['provider' => $story->video_provider, 'id' => $story->video_id] : null,
            'image_url' => $hasImage ? url($imageBase).'?v='.$story->updated_at?->timestamp : null,
            'thumbnail_url' => $hasImage ? url($imageBase).'?variant=thumbnail&v='.$story->updated_at?->timestamp : null,
            'published_at' => $story->published_at?->toIso8601String(),
            'producer' => $producer ? [
                'public_name' => $producer->public_name,
                'slug' => $producer->slug,
                'activity' => $producer->activity,
                'location' => $location ? ['name' => $location->name, 'parent' => $location->parent ? ['name' => $location->parent->name, 'parent' => $location->parent->parent ? ['name' => $location->parent->parent->name] : null] : null] : null,
            ] : null,
        ];
        if ($audience !== 'public') {
            $presented += ['status' => $story->status, 'review_note' => $story->review_note, 'submitted_at' => $story->submitted_at?->toIso8601String(), 'reviewed_at' => $story->reviewed_at?->toIso8601String()];
        }
        if ($audience === 'admin') {
            $presented['producer']['profile_status'] = $producer?->profile_status;
        }

        return $presented;
    }
}
