<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\InventoryService;
use Illuminate\Http\Request;

/** "Raw material" and "Product" are the same catalog — see App\Models\Product. */
class RawMaterialController extends Controller
{
    public function __construct(private InventoryService $inventory) {}

    public function index()
    {
        return $this->inventory->allRawMaterialStock();
    }

    public function stock(Product $product)
    {
        return $this->inventory->getCurrentStock($product->id);
    }

    /**
     * The Raw Material report: current raw stock per limestone type, with the
     * imported/production/wastage movements it is the result of.
     *
     * `product_id` narrows it to one limestone type; `from`/`to` bound the three
     * movement figures, in which case `opening_ton` carries in what was already
     * on hand so the column still adds up to the closing figure.
     */
    public function report(Request $request)
    {
        $data = $request->validate([
            'product_id' => ['nullable', 'exists:products,id'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        return $this->inventory->allRawStockSummaries(
            isset($data['product_id']) ? (int) $data['product_id'] : null,
            $data['from'] ?? null,
            $data['to'] ?? null,
        );
    }
}
