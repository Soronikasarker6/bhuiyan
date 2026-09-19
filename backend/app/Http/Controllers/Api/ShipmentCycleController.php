<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Shipment;
use App\Services\InventoryService;
use Illuminate\Http\Request;

/**
 * ShipmentCycleRow[] — one row per shipment (inventory) cycle, for the
 * Shipment History tab. Close/reopen live here rather than on
 * `ShipmentController` because they act on the *cycle*, not on one import
 * entry — `ShipmentController` still owns create/edit/delete of the import
 * rows themselves.
 */
class ShipmentCycleController extends Controller
{
    public function __construct(private InventoryService $inventory) {}

    public function index(Request $request)
    {
        $productId = $request->integer('product_id') ?: null;

        return $this->inventory->allShipmentCycles($productId)
            ->map(fn ($cycle) => $this->present($cycle))
            ->sortByDesc(fn ($row) => $row['opened_on'])
            ->values();
    }

    public function close(int $shipment)
    {
        try {
            $this->inventory->closeShipment($shipment);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->present($this->cycleFor($shipment));
    }

    public function reopen(int $shipment)
    {
        try {
            $this->inventory->reopenShipment($shipment);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->present($this->cycleFor($shipment));
    }

    private function cycleFor(int $shipmentId): array
    {
        $shipment = Shipment::findOrFail($shipmentId);

        return $this->inventory->shipmentCycles((int) $shipment->product_id)
            ->first(fn ($c) => $c['shipment']->id === $shipmentId);
    }

    private function present(array $cycle): array
    {
        return [
            'id' => $cycle['shipment']->id,
            'product_id' => $cycle['shipment']->product_id,
            'product_name' => $cycle['shipment']->product?->name
                ?? Product::find($cycle['shipment']->product_id)?->name,
            'opened_on' => $cycle['shipment']->opened_on->toDateString(),
            'received_ton' => $cycle['received_ton'],
            'opening_ton' => $cycle['opening_ton'],
            'available_ton' => $cycle['available_ton'],
            'consumed_ton' => $cycle['consumed_ton'],
            'wastage_ton' => $cycle['wastage_ton'],
            'closing_ton' => $cycle['closing_ton'],
            'status' => $cycle['shipment']->status ?? 'open',
            'closed_at' => optional($cycle['shipment']->closing_closed_at)->toIso8601String(),
        ];
    }
}
