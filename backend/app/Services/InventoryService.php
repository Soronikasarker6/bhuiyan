<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShipmentClosedException;
use App\Models\InventoryTransaction;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\RawMaterialImport;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\WastageEntry;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Raw-material shipment/stock and bagged-mesh stock, ported 1:1 from the frontend's
 * src/utils/rawMaterial.ts and src/utils/productionStock.ts — same formulas, same
 * ordering rules, same edge cases (decimal tons, per-material isolation, frozen
 * closed shipments).
 *
 *   Opening Balance + Received - Consumed = Closing Balance   (per shipment cycle)
 *   Stock in Hand   = Previous Stock + Today's Production - Today's Sell  (per product+mesh)
 */
class InventoryService
{
    // ------------------------------------------------------------------
    // Raw material / shipment cycle
    // ------------------------------------------------------------------

    /**
     * The shipment-cycle chain for one product, oldest first. Each cycle's opening
     * balance is the previous cycle's closing balance (0 for the first shipment).
     * A closed shipment always returns its frozen closing_* snapshot verbatim,
     * never recomputed — so later (including back-dated) entries can't move it.
     *
     * @return Collection<int, array{
     *   shipment: RawMaterialImport, opening_ton: float, received_ton: float,
     *   available_ton: float, consumed_ton: float, closing_ton: float,
     * }>
     */
    public function shipmentCycles(int $productId): Collection
    {
        $shipments = RawMaterialImport::with('product')->where('product_id', $productId)
            ->orderBy('date')->orderBy('created_at')->orderBy('id')
            ->get();

        $wastage = WastageEntry::where('product_id', $productId)
            ->orderBy('date')->orderBy('created_at')->orderBy('id')
            ->get();

        $production = ProductionEntry::with('mesh')->where('product_id', $productId)
            ->orderBy('date')->orderBy('created_at')->orderBy('id')
            ->get();

        $cycles = collect();
        $runningOpening = 0.0;

        foreach ($shipments as $index => $shipment) {
            if ($shipment->status === 'closed') {
                $opening = (float) $shipment->closing_opening_ton;
                $received = (float) $shipment->closing_received_ton;
                $consumed = (float) $shipment->closing_consumed_ton;
                $closing = (float) $shipment->closing_closing_ton;
            } else {
                $lowerBound = $index === 0 ? null : $this->momentOf($shipment);
                $next = $shipments->get($index + 1);
                $upperBound = $next ? $this->momentOf($next) : null;

                $consumedWastageTon = $wastage
                    ->filter(fn (WastageEntry $w) => $this->inWindow($this->momentOf($w), $lowerBound, $upperBound))
                    ->sum(fn (WastageEntry $w) => $w->quantityTon());

                $consumedProductionTon = $production
                    ->filter(fn (ProductionEntry $p) => $this->inWindow($this->momentOf($p), $lowerBound, $upperBound))
                    ->sum(fn (ProductionEntry $p) => ((float) $p->bags * (float) $p->mesh->bag_kg) / 1000);

                $opening = $runningOpening;
                $received = $shipment->netWeightTon();
                $consumed = $consumedWastageTon + $consumedProductionTon;
                $closing = $opening + $received - $consumed;
            }

            $cycles->push([
                'shipment' => $shipment,
                'opening_ton' => $this->round($opening),
                'received_ton' => $this->round($received),
                'available_ton' => $this->round($opening + $received),
                'consumed_ton' => $this->round($consumed),
                'closing_ton' => $this->round($closing),
            ]);

            // The running chain keeps the unrounded value so precision never
            // compounds away across many shipments — only the displayed figure is rounded.
            $runningOpening = $closing;
        }

        return $cycles;
    }

    /** All shipment cycles across every product — for the Shipment History report. */
    public function allShipmentCycles(?int $productId = null): Collection
    {
        $productIds = $productId
            ? collect([$productId])
            : Product::orderBy('name')->pluck('id');

        return $productIds->flatMap(fn ($id) => $this->shipmentCycles($id));
    }

    public function calculateAvailableStock(int $productId): float
    {
        $latest = $this->shipmentCycles($productId)->last();

        return $latest ? $latest['closing_ton'] : 0.0;
    }

