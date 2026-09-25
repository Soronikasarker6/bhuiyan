<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Shipment;
use App\Services\AuditLogger;
use App\Services\InventoryService;
use App\Support\AuditAction;
use App\Support\AuditEntity;
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
    public function __construct(
        private InventoryService $inventory,
        private AuditLogger $audit,
    ) {}

    public function index(Request $request)
    {
        $productId = $request->integer('product_id') ?: null;

        return $this->inventory->allShipmentCycles($productId)
            ->map(fn ($cycle) => $this->present($cycle))
            ->sortByDesc(fn ($row) => $row['opened_on'])
            ->values();
    }

    public function close(Request $request, int $shipment)
    {
        $before = $this->present($this->cycleFor($shipment));

        try {
            $this->inventory->closeShipment($shipment);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $after = $this->present($this->cycleFor($shipment));

        // Closing a cycle freezes what that shipment can still be consumed
        // against, so it is its own audited event, not an UPDATE buried in the
        // import rows (§18).
        $this->audit->record(AuditEntity::SHIPMENT_CYCLE, $shipment, AuditAction::CLOSE_SHIPMENT, [
            'record' => $this->cycleReference($after),
            'before' => $before,
            'after' => $after,
            'reason' => $request->input('reason'),
            'summary' => sprintf(
                'Closed %s cycle opened %s · closing stock %s TON',
                $after['product_name'] ?? 'shipment',
                $after['opened_on'],
                number_format((float) $after['closing_ton'], 3),
            ),
        ]);

        return $after;
    }

    public function reopen(Request $request, int $shipment)
    {
        $before = $this->present($this->cycleFor($shipment));

        try {
            $this->inventory->reopenShipment($shipment);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $after = $this->present($this->cycleFor($shipment));

        $this->audit->record(AuditEntity::SHIPMENT_CYCLE, $shipment, AuditAction::REOPEN_SHIPMENT, [
            'record' => $this->cycleReference($after),
            'before' => $before,
            'after' => $after,
            'reason' => $request->input('reason'),
            'summary' => sprintf(
                'Reopened %s cycle opened %s',
                $after['product_name'] ?? 'shipment',
                $after['opened_on'],
            ),
        ]);

        return $after;
    }

    private function cycleReference(array $cycle): string
    {
        return 'CYC-'.str_pad((string) $cycle['id'], 4, '0', STR_PAD_LEFT);
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
