<?php

namespace App\Enums;

enum AdminMfaRecoveryStatus: string
{
    case PendingFirstApproval = 'pending_first_approval';
    case AwaitingSecondApproval = 'awaiting_second_approval';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Expired = 'expired';
    case Cancelled = 'cancelled';
    case Enrolled = 'enrolled';

    public function isOpen(): bool
    {
        return in_array($this, [self::PendingFirstApproval, self::AwaitingSecondApproval], true);
    }
}
