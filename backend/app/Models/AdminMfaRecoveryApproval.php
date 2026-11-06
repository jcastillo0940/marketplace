<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdminMfaRecoveryApproval extends Model
{
    public $timestamps = false;

    protected $fillable = ['request_id', 'approver_type', 'approver_id', 'decision', 'reason', 'decided_at'];

    protected function casts(): array
    {
        return ['decided_at' => 'datetime'];
    }

    public function recoveryRequest(): BelongsTo
    {
        return $this->belongsTo(AdminMfaRecoveryRequest::class, 'request_id');
    }

    /** Resolves the approver as either a User or AdminUser depending on approver_type. */
    public function approver(): BelongsTo
    {
        return $this->approver_type === 'admin_user'
            ? $this->belongsTo(\App\Models\AdminUser::class, 'approver_id')
            : $this->belongsTo(User::class, 'approver_id');
    }
}
