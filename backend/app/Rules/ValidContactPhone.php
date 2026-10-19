<?php

namespace App\Rules;

use App\Support\PanamaPhoneNumber;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class ValidContactPhone implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (PanamaPhoneNumber::normalize($value) === null) {
            $fail('Ingresa ocho dígitos de Panamá o un número internacional válido con código de país.');
        }
    }
}
