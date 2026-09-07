<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShipmentClosedException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreWastageEntryRequest;
use App\Models\WastageEntry;
use App\Services\InventoryService;
use Illuminate\Http\Request;

class WastageEntryController extends Controller
{
    public function __construct(private InventoryService $inventory) {}

    public function index(Request $request)
    {
        $query = WastageEntry::with('product')->orderByDesc('date')->orderByDesc('id');
        if ($request->filled('product_id')) {
            $query->where('product_id', $request->integer('product_id'));
        }

        return $query->get()->map(fn (WastageEntry $w) => array_merge($w->toArray(), [
            'product_name' => $w->product?->name,
            'quantity_ton' => $w->quantityTon(),
        ]));
    }

    public function store(StoreWastageEntryRequest $request)
    {
        $data = $request->validated();

        try {
            $entry = $this->inventory->consumeStock(
                $data['product_id'],
                'wastage',
                $data['date'],
                (float) $data['quantity_kg'] / 1000,
                fn () => WastageEntry::create($data)
            );
        } catch (ShipmentClosedException|InsufficientStockException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($entry, 201);
    }

    public function destroy(WastageEntry $wastageEntry)
    {
        $this->inventory->deleteConsumption('wastage', $wastageEntry->id);

        return response()->json(null, 204);
    }
}
