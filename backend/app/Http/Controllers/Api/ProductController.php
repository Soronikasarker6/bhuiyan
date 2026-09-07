<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

/** The raw-material / finished-good catalog — dynamic, not hardcoded. */
class ProductController extends Controller
{
    public function index()
    {
        return Product::orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['required', 'string', 'max:40', 'unique:products,code'],
            'description' => ['nullable', 'string', 'max:255'],
            'unit' => ['required', 'string', 'max:40'],
            'active' => ['boolean'],
        ]);

        return response()->json(Product::create($data), 201);
    }

    public function update(Request $request, Product $product)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => ['required', 'string', 'max:40', 'unique:products,code,'.$product->id],
            'description' => ['nullable', 'string', 'max:255'],
            'unit' => ['required', 'string', 'max:40'],
            'active' => ['boolean'],
        ]);

        $product->update($data);

        return $product;
    }

    public function destroy(Product $product)
    {
        return $this->guardedDelete(
            fn () => $product->delete(),
            'This product is still referenced by shipments, production, or sales — deactivate it instead of deleting.'
        );
    }
}
