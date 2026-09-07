<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'date' => ['required', 'date', 'before_or_equal:today'],
            'customer_id' => ['required', 'exists:customers,id'],
            'truck_no' => ['nullable', 'string', 'max:40'],
            'notes' => ['nullable', 'string', 'max:500'],
            'paid_at_sale' => ['nullable', 'numeric', 'gte:0'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'exists:products,id'],
            'items.*.mesh_size_id' => ['required', 'exists:mesh_sizes,id'],
            'items.*.bags' => ['required', 'integer', 'gt:0'],
            'items.*.rate_per_ton' => ['required', 'numeric', 'gt:0'],
            'items.*.actual_weight_ton' => ['nullable', 'numeric', 'gt:0'],
        ];
    }

    /** Cannot collect more at sale time than the invoice total. */
    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $items = $this->input('items', []);
            $total = 0.0;
            foreach ($items as $item) {
                if (! isset($item['bags'], $item['rate_per_ton'], $item['mesh_size_id'])) {
                    continue;
                }
                $mesh = \App\Models\MeshSize::find($item['mesh_size_id']);
                if (! $mesh) {
                    continue;
                }
                $calculated = ((float) $item['bags'] * (float) $mesh->bag_kg) / 1000;
                $actual = (float) ($item['actual_weight_ton'] ?? 0);
                $weight = $actual > 0 ? $actual : $calculated;
                $total += $weight * (float) $item['rate_per_ton'];
            }

            $paid = (float) $this->input('paid_at_sale', 0);
            if ($paid > $total) {
                $validator->errors()->add('paid_at_sale', 'Cannot collect more than the invoice total.');
            }
        });
    }
}
