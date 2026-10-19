<?php

namespace App\Enums;

enum ProducerVerificationLevel: string
{
    case Unverified = 'unverified';
    case ContactConfirmed = 'contact_confirmed';
    case IdentityReviewed = 'identity_reviewed';
    case ProducerValidated = 'producer_validated';

    public function label(): string
    {
        return match ($this) {
            self::Unverified => 'Contacto sin confirmar',
            self::ContactConfirmed => 'Contacto confirmado',
            self::IdentityReviewed => 'Identidad revisada',
            self::ProducerValidated => 'Productor validado',
        };
    }
}
