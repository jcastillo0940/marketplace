<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdminMfaRecoveryApproval extends Model
{
    public $timestamps = false;

    protected $fillable = ['request_id', 'approver_id', 'decision', 'reason', 'decided_at'];

    protected function casts(): array
    {
        return ['decided_at' => 'datetime'];
    }

    public function recoveryRequest(): BelongsTo
    {
        return $this->belongsTo(AdminMfaRecoveryRequest::class, 'request_id');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_id');
    }
}