    /** Which shipment cycle a date falls into for a product, and whether it's closed. */
    public function cycleStatusForDate(int $productId, string $date): ?string
    {
        $target = Carbon::parse($date);
        $shipments = RawMaterialImport::where('product_id', $productId)
            ->orderBy('date')->orderBy('created_at')->orderBy('id')
            ->get();

        if ($shipments->isEmpty()) {
            return null;
        }

        foreach ($shipments as $index => $shipment) {
            $next = $shipments->get($index + 1);
            $isLast = $next === null;
            $startsWindow = $target->greaterThanOrEqualTo(Carbon::parse($shipment->date));
            $beforeNext = $isLast || $target->lessThan(Carbon::parse($next->date));

            if ($startsWindow && $beforeNext) {
                return $shipment->status ?? 'open';
            }
        }

        // Date precedes the first shipment entirely.
        return $target->lessThan(Carbon::parse($shipments->first()->date)) ? null : 'open';
    }

    /**
     * The RawMaterialStock summary: all-time imported/wastage/produced totals plus
     * the current shipment cycle's opening/received/consumed/closing.
     *
     * @return array{
     *   product_id: int, product_name: string, imported_ton: float, wastage_ton: float,
     *   produced_ton: float, available_ton: float, opening_ton: float, received_ton: float,
     *   consumed_ton: float, closing_ton: float, shipment_count: int,
     *   open_shipment_count: int, average_cost_per_ton: ?float,
     * }
     */
    public function getCurrentStock(int $productId): array
    {
        $product = Product::findOrFail($productId);
        $cycles = $this->shipmentCycles($productId);

        $importedTon = RawMaterialImport::where('product_id', $productId)->get()
            ->sum(fn (RawMaterialImport $i) => $i->netWeightTon());
        $wastageTon = WastageEntry::where('product_id', $productId)->sum('quantity_kg') / 1000;
        $producedTon = ProductionEntry::with('mesh')->where('product_id', $productId)->get()
            ->sum(fn (ProductionEntry $p) => ((float) $p->bags * (float) $p->mesh->bag_kg) / 1000);

        $latest = $cycles->last();
        if ($latest) {
            [$opening, $received, $consumed, $closing] = [
                $latest['opening_ton'], $latest['received_ton'], $latest['consumed_ton'], $latest['closing_ton'],
            ];
        } else {
            // No shipment at all yet — still report a number (matches the frontend fallback).
            $opening = 0.0;
            $received = 0.0;
            $consumed = $wastageTon + $producedTon;
            $closing = -$consumed;
        }

        return [
            'product_id' => $product->id,
            'product_name' => $product->name,
            'imported_ton' => $this->round($importedTon),
            'wastage_ton' => $this->round($wastageTon),
            'produced_ton' => $this->round($producedTon),
            'available_ton' => $this->round($closing),
            'opening_ton' => $this->round($opening),
            'received_ton' => $this->round($received),
            'consumed_ton' => $this->round($consumed),
            'closing_ton' => $this->round($closing),
            'shipment_count' => $cycles->count(),
            'open_shipment_count' => $cycles->filter(fn ($c) => $c['shipment']->status !== 'closed')->count(),
            'average_cost_per_ton' => $this->averageCostPerTon($productId),
        ];
    }

    /**
     * Rounds a computed ton figure to the same 3-decimal precision the DECIMAL(15,3)
     * columns already hold — this only clears IEEE-754 float noise (e.g.
     * 2.3500000000000014), it never discards real precision the data actually has.
     */
    private function round(float $value): float
    {
        return round($value, 3);
    }

    /** @return Collection<int, array> */
    public function allRawMaterialStock(): Collection
    {
        return Product::orderBy('name')->pluck('id')
            ->map(fn ($id) => $this->getCurrentStock($id));
    }

    /** Weighted average of pricePerTon across every *priced* import (unpriced excluded). */
    public function averageCostPerTon(int $productId): ?float
    {
        $priced = RawMaterialImport::where('product_id', $productId)
            ->whereNotNull('price_per_ton')
            ->get();

        if ($priced->isEmpty()) {
            return null;
        }

        $tonWeighted = $priced->sum(fn (RawMaterialImport $i) => $i->netWeightTon() * (float) $i->price_per_ton);
        $totalTon = $priced->sum(fn (RawMaterialImport $i) => $i->netWeightTon());

        return $totalTon > 0 ? $tonWeighted / $totalTon : null;
    }

    /** Receive a new shipment; writes the audit-log IN row alongside it. */
    public function receiveStock(array $attributes): RawMaterialImport
    {
        return DB::transaction(function () use ($attributes) {
            $shipment = RawMaterialImport::create($attributes + ['status' => 'open']);

            $receivedTon = $shipment->netWeightTon();
            $lifetimeBalance = $this->lifetimeBalance((int) $shipment->product_id) + $receivedTon;

            InventoryTransaction::create([
                'product_id' => $shipment->product_id,
                'direction' => 'in',
                'source_type' => 'shipment',
                'source_id' => $shipment->id,
                'quantity_ton' => $receivedTon,
                'balance_after_ton' => $lifetimeBalance,
                'occurred_at' => $shipment->created_at,
            ]);

            return $shipment->fresh();
        });
    }

