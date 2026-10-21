<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class AdminUser extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $table = 'admin_users';

    protected $fillable = ['name', 'email', 'password'];

    protected $hidden = ['password', 'remember_token', 'two_factor_secret'];

    public function isInternalStaff(): bool
    {
        return true;
    }

    public function hasPermission(string $permission): bool
    {
        return true;
    }

    public function hasRole(string $role): bool
    {
        return $role === 'super_admin';
    }

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'two_factor_secret' => 'encrypted',
            'two_factor_confirmed_at' => 'datetime',
            'mfa_recovery_locked_at' => 'datetime',
        ];
    }
}
