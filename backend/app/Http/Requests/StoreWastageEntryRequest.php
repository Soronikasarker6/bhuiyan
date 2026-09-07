<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreWastageEntryRequest extends FormRequest
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
            'quantity_kg' => ['required', 'numeric', 'gt:0'],
            'reason' => ['nullable', 'string', 'max:200'],
        ];
    }
}
