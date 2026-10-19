<?php

namespace App\Support;

final class PanamaPhoneNumber
{
    public static function normalize(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = trim($value);
        if ($value === '' || ! preg_match('/^\+?[0-9\s().-]+$/', $value)) {
            return null;
        }

        $digits = preg_replace('/[\s().-]/', '', $value);
        if (! is_string($digits) || $digits === '') {
            return null;
        }

        if (str_starts_with($digits, '00')) {
            $digits = '+'.substr($digits, 2);
        } elseif (! str_starts_with($digits, '+')) {
            if (strlen($digits) === 8) {
                $digits = '+507'.$digits;
            } elseif (strlen($digits) === 11 && str_starts_with($digits, '507')) {
                $digits = '+'.$digits;
            } else {
                return null;
            }
        }

        return preg_match('/^\+[1-9][0-9]{7,14}$/', $digits) ? $digits : null;
    }
}
