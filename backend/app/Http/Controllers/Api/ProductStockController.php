<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\InventoryService;
use Illuminate\Http\Request;

/** Bagged mesh stock — separate from raw-material tonnage. See InventoryService. */
class ProductStockController extends Controller
{
    public function __construct(private InventoryService $inventory) {}

    public function meshStock(Product $product)
    {
        return $this->inventory->meshStockSummary($product->id);
    }

    public function stockLedger(Request $request, Product $product)
    {
        $meshId = $request->integer('mesh_id');
        abort_if(! $meshId, 422, 'mesh_id is required.');

        return $this->inventory->stockLedger($product->id, $meshId);
    }
}
