<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreShipmentRequest;
use App\Models\RawMaterialImport;
use App\Services\InventoryService;
use Illuminate\Http\Request;

class ShipmentController extends Controller
{
    public function __construct(private InventoryService $inventory) {}

    public function index(Request $request)
    {
        $query = RawMaterialImport::with('product')->orderByDesc('date')->orderByDesc('id');

        if ($request->filled('product_id')) {
            $query->where('product_id', $request->integer('product_id'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
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

        return response()->json($this->present($shipment), 201);
    }

    public function update(StoreShipmentRequest $request, RawMaterialImport $shipment)
    {
        try {
            $shipment = $this->inventory->updateShipment($shipment->id, $request->validated());
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->present($shipment);
    }

    public function destroy(RawMaterialImport $shipment)
    {
        try {
            $this->inventory->deleteShipment($shipment->id);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(null, 204);
    }

    public function close(RawMaterialImport $shipment)
    {
        try {
            $shipment = $this->inventory->closeShipment($shipment->id);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->present($shipment);
    }

    public function reopen(RawMaterialImport $shipment)
    {
        try {
            $shipment = $this->inventory->reopenShipment($shipment->id);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return $this->present($shipment);
    }

    private function present(RawMaterialImport $shipment): array
    {
        return $shipment->loadMissing('product')->toPresentedArray();
    }
}
