<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShipmentClosedException;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreWastageEntryRequest;
use App\Models\WastageEntry;
use App\Services\AuditLogger;
use App\Services\InventoryService;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Http\Request;

class WastageEntryController extends Controller
{
    public function __construct(
        private InventoryService $inventory,
        private AuditLogger $audit,
    ) {}

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

        $this->audit->record(AuditEntity::WASTAGE_ENTRY, $entry->id, AuditAction::CREATE, [
            'record' => $this->reference($entry),
            'after' => $this->auditSnapshot($entry),
            'reason' => $request->input('reason'),
            'summary' => sprintf(
                'Recorded %s TON wastage of %s',
                number_format($entry->quantityTon(), 3),
                $entry->product?->name ?? 'raw material',
            ),
        ]);

        return response()->json($entry, 201);
    }

    public function destroy(Request $request, WastageEntry $wastageEntry)
    {
        $before = $this->auditSnapshot($wastageEntry);
        $reference = $this->reference($wastageEntry);
        $ton = number_format($wastageEntry->quantityTon(), 3);

        $this->inventory->deleteConsumption('wastage', $wastageEntry->id);

        $this->audit->record(AuditEntity::WASTAGE_ENTRY, $wastageEntry->id, AuditAction::DELETE, [
            'record' => $reference,
            'before' => $before,
            'reason' => $request->input('reason'),
            'summary' => "Deleted wastage of {$ton} TON",
        ]);

        return response()->json(null, 204);
    }

    private function auditSnapshot(WastageEntry $entry): array
    {
        $entry->loadMissing('product');

        return [
            'date' => $entry->date?->toDateString() ?? (string) $entry->date,
            'product' => $entry->product?->name,
            'quantity_kg' => (float) $entry->quantity_kg,
            'quantity_ton' => $entry->quantityTon(),
            'reason' => $entry->reason,
        ];
    }

    private function reference(WastageEntry $entry): string
    {
        return 'WST-'.str_pad((string) $entry->id, 6, '0', STR_PAD_LEFT);
    }
}
