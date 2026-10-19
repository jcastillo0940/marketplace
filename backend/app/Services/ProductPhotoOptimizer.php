<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class ProductPhotoOptimizer
{
    private const MAX_EDGE = 1600;

    private const THUMBNAIL_MAX_EDGE = 480;

    /** @return array{path: string, thumbnail_path: string} */
    public function store(UploadedFile $upload, string $disk, string $directory): array
    {
        $source = @imagecreatefromstring(file_get_contents($upload->getRealPath()));
        if ($source === false) {
            throw new RuntimeException('No se pudo procesar la fotografía.');
        }

        try {
            $originalContents = $this->encodeWebp($source, self::MAX_EDGE);
            $thumbnailContents = $this->encodeWebp($source, self::THUMBNAIL_MAX_EDGE);
            $base = trim($directory, '/').'/'.Str::uuid();
            $path = $base.'.webp';
            $thumbnailPath = $base.'-480.webp';
            $storage = Storage::disk($disk);

            if (! $storage->put($path, $originalContents)) {
                throw new RuntimeException('No se pudo guardar la fotografía.');
            }

            if (! $storage->put($thumbnailPath, $thumbnailContents)) {
                if (! $storage->delete($path)) {
                    Log::warning('No se pudo retirar la imagen original después de fallar su miniatura.', ['disk' => $disk, 'path' => $path]);
                }
                throw new RuntimeException('No se pudo guardar la miniatura de la fotografía.');
            }

            return ['path' => $path, 'thumbnail_path' => $thumbnailPath];
        } finally {
            imagedestroy($source);
        }
    }

    private function encodeWebp(\GdImage $source, int $maxEdge): string
    {
        $width = imagesx($source);
        $height = imagesy($source);
        $scale = min(1, $maxEdge / max($width, $height));
        $targetWidth = max(1, (int) round($width * $scale));
        $targetHeight = max(1, (int) round($height * $scale));
        $optimized = imagecreatetruecolor($targetWidth, $targetHeight);
        imagealphablending($optimized, false);
        $transparent = imagecolorallocatealpha($optimized, 255, 255, 255, 127);
        imagefill($optimized, 0, 0, $transparent);
        imagesavealpha($optimized, true);
        imagecopyresampled($optimized, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);

        ob_start();
        $encoded = imagewebp($optimized, null, 82);
        $contents = ob_get_clean();
        imagedestroy($optimized);

        if (! $encoded || $contents === false) {
            throw new RuntimeException('No se pudo optimizar la fotografía.');
        }

        return $contents;
    }
}