    /**
     * Record a wastage or production entry that consumes raw-material stock.
     * Rejects entries dated inside an already-closed shipment cycle, or that
     * would drive the current shipment cycle's closing balance negative.
     */
    public function consumeStock(int $productId, string $sourceType, string $date, float $tons, callable $create): mixed
    {
        return DB::transaction(function () use ($productId, $sourceType, $date, $tons, $create) {
            $status = $this->cycleStatusForDate($productId, $date);
            if ($status === 'closed') {
                $product = Product::find($productId);
                throw new ShipmentClosedException(
                    "This falls inside a closed shipment cycle for {$product?->name}. Reopen that shipment first if this entry must be added."
                );
            }

            $available = $this->calculateAvailableStock($productId);
            if ($tons > $available) {
                $product = Product::find($productId);
                throw new InsufficientStockException(
                    "This would take {$product?->name} stock negative. Only ".round($available, 3)." Ton is currently available."
                );
            }

            /** @var \Illuminate\Database\Eloquent\Model $entry */
            $entry = $create();

            $lifetimeBalance = $this->lifetimeBalance($productId) - $tons;
            InventoryTransaction::create([
                'product_id' => $productId,
                'direction' => 'out',
                'source_type' => $sourceType,
                'source_id' => $entry->id,
                'quantity_ton' => $tons,
                'balance_after_ton' => $lifetimeBalance,
                'occurred_at' => $entry->created_at,
            ]);

            return $entry;
        });
    }

    /** Edit a shipment's own fields. Blocked while closed — reopen it first. */
    public function updateShipment(int $shipmentId, array $attributes): RawMaterialImport
    {
        return DB::transaction(function () use ($shipmentId, $attributes) {
            $shipment = RawMaterialImport::lockForUpdate()->findOrFail($shipmentId);

            if ($shipment->isClosed()) {
                throw new BusinessRuleException('This shipment is closed. Reopen it first, then edit.');
            }

            $shipment->update($attributes);

            $receivedTon = $shipment->netWeightTon();
            InventoryTransaction::where('source_type', 'shipment')->where('source_id', $shipment->id)
                ->update(['quantity_ton' => $receivedTon]);

            return $shipment->fresh();
        });
    }

    /**
     * Delete a shipment (only when open) and its audit-log IN row. Blocked while
     * closed — reopen it first, matching the frontend's "reopen before delete" rule.
     */
    public function deleteShipment(int $shipmentId): void
    {
        DB::transaction(function () use ($shipmentId) {
            $shipment = RawMaterialImport::lockForUpdate()->findOrFail($shipmentId);

            if ($shipment->isClosed()) {
                throw new BusinessRuleException('This shipment is closed. Reopen it first, then delete.');
            }

            InventoryTransaction::where('source_type', 'shipment')->where('source_id', $shipment->id)->delete();
            $shipment->delete();
        });
    }

    /** Delete a wastage/production entry and its matching audit-log OUT row. */
    public function deleteConsumption(string $sourceType, int $sourceId): void
    {
        DB::transaction(function () use ($sourceType, $sourceId) {
            InventoryTransaction::where('source_type', $sourceType)->where('source_id', $sourceId)->delete();

            match ($sourceType) {
                'wastage' => WastageEntry::findOrFail($sourceId)->delete(),
                'production' => ProductionEntry::findOrFail($sourceId)->delete(),
            };
        });
    }

    public function closeShipment(int $shipmentId): RawMaterialImport
    {
        return DB::transaction(function () use ($shipmentId) {
            $shipment = RawMaterialImport::lockForUpdate()->findOrFail($shipmentId);

            if ($shipment->isClosed()) {
                throw new BusinessRuleException('This shipment is already closed.');
            }

            $cycle = $this->shipmentCycles((int) $shipment->product_id)
                ->first(fn ($c) => $c['shipment']->id === $shipment->id);

            $shipment->update([
                'status' => 'closed',
                'closing_opening_ton' => $cycle['opening_ton'],
                'closing_received_ton' => $cycle['received_ton'],
                'closing_consumed_ton' => $cycle['consumed_ton'],
                'closing_closing_ton' => $cycle['closing_ton'],
                'closing_closed_at' => now(),
            ]);

            return $shipment->fresh();
        });
    }

