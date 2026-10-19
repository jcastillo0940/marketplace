<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class ContactVerificationSender
{
    public function hashCode(string $code): string
    {
        return hash_hmac('sha256', $code, (string) config('app.key'));
    }

    public function matches(string $code, ?string $hash): bool
    {
        return $hash !== null && hash_equals($hash, $this->hashCode($code));
    }

    public function send(string $phone, string $code): void
    {
        $driver = config('services.contact_verification.driver') ?: (app()->environment(['local', 'testing']) ? 'fake' : 'twilio');
        if ($driver === 'fake') {
            if (! app()->environment(['local', 'testing'])) {
                throw new RuntimeException('El proveedor simulado solo está permitido fuera de producción.');
            }

            return;
        }
        if ($driver !== 'twilio') {
            throw new RuntimeException('El proveedor de verificación configurado no es compatible.');
        }

        $sid = (string) config('services.contact_verification.account_sid');
        $token = (string) config('services.contact_verification.auth_token');
        $from = (string) config('services.contact_verification.from');
        if ($sid === '' || $token === '' || $from === '') {
            throw new RuntimeException('Falta configuración del proveedor SMS.');
        }

        Http::asForm()
            ->withBasicAuth($sid, $token)
            ->timeout(10)
            ->post("https://api.twilio.com/2010-04-01/Accounts/{$sid}/Messages.json", [
                'To' => $phone,
                'From' => $from,
                'Body' => "Tu código de Mercado Solidario es {$code}. Vence en 10 minutos. No lo compartas.",
            ])
            ->throw();
    }
}
