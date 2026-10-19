<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SearchEvent extends Model
{
    public $timestamps = false;

    protected $fillable = ['filters', 'occurred_at'];

    protected function casts(): array
    {
        return ['filters' => 'array', 'occurred_at' => 'datetime'];
    }
}
