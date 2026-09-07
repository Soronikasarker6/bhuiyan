<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShipmentClosedException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductionEntryRequest;
use App\Models\MeshSize;
use App\Models\ProductionEntry;
use App\Services\InventoryService;
use Illuminate\Http\Request;

class ProductionEntryController extends Controller
{
    public function __construct(private InventoryService $inventory) {}

    public function index(Request $request)
    {
        $query = ProductionEntry::with(['product', 'mesh'])->orderByDesc('date')->orderByDesc('id');
        if ($request->filled('product_id')) {
            $query->where('product_id', $request->integer('product_id'));
        }
        if ($request->filled('mesh_id')) {
            $query->where('mesh_id', $request->integer('mesh_id'));
        }

        return $query->get()->map(fn (ProductionEntry $p) => array_merge($p->toArray(), [
            'product_name' => $p->product?->name,
            'mesh_name' => $p->mesh?->name,
        ]));
    }

    public function store(StoreProductionEntryRequest $request)
    {
        $data = $request->validated();
        $bagKg = (float) MeshSize::findOrFail($data['mesh_id'])->bag_kg;
        $tons = ((float) $data['bags'] * $bagKg) / 1000;

        try {
            $entry = $this->inventory->consumeStock(
                $data['product_id'],
                'production',
                $data['date'],
                $tons,
                fn () => ProductionEntry::create($data)
            );
        } catch (ShipmentClosedException|InsufficientStockException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($entry, 201);
    }

    public function destroy(ProductionEntry $productionEntry)
    {
        $this->inventory->deleteConsumption('production', $productionEntry->id);

        return response()->json(null, 204);
    }
}
