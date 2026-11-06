<?php

namespace App\Enums;

enum ProducerVerificationLevel: string
{
    case Unverified = 'unverified';
    case ContactConfirmed = 'contact_confirmed';
    case IdentityReviewed = 'identity_reviewed';
    case BiometricVerified = 'biometric_verified';
    case ProducerValidated = 'producer_validated';

    public function label(): string
    {
        return match ($this) {
            self::Unverified => 'Contacto sin confirmar',
            self::ContactConfirmed => 'Teléfono confirmado',
            self::IdentityReviewed => 'Verificado',
            self::BiometricVerified => 'Verificado Pro',
            self::ProducerValidated => 'Productor Super Carnes',
        };
    }
}
