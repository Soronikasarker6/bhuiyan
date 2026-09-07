<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\InventoryService;
use Illuminate\Http\Request;

/** ShipmentCycleRow[] — one row per shipment cycle, for the Shipment History tab/report. */
class ShipmentCycleController extends Controller
{
    public function __construct(private InventoryService $inventory) {}

    public function index(Request $request)
    {
        $productId = $request->integer('product_id') ?: null;

        return $this->inventory->allShipmentCycles($productId)
            ->map(fn ($cycle) => [
                'id' => $cycle['shipment']->id,
                'product_id' => $cycle['shipment']->product_id,
                'product_name' => $cycle['shipment']->product?->name
                    ?? Product::find($cycle['shipment']->product_id)?->name,
                'date' => $cycle['shipment']->date->toDateString(),
                'ship_name' => $cycle['shipment']->ship_name,
                'serial_no' => $cycle['shipment']->serial_no,
                'truck_no' => $cycle['shipment']->truck_no,
                'received_ton' => $cycle['received_ton'],
                'opening_ton' => $cycle['opening_ton'],
                'available_ton' => $cycle['available_ton'],
                'consumed_ton' => $cycle['consumed_ton'],
                'closing_ton' => $cycle['closing_ton'],
                'status' => $cycle['shipment']->status ?? 'open',
                'closed_at' => optional($cycle['shipment']->closing_closed_at)->toIso8601String(),
            ])
            ->sortByDesc(fn ($row) => $row['date'])
            ->values();
    }
}
