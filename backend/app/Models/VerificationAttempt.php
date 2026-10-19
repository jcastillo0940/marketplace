<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VerificationAttempt extends Model
{
    public $timestamps = false;

    protected $fillable = ['producer_verification_id', 'result', 'attempted_at'];

    protected function casts(): array
    {
        return ['attempted_at' => 'datetime'];
    }
}
