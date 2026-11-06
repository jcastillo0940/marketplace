<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProducerProfile;
use App\Services\SensitiveFileStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DocumentController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $profile = ProducerProfile::where('user_id', $request->user()->id)->firstOrFail();

        return response()->json(['data' => [
            'has_cedula_photo' => $profile->cedula_photo_path !== null,
            'has_pacto_social' => $profile->pacto_social_path !== null,
            'has_aviso_operacion' => $profile->aviso_operacion_path !== null,
        ]]);
    }

    public function upload(Request $request, SensitiveFileStore $files): JsonResponse
    {
        $request->validate([
            'type' => ['required', 'in:cedula_photo,pacto_social,aviso_operacion'],
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
        ]);

        $profile = ProducerProfile::where('user_id', $request->user()->id)->firstOrFail();
        $type = $request->input('type');
        $file = $request->file('file');
        $path = "documents/{$profile->id}/{$type}.{$file->extension()}.enc";

        abort_unless($files->put($path, $file->get()), 503, 'No pudimos guardar el documento. Inténtalo de nuevo.');

        $existing = $profile->{$type.'_path'};
        if ($existing && $existing !== $path) {
            $files->delete([$existing]);
        }

        $profile->update([$type.'_path' => $path]);

        return response()->json(['data' => ['uploaded' => true, 'type' => $type]], 200);
    }
}
