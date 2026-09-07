<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreShipmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'date' => ['required', 'date', 'before_or_equal:today'],
            'product_id' => ['required', 'exists:products,id'],
            'ship_name' => ['nullable', 'string', 'max:120'],
            'serial_no' => ['nullable', 'string', 'max:60'],
            'truck_no' => ['nullable', 'string', 'max:40'],
            'gross_weight_kg' => ['required', 'numeric', 'gt:0'],
            'tare_weight_kg' => ['required', 'numeric', 'gte:0', 'lt:gross_weight_kg'],
            'price_per_ton' => ['nullable', 'numeric', 'gte:0'],
            'notes' => ['nullable', 'string', 'max:300'],
        ];
    }

    public function messages(): array
    {
        return [
            'tare_weight_kg.lt' => 'Tare weight must be less than gross weight — net weight cannot be zero or negative.',
        ];
    }
}
