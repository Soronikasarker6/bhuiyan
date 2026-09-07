<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\InventoryService;

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
}
