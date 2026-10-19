<?php

namespace App\Rules;

use App\Models\Location;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class ValidActiveLocationHierarchy implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_numeric($value)) {
            return;
        }

        $location = Location::query()->with('parent.parent')->find($value);
        if ($location === null || ! $location->active) {
            $fail('Selecciona una ubicación activa.');

            return;
        }

        $validHierarchy = match ($location->level) {
            'province' => $location->parent_id === null,
            'district' => $location->parent?->active && $location->parent->level === 'province',
            'corregimiento' => $location->parent?->active
                && $location->parent->level === 'district'
                && $location->parent->parent?->active
                && $location->parent->parent->level === 'province',
            default => false,
        };

        if (! $validHierarchy) {
            $fail('La ubicación debe pertenecer a una jerarquía activa de provincia, distrito y corregimiento.');
        }
    }
}
