<?php

namespace App\Mail;

use App\Models\ProducerProfile;
use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class ProducerProfileApprovedMail extends Mailable
{
    public function __construct(
        public readonly User $user,
        public readonly ProducerProfile $profile,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Tu perfil fue aprobado — MercaPRO');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.producer-profile-approved');
    }
}
