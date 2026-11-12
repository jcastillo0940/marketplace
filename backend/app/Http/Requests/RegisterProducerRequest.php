<?php

namespace App\Http\Requests;

use App\Rules\ValidActiveLocationHierarchy;
use App\Rules\ValidContactPhone;
use App\Support\PanamaPhoneNumber;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterProducerRequest extends FormRequest
{
    protected function prepareForValidation(): void
    {
        foreach (['ruc', 'ruc_dv'] as $field) {
            $value = trim((string) $this->input($field, ''));
            $this->merge([$field => $value === '' ? null : strtoupper($value)]);
        }

        $phone = PanamaPhoneNumber::normalize($this->input('phone'));
        if ($phone !== null) {
            $this->merge(['phone' => $phone]);
        }
    }

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function messages(): array
    {
        return [
            'password.min'   => 'La contraseña debe tener al menos 6 caracteres.',
            'password.regex' => 'La contraseña debe incluir al menos una letra, un número y un carácter especial.',
            'cedula.regex'   => 'Formato de cédula inválido. Ejemplo: 8-123-4567 o E-8-12345.',
            'cedula.unique'  => 'Ya existe una cuenta registrada con esa cédula.',
            'ruc.regex'      => 'Formato de RUC inválido. Ejemplo: 8-123-4567 o 155612345-2-2015.',
            'ruc.unique'     => 'Ya existe una cuenta registrada con ese RUC.',
            'ruc_dv.regex'   => 'El dígito verificador debe tener uno o dos números.',
            'ruc_dv.required_with' => 'Ingresa el dígito verificador de tu RUC.',
            'ruc.required_if' => 'Las empresas deben indicar su RUC.',
            'ruc_dv.required_if' => 'Las empresas deben indicar el dígito verificador de su RUC.',
            'ruc.prohibited_if' => 'Las cooperativas se registran con su pacto social, no con RUC.',
            'ruc_dv.prohibited_if' => 'Las cooperativas se registran con su pacto social, no con RUC.',
            'activities.*.exists' => 'Selecciona actividades de la lista.',
            'pacto_social.mimes' => 'El pacto social debe ser un archivo JPG, PNG o PDF.',
            'pacto_social.max' => 'El pacto social no puede pesar más de 10 MB.',
            'cedula_photo.mimes' => 'La foto de la cédula debe ser JPG, PNG o PDF.',
            'cedula_photo.max' => 'La foto de la cédula no puede pesar más de 10 MB.',
            'aviso_operacion.mimes' => 'El aviso de operación debe ser JPG, PNG o PDF.',
            'aviso_operacion.max' => 'El aviso de operación no puede pesar más de 10 MB.',
            'email.unique'   => 'Ya existe una cuenta registrada con ese correo electrónico.',
        ];
    }

    /** Without an email the account is keyed on the phone (see AuthController), so a reused phone must be reported. */
    public function withValidator(\Illuminate\Validation\Validator $validator): void
    {
        $validator->after(function (\Illuminate\Validation\Validator $validator): void {
            if (trim((string) $this->input('email', '')) !== '' || $validator->errors()->has('phone')) {
                return;
            }
            $phone = PanamaPhoneNumber::normalize($this->input('phone'));
            if ($phone !== null && \App\Models\User::where('email', 'ph-'.$phone.'@mercapro.internal')->exists()) {
                $validator->errors()->add('phone', 'Ya existe una cuenta registrada con ese teléfono. Agrega un correo electrónico o inicia sesión.');
            }
        });
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6', 'regex:/^(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$/'],
            'cedula' => ['required', 'string', 'max:30', 'regex:/^([0-9]{1,2}[A-Z]?|[A-Z]{1,3})-[0-9]{1,4}-[0-9]{1,6}$/i', Rule::unique('producer_profiles', 'cedula')],
            'ruc' => ['nullable', 'required_if:vendor_type,distribuidor', 'prohibited_if:vendor_type,cooperativa', 'string', 'max:30', 'regex:/^[0-9A-Z]+(-[0-9A-Z]+){1,4}$/', Rule::unique('producer_profiles', 'ruc')],
            'ruc_dv' => ['nullable', 'required_with:ruc', 'required_if:vendor_type,distribuidor', 'prohibited_if:vendor_type,cooperativa', 'string', 'regex:/^[0-9]{1,2}$/'],
            // Documents are optional at sign-up; without the one for their type the producer cannot publish yet.
            'pacto_social' => ['exclude_unless:vendor_type,cooperativa', 'nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
            'cedula_photo' => ['exclude_unless:vendor_type,productor', 'nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
            'aviso_operacion' => ['exclude_if:vendor_type,cooperativa', 'nullable', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:10240'],
            'public_name' => ['required', 'string', 'max:120'],
            'activities' => ['nullable', 'array', 'max:20'],
            'activities.*' => ['string', 'max:120', Rule::exists('categories', 'name')->where('active', true)->whereNull('parent_id')],
            'vendor_type' => ['nullable', 'string', 'in:productor,cooperativa,distribuidor'],
            'payment_methods' => ['nullable', 'array'],
            'payment_methods.*' => ['string', 'in:efectivo,yappy,transferencia,tarjeta,cheque,credito'],
            'location_id' => ['required', 'integer', new ValidActiveLocationHierarchy],
            'phone' => ['required', 'string', 'max:40', new ValidContactPhone],
            'terms_version' => ['required', 'string', 'max:40', Rule::in([config('marketplace.consent_versions.terms')])],
            'privacy_version' => ['required', 'string', 'max:40', Rule::in([config('marketplace.consent_versions.privacy')])],
            'registration_method' => ['nullable', 'in:self,assisted'],
            'producer_authorized' => ['exclude_unless:registration_method,assisted', 'required', 'accepted'],
            'terms_confirmed' => ['required', 'accepted'],
            'privacy_confirmed' => ['required', 'accepted'],
        ];
    }
}
