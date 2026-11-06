<?php

namespace App\Services;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;

/**
 * Identity files live in the same R2 bucket as product photos, and that bucket is public:
 * R2 ignores per-object visibility. Contents are therefore encrypted before upload, and
 * can only be read back through an authorized route. Never hand out storage URLs for them.
 */
class SensitiveFileStore
{
    private const DISK = 'r2';

    private const INLINE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

    public function put(string $path, string $contents): bool
    {
        return (bool) Storage::disk(self::DISK)->put($path, Crypt::encrypt($contents, false));
    }

    /** @param array<int, string|null> $paths */
    public function delete(array $paths): bool
    {
        $paths = array_values(array_filter($paths));

        return $paths === [] || Storage::disk(self::DISK)->delete($paths);
    }

    public function response(string $path): Response
    {
        $payload = Storage::disk(self::DISK)->get($path);
        abort_if($payload === null, 404);

        $contents = Crypt::decrypt($payload, false);
        $type = (new \finfo(FILEINFO_MIME_TYPE))->buffer($contents);
        $inline = in_array($type, self::INLINE_TYPES, true);

        return response($contents, 200, [
            'Content-Type' => $inline ? $type : 'application/octet-stream',
            'Content-Disposition' => $inline ? 'inline' : 'attachment',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => 'sandbox',
        ]);
    }
}
