<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShipmentClosedException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductionEntryRequest;
use App\Models\MeshSize;
use App\Models\ProductionEntry;
use App\Services\AuditLogger;
use App\Services\InventoryService;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Http\Request;

class ProductionEntryController extends Controller
{
    public function __construct(
        private InventoryService $inventory,
        private AuditLogger $audit,
    ) {}

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

        $this->audit->record(AuditEntity::PRODUCTION_ENTRY, $entry->id, AuditAction::CREATE, [
            'record' => $this->reference($entry),
            'after' => $this->auditSnapshot($entry, $tons),
            'reason' => $request->input('reason'),
            'summary' => sprintf(
                'Bagged %d bags of Mesh %s · %s TON consumed',
                (int) $entry->bags,
                $entry->mesh?->name ?? $entry->mesh_id,
                number_format($tons, 3),
            ),
        ]);

        return response()->json($entry, 201);
    }

    public function destroy(Request $request, ProductionEntry $productionEntry)
    {
        $productionEntry->loadMissing(['product', 'mesh']);
        $before = $this->auditSnapshot($productionEntry);
        $reference = $this->reference($productionEntry);
        $bags = (int) $productionEntry->bags;
        $mesh = $productionEntry->mesh?->name;

        $this->inventory->deleteConsumption('production', $productionEntry->id);

        $this->audit->record(AuditEntity::PRODUCTION_ENTRY, $productionEntry->id, AuditAction::DELETE, [
            'record' => $reference,
            'before' => $before,
            'reason' => $request->input('reason'),
            'summary' => sprintf('Deleted production of %d bags of Mesh %s', $bags, $mesh ?? '—'),
        ]);

        return response()->json(null, 204);
    }

    /** Bags and the raw-material tonnage they consumed — the two figures a production edit moves together (§19). */
    private function auditSnapshot(ProductionEntry $entry, ?float $tons = null): array
    {
        $entry->loadMissing(['product', 'mesh']);

        return [
            'date' => $entry->date?->toDateString() ?? (string) $entry->date,
            'product' => $entry->product?->name,
            'mesh_size' => $entry->mesh?->name,
            'bags' => (int) $entry->bags,
            'consumed_ton' => $tons ?? round(((float) $entry->bags * (float) ($entry->mesh?->bag_kg ?? 0)) / 1000, 4),
            'notes' => $entry->notes,
        ];
    }

    private function reference(ProductionEntry $entry): string
    {
        return 'PRD-'.str_pad((string) $entry->id, 6, '0', STR_PAD_LEFT);
    }
}
