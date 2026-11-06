<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProducerStory extends Model
{
    protected $fillable = ['producer_profile_id', 'submitted_by', 'title', 'quote', 'body', 'video_provider', 'video_id', 'image_disk', 'image_path', 'thumbnail_path', 'status', 'review_note', 'reviewed_by_admin_id', 'submitted_at', 'reviewed_at', 'published_at'];

    protected $hidden = ['image_disk', 'image_path', 'thumbnail_path', 'submitted_by', 'reviewed_by_admin_id'];

    protected function casts(): array
    {
        return ['submitted_at' => 'datetime', 'reviewed_at' => 'datetime', 'published_at' => 'datetime'];
    }

    public function producer(): BelongsTo
    {
        return $this->belongsTo(ProducerProfile::class, 'producer_profile_id');
    }

    /** Historias aprobadas de productores activos; lo único que ve el público. */
    public function scopePubliclyVisible(Builder $query): Builder
    {
        return $query->where('status', 'published')
            ->whereHas('producer', fn ($producer) => $producer->where('profile_status', 'active'));
    }

    /**
     * Normaliza un enlace de YouTube o Vimeo a [proveedor, id]; null si no es un video admitido.
     *
     * @return array{0: string, 1: string}|null
     */
    public static function parseVideoUrl(string $url): ?array
    {
        $url = trim($url);
        if (preg_match('~^https?://(?:www\.|m\.)?(?:youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/)|youtu\.be/)([A-Za-z0-9_-]{11})~', $url, $match)) {
            return ['youtube', $match[1]];
        }
        if (preg_match('~^https?://(?:www\.|player\.)?vimeo\.com/(?:video/)?(\d{6,12})~', $url, $match)) {
            return ['vimeo', $match[1]];
        }

        return null;
    }
}
