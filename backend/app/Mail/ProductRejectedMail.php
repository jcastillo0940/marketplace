<?php

namespace App\Mail;

use App\Models\Product;
use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class ProductRejectedMail extends Mailable
{
    public function __construct(
        public readonly User $user,
        public readonly Product $product,
        public readonly string $reason,
        public readonly bool $changesRequested = false,
    ) {}

    public function envelope(): Envelope
    {
        $subject = $this->changesRequested
            ? 'Tu publicación necesita cambios — MercaPRO'
            : 'Tu publicación no fue aprobada — MercaPRO';

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        return new Content(view: 'emails.product-rejected');
    }
}
