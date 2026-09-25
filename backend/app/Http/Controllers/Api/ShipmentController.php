<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreShipmentRequest;
use App\Models\RawMaterialImport;
use App\Services\AuditLogger;
use App\Services\InventoryService;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use App\Support\StaleWrite;
use Illuminate\Http\Request;

class ShipmentController extends Controller
{
    public function __construct(
        private InventoryService $inventory,
        private AuditLogger $audit,
    ) {}

    public function index(Request $request)
    {
        $query = RawMaterialImport::with('product')->orderByDesc('date')->orderByDesc('id');

        if ($request->filled('product_id')) {
            $query->where('product_id', $request->integer('product_id'));
        }
        if ($request->filled('status')) {
            $status = $request->string('status');
            $query->whereHas('shipment', fn ($q) => $q->where('status', $status));
        }
        if ($request->filled('from')) {
            $query->where('date', '>=', $request->string('from'));
        }
        if ($request->filled('to')) {
            $query->where('date', '<=', $request->string('to'));
        }

        return $query->get()->map(fn (RawMaterialImport $i) => $this->present($i));
    }

    public function store(StoreShipmentRequest $request)
    {
        $shipment = $this->inventory->receiveStock($request->validated());

        $this->audit->record(AuditEntity::RAW_MATERIAL_IMPORT, $shipment->id, AuditAction::CREATE, [
            'record' => $this->reference($shipment),
            'after' => $this->auditSnapshot($shipment),
            'reason' => $request->input('reason'),
            'summary' => sprintf(
                'Received %s TON of %s',
                $this->ton($shipment),
                $shipment->product?->name ?? 'raw material',
            ),
        ]);

        return response()->json($this->present($shipment), 201);
    }

    public function update(StoreShipmentRequest $request, RawMaterialImport $shipment)
    {
        if ($stale = StaleWrite::check($shipment, $request->input('expected_updated_at'))) {
            return $stale;
        }

        $before = $this->auditSnapshot($shipment);

        try {
            $shipment = $this->inventory->updateShipment($shipment->id, $request->validated());
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->audit->recordUpdate(
            AuditEntity::RAW_MATERIAL_IMPORT,
            $shipment->id,
            $before,
            $this->auditSnapshot($shipment),
            ['record' => $this->reference($shipment), 'reason' => $request->input('reason')],
        );

        return $this->present($shipment);
    }

    public function destroy(Request $request, RawMaterialImport $shipment)
    {
        $before = $this->auditSnapshot($shipment);
        $reference = $this->reference($shipment);
        $productName = $shipment->product?->name;
        $ton = $this->ton($shipment);

        try {
            $this->inventory->deleteShipment($shipment->id);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->audit->record(AuditEntity::RAW_MATERIAL_IMPORT, $shipment->id, AuditAction::DELETE, [
            'record' => $reference,
            'before' => $before,
            'reason' => $request->input('reason'),
            'summary' => sprintf('Deleted import of %s TON of %s', $ton, $productName ?? 'raw material'),
        ]);

        return response()->json(null, 204);
    }

    private function present(RawMaterialImport $shipment): array
    {
        return $shipment->loadMissing('product')->toPresentedArray();
    }

    /**
     * The presented row (net weight and tons already derived) rather than the
     * raw columns, so an audit diff says "30 TON → 32 TON" the way the screen
     * itself does instead of only showing the gross/tare kilos behind it.
     */
    private function auditSnapshot(RawMaterialImport $shipment): array
    {
        return $this->audit->snapshot($this->present($shipment)) ?? [];
    }

    private function reference(RawMaterialImport $shipment): string
    {
        return $shipment->serial_no ?: 'IMP-'.str_pad((string) $shipment->id, 6, '0', STR_PAD_LEFT);
    }

    private function ton(RawMaterialImport $shipment): string
    {
        return number_format((float) ($this->present($shipment)['net_weight_ton'] ?? 0), 3);
    }
}
