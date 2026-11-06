<?php

namespace App\Mail;

use App\Models\Product;
use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class ProductApprovedMail extends Mailable
{
    public function __construct(
        public readonly User $user,
        public readonly Product $product,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Tu publicación fue aprobada — MercaPRO');
    }

    public function content(): Content
    {
        return new Content(view: 'emails.product-approved');
    }
}
