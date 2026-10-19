<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReportEvidence extends Model
{
    protected $fillable = ['report_id', 'private_disk', 'private_path', 'mime_type', 'size_bytes'];

    protected $hidden = ['private_disk', 'private_path'];

    public function report(): BelongsTo
    {
        return $this->belongsTo(Report::class);
    }
}
