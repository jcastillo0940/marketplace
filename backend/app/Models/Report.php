<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Report extends Model
{
    protected $fillable = ['public_reference', 'reporter_id', 'assignee_id', 'resource_type', 'resource_id', 'reason_code', 'description', 'contact_email', 'status', 'priority', 'resolved_at'];

    protected $hidden = ['reporter_id', 'contact_email'];

    protected function casts(): array
    {
        return ['resolved_at' => 'datetime'];
    }

    public function evidence(): HasMany
    {
        return $this->hasMany(ReportEvidence::class);
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }
}
