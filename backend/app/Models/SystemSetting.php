<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

class SystemSetting extends Model
{
    protected $primaryKey = 'key';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = ['key', 'value', 'encrypted'];

    protected function casts(): array
    {
        return ['encrypted' => 'boolean'];
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $setting = static::find($key);
        if ($setting === null) {
            return $default;
        }
        if ($setting->encrypted && $setting->value !== null) {
            return Crypt::decryptString($setting->value);
        }

        return $setting->value;
    }

    public static function set(string $key, mixed $value, bool $encrypted = false): void
    {
        $stored = $encrypted && $value !== null ? Crypt::encryptString((string) $value) : $value;
        static::updateOrCreate(
            ['key' => $key],
            ['value' => $stored, 'encrypted' => $encrypted]
        );
    }

    public static function getSmtpConfig(): array
    {
        return [
            'host'       => static::get('smtp_host', ''),
            'port'       => (int) static::get('smtp_port', 465),
            'encryption' => static::get('smtp_encryption', 'ssl'),
            'username'   => static::get('smtp_username', ''),
            'password'   => static::get('smtp_password', ''),
            'from_address' => static::get('smtp_from_address', ''),
            'from_name'  => static::get('smtp_from_name', 'MercaPRO'),
        ];
    }
}
