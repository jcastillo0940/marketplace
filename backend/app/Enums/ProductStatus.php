<?php

namespace App\Enums;

enum ProductStatus: string
{
    case Draft = 'draft';
    case Pending = 'pending';
    case ChangesRequested = 'changes_requested';
    case Published = 'published';
    case Paused = 'paused';
    case SoldOut = 'sold_out';
    case Rejected = 'rejected';
    case Suspended = 'suspended';
    case Withdrawn = 'withdrawn';

    public function isPubliclyAvailable(): bool
    {
        return $this === self::Published;
    }
}