    public function reopenShipment(int $shipmentId): RawMaterialImport
    {
        $shipment = RawMaterialImport::findOrFail($shipmentId);

        if (! $shipment->isClosed()) {
            throw new BusinessRuleException('This shipment is not closed.');
        }

        $shipment->update([
            'status' => 'open',
            'closing_opening_ton' => null,
            'closing_received_ton' => null,
            'closing_consumed_ton' => null,
            'closing_closing_ton' => null,
            'closing_closed_at' => null,
        ]);

        return $shipment->fresh();
    }

    /** All-time (imported - wastage - produced) — the audit log's running figure. */
    private function lifetimeBalance(int $productId): float
    {
        $last = InventoryTransaction::where('product_id', $productId)
            ->orderByDesc('occurred_at')->orderByDesc('id')
            ->first();

        return $last ? (float) $last->balance_after_ton : 0.0;
    }

    private function momentOf($model): Carbon
    {
        return Carbon::parse($model->date)->setTimeFromTimeString(
            optional($model->created_at)->format('H:i:s.u') ?? '00:00:00'
        );
    }

    private function inWindow(Carbon $moment, ?Carbon $lower, ?Carbon $upper): bool
    {
        if ($lower !== null && $moment->lessThan($lower)) {
            return false;
        }
        if ($upper !== null && ! $moment->lessThan($upper)) {
            return false;
        }

        return true;
    }

    // ------------------------------------------------------------------
    // Bagged mesh stock (production - sales), per (product, mesh)
    // ------------------------------------------------------------------

    /**
     * The stock ledger for one (product, mesh): one row per date, newest first,
     * plus the current stock in hand.
     *
     * @return array{rows: Collection, current_stock_bags: int}
     */
    public function stockLedger(int $productId, int $meshId): array
    {
        $production = ProductionEntry::where('product_id', $productId)->where('mesh_id', $meshId)->get();
        $soldByDate = $this->soldBagsByDate($productId, $meshId);

        $dates = $production->pluck('date')->map(fn ($d) => $d->toDateString())
            ->merge($soldByDate->keys())
            ->unique()->sort()->values();

        $producedByDate = $production->groupBy(fn ($p) => $p->date->toDateString())
            ->map(fn ($rows) => $rows->sum('bags'));

        $running = 0;
        $rows = collect();

        foreach ($dates as $date) {
            $previousStock = $running;
            $productionBags = (int) ($producedByDate[$date] ?? 0);
            $totalProduction = $previousStock + $productionBags;
            $sellBags = (int) ($soldByDate[$date] ?? 0);
            $stockBags = $totalProduction - $sellBags;

            $rows->push([
                'date' => $date,
                'previous_stock_bags' => $previousStock,
                'production_bags' => $productionBags,
                'total_production_bags' => $totalProduction,
                'sell_bags' => $sellBags,
                'stock_bags' => $stockBags,
            ]);

            $running = $stockBags;
        }

        return ['rows' => $rows->reverse()->values(), 'current_stock_bags' => $running];
    }

    public function availableBags(int $productId, int $meshId): int
    {
        return $this->stockLedger($productId, $meshId)['current_stock_bags'];
    }

    /** @return Collection<string, int> bags sold per date (joined through Sale.date) */
    private function soldBagsByDate(int $productId, int $meshId): Collection
    {
        return SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sale_items.product_id', $productId)
            ->where('sale_items.mesh_size_id', $meshId)
            ->selectRaw('sales.date as sale_date, SUM(sale_items.bags) as bags')
            ->groupBy('sales.date')
            ->pluck('bags', 'sale_date')
            ->mapWithKeys(fn ($bags, $date) => [Carbon::parse($date)->toDateString() => (int) $bags]);
    }

    public function meshStockSummary(int $productId): Collection
    {
        return MeshSize::where('active', true)->orderBy('name')->get()
            ->map(function (MeshSize $mesh) use ($productId) {
                $bags = $this->availableBags($productId, $mesh->id);
                $kg = $bags * (float) $mesh->bag_kg;

                return [
                    'mesh_id' => $mesh->id,
                    'mesh_name' => $mesh->name,
                    'bag_kg' => (float) $mesh->bag_kg,
                    'stock_bags' => $bags,
                    'stock_kg' => $kg,
                    'stock_ton' => $kg / 1000,
                ];
            });
    }

    public function allMeshStock(): Collection
    {
        return Product::where('active', true)->orderBy('name')->get()
            ->flatMap(fn (Product $product) => $this->meshStockSummary($product->id)
                ->map(fn ($row) => $row + ['product_id' => $product->id, 'product_name' => $product->name]));
    }
}
