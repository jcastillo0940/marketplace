<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Unit extends Model
{
    protected $fillable = ['code', 'name', 'position', 'active'];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    /**
     * Compared in PHP on purpose: MySQL collation would accept "Lb" or "galon" as matches.
     *
     * @return list<string>
     */
    public static function activeCodes(): array
    {
        return self::query()->where('active', true)->pluck('code')->all();
    }
}
