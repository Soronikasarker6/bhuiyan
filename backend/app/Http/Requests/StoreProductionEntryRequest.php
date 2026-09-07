<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProductionEntryRequest extends FormRequest
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
            'mesh_id' => ['required', 'exists:mesh_sizes,id'],
            'bags' => ['required', 'integer', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:255'],
        ];
    }
}
