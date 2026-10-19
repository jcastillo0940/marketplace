<?php

namespace App\Services;

class Totp
{
    private const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public function secret(int $length = 32): string
    {
        $secret = '';
        for ($index = 0; $index < $length; $index++) {
            $secret .= self::BASE32[random_int(0, 31)];
        }

        return $secret;
    }

    public function verify(string $secret, string $code, ?int $timestamp = null): bool
    {
        if (! preg_match('/^\d{6}$/', $code)) {
            return false;
        }
        $counter = intdiv($timestamp ?? time(), 30);
        for ($window = -1; $window <= 1; $window++) {
            if (hash_equals($this->code($secret, $counter + $window), $code)) {
                return true;
            }
        }

        return false;
    }

    public function code(string $secret, int $counter): string
    {
        $key = $this->decode($secret);
        $digest = hash_hmac('sha1', pack('N2', 0, $counter), $key, true);
        $offset = ord($digest[19]) & 0x0F;
        $number = unpack('N', substr($digest, $offset, 4))[1] & 0x7FFFFFFF;

        return str_pad((string) ($number % 1_000_000), 6, '0', STR_PAD_LEFT);
    }

    private function decode(string $secret): string
    {
        $bits = '';
        foreach (str_split(strtoupper($secret)) as $character) {
            $value = strpos(self::BASE32, $character);
            if ($value === false) {
                throw new \InvalidArgumentException('Invalid Base32 secret.');
            }
            $bits .= str_pad(decbin($value), 5, '0', STR_PAD_LEFT);
        }
        $bytes = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $bytes .= chr(bindec($byte));
            }
        }

        return $bytes;
    }
}
