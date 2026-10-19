<?php

namespace App\Models;

use App\Enums\AdminMfaRecoveryStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AdminMfaRecoveryRequest extends Model
{
    protected $fillable = ['requester_user_id', 'reason', 'status', 'requested_at', 'expires_at', 'closed_at'];

    protected function casts(): array
    {
        return [
            'status' => AdminMfaRecoveryStatus::class,
            'requested_at' => 'datetime',
            'expires_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requester_user_id');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(AdminMfaRecoveryApproval::class, 'request_id');
    }
}
