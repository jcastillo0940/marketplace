<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Symfony\Component\Process\Process;

/**
 * Runs biometrics/face_match.py (OpenCV YuNet + SFace) to compare a selfie with the photo on a cédula.
 * The comparison happens on the server, so the result does not depend on the producer's browser.
 */
class FaceMatcher
{
    /** Above this cosine similarity the faces are a clear match (the approval can be automatic). */
    public const STRONG = 0.55;

    /** OpenCV's recommended threshold for "same person" with SFace. Between this and STRONG, a person decides. */
    public const POSSIBLE = 0.363;

    /**
     * @return array{status: string, similarity: float|null, result: string}
     *   status: ok | no_face_selfie | no_face_cedula | unavailable
     *   result: strong | possible | no_match | unavailable
     */
    public function compare(string $selfiePath, string $cedulaPath): array
    {
        $python = base_path('biometrics/.venv/bin/python');
        $script = base_path('biometrics/face_match.py');
        if (! is_executable($python) || ! is_file($script)) {
            Log::warning('Face matcher is not installed.');

            return ['status' => 'unavailable', 'similarity' => null, 'result' => 'unavailable'];
        }

        $process = new Process([$python, '-I', $script, $selfiePath, $cedulaPath]);
        $process->setTimeout(45);
        try {
            $process->run();
        } catch (\Throwable $error) {
            Log::warning('Face matcher failed to run.', ['error' => $error->getMessage()]);

            return ['status' => 'unavailable', 'similarity' => null, 'result' => 'unavailable'];
        }

        $output = json_decode(trim($process->getOutput()), true);
        if (! $process->isSuccessful() || ! is_array($output) || ! isset($output['status'])) {
            Log::warning('Face matcher returned an unexpected result.', ['exit' => $process->getExitCode(), 'stderr' => mb_substr($process->getErrorOutput(), 0, 500)]);

            return ['status' => 'unavailable', 'similarity' => null, 'result' => 'unavailable'];
        }

        if ($output['status'] !== 'ok') {
            $status = in_array($output['status'], ['no_face_selfie', 'no_face_cedula'], true) ? $output['status'] : 'unavailable';

            return ['status' => $status, 'similarity' => null, 'result' => 'unavailable'];
        }

        $similarity = (float) $output['cosine'];

        return [
            'status' => 'ok',
            'similarity' => $similarity,
            'result' => $similarity >= self::STRONG ? 'strong' : ($similarity >= self::POSSIBLE ? 'possible' : 'no_match'),
        ];
    }
}
