<?php

namespace App\Services;

use App\Models\SystemSetting;
use Illuminate\Mail\Mailer;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Transport\Smtp\EsmtpTransport;

class MarketMailer
{
    /**
     * Build a Mailer from the DB SMTP settings, or fall back to the app default.
     */
    public static function mailer(): \Illuminate\Contracts\Mail\Mailer
    {
        $cfg = SystemSetting::getSmtpConfig();

        if (empty($cfg['host']) || empty($cfg['username'])) {
            return Mail::mailer();
        }

        $transport = new EsmtpTransport(
            host: $cfg['host'],
            port: (int) $cfg['port'],
            tls: in_array($cfg['encryption'], ['ssl', 'tls'], true),
        );
        $transport->setUsername($cfg['username']);
        $transport->setPassword($cfg['password'] ?? '');

        $laravelMailer = new Mailer('market-smtp', app('view'), $transport, app('events'));
        $laravelMailer->alwaysFrom($cfg['from_address'], $cfg['from_name']);

        return $laravelMailer;
    }

    public static function send(\Illuminate\Mail\Mailable $mailable): void
    {
        // Every mailable carries the producer as $user; it never set a recipient, so nothing was delivered.
        $email = property_exists($mailable, 'user') ? $mailable->user?->email : null;
        if (empty($mailable->to) && (! $email || str_ends_with($email, '@mercapro.internal'))) {
            return; // Phone-only accounts have no real inbox.
        }
        if (empty($mailable->to)) {
            $mailable->to($email);
        }
        try {
            static::mailer()->send($mailable);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('MarketMailer send failed', [
                'mailable' => get_class($mailable),
                'error'    => $e->getMessage(),
            ]);
        }
    }
}
