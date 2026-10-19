<?php

namespace Tests\Unit;

use App\Services\Totp;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class TotpTest extends TestCase
{
    #[DataProvider('rfc6238Vectors')]
    public function test_generates_rfc6238_sha1_six_digit_codes(int $timestamp, string $expected): void
    {
        $totp = new Totp;
        $secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
        $this->assertSame($expected, $totp->code($secret, intdiv($timestamp, 30)));
        $this->assertTrue($totp->verify($secret, $expected, $timestamp));
    }

    public static function rfc6238Vectors(): array
    {
        return [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924']];
    }
}
