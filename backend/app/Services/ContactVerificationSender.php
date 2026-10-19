<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
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

    public function send(string $destination, string $code): void
    {
        $driver = config('services.contact_verification.driver') ?: (app()->environment(['local', 'testing']) ? 'fake' : 'twilio');
        if ($driver === 'fake') {
            if (! app()->environment(['local', 'testing'])) {
                throw new RuntimeException('El proveedor simulado solo está permitido fuera de producción.');
            }

            return;
        }
        if ($driver === 'email') {
            if ($destination === '') {
                throw new RuntimeException('No hay correo disponible para enviar el código de verificación.');
            }
            Mail::html(
                '<p>Tu código de verificación para <strong>El Empujoncito</strong> es:</p>'
                .'<h2 style="letter-spacing:0.2em">'.$code.'</h2>'
                .'<p>Vence en 10 minutos. No lo compartas.</p>',
                fn ($m) => $m->to($destination)->subject('Código de verificación - El Empujoncito')
            );

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
                'To' => $destination,
                'From' => $from,
                'Body' => "Tu código de El Empujoncito es {$code}. Vence en 10 minutos. No lo compartas.",
            ])
            ->throw();
    }
}
