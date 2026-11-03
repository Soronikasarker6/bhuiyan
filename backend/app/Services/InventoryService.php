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
use App\Models\Shipment;
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
     * `received_ton` sums every import that has accumulated into the cycle —
     * one, or several, while it stays open (see `receiveStock()`) — never one
     * row per import the way this used to work.
     *
     * @return Collection<int, array{
     *   shipment: Shipment, opening_ton: float, received_ton: float,
     *   available_ton: float, consumed_ton: float, wastage_ton: float, raw_sale_ton: float,
     *   closing_ton: float,
     * }>
     */
    public function shipmentCycles(int $productId): Collection
    {
        $shipments = Shipment::with(['product', 'imports'])->where('product_id', $productId)
            ->orderBy('opened_on')->orderBy('id')
            ->get();

        $wastage = WastageEntry::where('product_id', $productId)
            ->orderBy('date')->orderBy('created_at')->orderBy('id')
            ->get();

        $production = ProductionEntry::with('mesh')->where('product_id', $productId)
            ->orderBy('date')->orderBy('created_at')->orderBy('id')
            ->get();

        $rawSales = $this->rawSaleLines($productId);

        $cycles = collect();
        $runningOpening = 0.0;

        foreach ($shipments as $index => $shipment) {
            if ($shipment->status === 'closed') {
                $opening = (float) $shipment->closing_opening_ton;
                $received = (float) $shipment->closing_received_ton;
                $consumed = (float) $shipment->closing_consumed_ton;
                $wastageTon = (float) $shipment->closing_wastage_ton;
                // Null on a cycle closed before raw material sales existed — none were sold then.
                $rawSaleTon = (float) ($shipment->closing_raw_sale_ton ?? 0);
                $closing = (float) $shipment->closing_closing_ton;
            } else {
                $lowerBound = $index === 0 ? null : $this->momentOf($shipment, 'opened_on');
                $next = $shipments->get($index + 1);
                $upperBound = $next ? $this->momentOf($next, 'opened_on') : null;

                // A reversed entry counts in its own window and comes back out
                // in the window of its reversal — never touching a closed one.
                $inCycle = fn ($entry) => $this->inWindow($this->momentOf($entry), $lowerBound, $upperBound);
                $reversedInCycle = fn ($entry) => $entry->isReversed()
                    && $this->inWindow($this->reversalMomentOf($entry), $lowerBound, $upperBound);

                $wastageTon = $wastage->filter($inCycle)->sum(fn (WastageEntry $w) => $w->quantityTon())
                    - $wastage->filter($reversedInCycle)->sum(fn (WastageEntry $w) => $w->quantityTon());

                $consumed = $production->filter($inCycle)->sum(fn (ProductionEntry $p) => $p->quantityTon())
                    - $production->filter($reversedInCycle)->sum(fn (ProductionEntry $p) => $p->quantityTon());

                $rawSaleTon = $rawSales
                    ->filter(fn (array $line) => $this->inWindow($line['moment'], $lowerBound, $upperBound))
                    ->sum('ton');

                $opening = $runningOpening;
                $received = $shipment->imports->sum(fn (RawMaterialImport $i) => $i->netWeightTon());
                $closing = $opening + $received - $consumed - $wastageTon - $rawSaleTon;
            }

            $cycles->push([
                'shipment' => $shipment,
                'opening_ton' => $this->round($opening),
                'received_ton' => $this->round($received),
                'available_ton' => $this->round($opening + $received),
                'consumed_ton' => $this->round($consumed),
                'wastage_ton' => $this->round($wastageTon),
                'raw_sale_ton' => $this->round($rawSaleTon),
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

    // ------------------------------------------------------------------
    // Current raw stock — the physical figure
    // ------------------------------------------------------------------

    /**
     * How many tons of this raw material are physically in the yard right now:
     *
     *     Total Imported − Production Consumption − Wastage − Raw Material Sold
     *
     * The inputs are separate logs and each ton appears in exactly
     * one of them, so nothing here is double-counted. In particular a production
     * entry consumes exactly the tonnage it bags (bags × bag_kg) and nothing
     * more: process loss is never folded into it, it is only ever recorded as a
     * WastageEntry of its own. So production and wastage are two disjoint ways
     * raw material leaves the yard, and subtracting both is subtracting each
     * ton once — see the "A vs. B" distinction in the plan's §4. Raw material
     * sold straight from the yard (a raw_material sale's net weight) is a
     * fourth, equally disjoint way out: it is never bagged, so it is never
     * production, and it is never filed as wastage.
     *
     * This is the same arithmetic the shipment-cycle chain telescopes to, since
     * each cycle opens at the previous one's closing balance and every
     * consumption entry falls inside exactly one cycle window. The two can only
     * drift once a shipment has been *closed*, because a closed cycle reports a
     * frozen snapshot rather than what its logs now say. When that happens this
     * figure — not the frozen chain — is the one that describes the yard, which
     * is why it is what the stock cards show and what consumeStock() guards.
     *
     * `$asOf` bounds every input to entries dated on or before that date, giving
     * the stock as it stood at the end of that day.
     */
    public function currentRawStock(int $productId, ?string $asOf = null): float
    {
        return $this->round(
            $this->importedTon($productId, null, $asOf)
            - $this->productionTon($productId, null, $asOf)
            - $this->wastageTon($productId, null, $asOf)
            - $this->rawSaleTon($productId, null, $asOf)
        );
    }

    /**
     * Current raw stock for one material, broken into the figures the stock card
     * shows, optionally over a date window.
     *
     * With no window the four numbers are all-time and read straight down:
     * imported − production − wastage = current raw stock. With a `$from` the
     * three movement figures cover the window only, and `opening_ton` carries in
     * whatever was already on hand the day before it, so the column still adds
     * up rather than appearing to lose the earlier stock.
     *
     * @return array{
     *   product_id: int, product_name: string, opening_ton: float, imported_ton: float,
     *   production_ton: float, wastage_ton: float, raw_sale_ton: float, current_raw_stock_ton: float,
     *   shipment_count: int, from: ?string, to: ?string, average_cost_per_ton: ?float,
     * }
     */
    public function rawStockSummary(int $productId, ?string $from = null, ?string $to = null): array
    {
        $product = Product::findOrFail($productId);

        $opening = $from
            ? $this->currentRawStock($productId, Carbon::parse($from)->subDay()->toDateString())
            : 0.0;

        $imported = $this->importedTon($productId, $from, $to);
        $production = $this->productionTon($productId, $from, $to);
        $wastage = $this->wastageTon($productId, $from, $to);
        $rawSale = $this->rawSaleTon($productId, $from, $to);

        return [
            'product_id' => $product->id,
            'product_name' => $product->name,
            'opening_ton' => $this->round($opening),
            'imported_ton' => $this->round($imported),
            'production_ton' => $this->round($production),
            'wastage_ton' => $this->round($wastage),
            'raw_sale_ton' => $this->round($rawSale),
            'current_raw_stock_ton' => $this->round($opening + $imported - $production - $wastage - $rawSale),
            // Counted over the same window as the movements above, so a period
            // view never captions its figures with an all-time shipment count.
            'shipment_count' => $this->betweenDates(
                RawMaterialImport::where('product_id', $productId), $from, $to
            )->count(),
            'from' => $from,
            'to' => $to,
            'average_cost_per_ton' => $this->averageCostPerTon($productId),
        ];
    }

    /** @return Collection<int, array> one rawStockSummary row per material, or just one material's. */
    public function allRawStockSummaries(?int $productId = null, ?string $from = null, ?string $to = null): Collection
    {
        $productIds = $productId
            ? collect([$productId])
            : Product::orderBy('name')->pluck('id');

        return $productIds->map(fn ($id) => $this->rawStockSummary((int) $id, $from, $to))->values();
    }

    /** Net tons received, optionally bounded by shipment date. */
    private function importedTon(int $productId, ?string $from = null, ?string $to = null): float
    {
        return (float) $this->betweenDates(RawMaterialImport::where('product_id', $productId), $from, $to)
            ->get()
            ->sum(fn (RawMaterialImport $i) => $i->netWeightTon());
    }

    /**
     * Tons of raw material consumed by bagging, optionally bounded by entry date.
     * One production entry consumes bags × bag_kg — the tonnage it turns into
     * finished stock — and never anything on top of that.
     */
    private function productionTon(int $productId, ?string $from = null, ?string $to = null): float
    {
        $consumed = $this->betweenDates(ProductionEntry::with('mesh')->where('product_id', $productId), $from, $to)
            ->get()->sum(fn (ProductionEntry $p) => $p->quantityTon());
        $returned = $this->betweenDates(ProductionEntry::with('mesh')->where('product_id', $productId), $from, $to, 'reversed_on')
            ->get()->sum(fn (ProductionEntry $p) => $p->quantityTon());

        return (float) $consumed - (float) $returned;
    }

    /**
     * Tons lost as wastage — raw material that left the yard *without* being
     * bagged. A reversed entry comes back out on its reversal date (as does a
     * reversed production entry above).
     */
    private function wastageTon(int $productId, ?string $from = null, ?string $to = null): float
    {
        $lost = $this->betweenDates(WastageEntry::where('product_id', $productId), $from, $to)->sum('quantity_kg');
        $returned = $this->betweenDates(WastageEntry::where('product_id', $productId), $from, $to, 'reversed_on')->sum('quantity_kg');

        return ((float) $lost - (float) $returned) / 1000;
    }

    /**
     * Net tons sold as raw material: the billable (net) weight of
     * raw_material sale lines by sale date, less any of those sales reversed
     * by reversal date. A reversal returns the tons on the day it is booked —
     * never on the original sale date, which may sit in a closed cycle.
     */
    private function rawSaleTon(int $productId, ?string $from = null, ?string $to = null): float
    {
        $sold = $this->rawSaleItems($productId);
        $returned = $this->rawSaleItems($productId)->whereNotNull('sales.reversed_on');

        foreach ([[$sold, 'sales.date'], [$returned, 'sales.reversed_on']] as [$query, $column]) {
            if ($from) {
                $query->where($column, '>=', $from);
            }
            if ($to) {
                $query->where($column, '<=', $to);
            }
        }

        return (float) $sold->sum('sale_items.actual_weight_ton') - (float) $returned->sum('sale_items.actual_weight_ton');
    }

    private function rawSaleItems(int $productId)
    {
        return SaleItem::query()
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.sale_type', Sale::TYPE_RAW_MATERIAL)
            ->where('sale_items.product_id', $productId);
    }

    /**
     * Every raw material sale line for one product, with the moment it
     * happened (sale date + time of recording) — what the shipment-cycle
     * windows are drawn against, exactly like production and wastage. A
     * reversed sale adds a second, negative line at its reversal moment.
     *
     * @return Collection<int, array{moment: Carbon, ton: float}>
     */
    private function rawSaleLines(int $productId): Collection
    {
        $rows = $this->rawSaleItems($productId)->get([
            'sales.date as sale_date', 'sales.created_at as sale_created_at',
            'sales.reversed_on', 'sales.reversed_at', 'sale_items.actual_weight_ton',
        ]);

        $moment = fn ($date, $stamp) => Carbon::parse($date)->setTimeFromTimeString(
            $stamp ? Carbon::parse($stamp)->format('H:i:s.u') : '00:00:00'
        );

        // A reversal is a negative line on its own date, so it lands in the
        // cycle that is open then — a closed cycle's window is never touched.
        return $rows->flatMap(fn ($row) => array_filter([
            ['moment' => $moment($row->sale_date, $row->sale_created_at), 'ton' => (float) $row->actual_weight_ton],
            $row->reversed_on
                ? ['moment' => $moment($row->reversed_on, $row->reversed_at), 'ton' => -(float) $row->actual_weight_ton]
                : null,
        ]))->values();
    }

    /** `$column` = 'reversed_on' selects the reversals dated in the window (and only reversed rows). */
    private function betweenDates($query, ?string $from, ?string $to, string $column = 'date')
    {
        if ($column !== 'date') {
            $query->whereNotNull($column);
        }
        if ($from) {
            $query->where($column, '>=', $from);
        }
        if ($to) {
            $query->where($column, '<=', $to);
        }

        return $query;
    }

    /** Which shipment cycle a date falls into for a product, and whether it's closed. */
    public function cycleStatusForDate(int $productId, string $date): ?string
    {
        $target = Carbon::parse($date);
        $shipments = Shipment::where('product_id', $productId)
            ->orderBy('opened_on')->orderBy('id')
            ->get();

        if ($shipments->isEmpty()) {
            return null;
        }

        foreach ($shipments as $index => $shipment) {
            $next = $shipments->get($index + 1);
            $isLast = $next === null;
            $startsWindow = $target->greaterThanOrEqualTo(Carbon::parse($shipment->opened_on));
            $beforeNext = $isLast || $target->lessThan(Carbon::parse($next->opened_on));

            if ($startsWindow && $beforeNext) {
                return $shipment->status ?? 'open';
            }
        }

        // Date precedes the first shipment entirely.
        return $target->lessThan(Carbon::parse($shipments->first()->opened_on)) ? null : 'open';
    }

    /**
     * The RawMaterialStock summary: the headline current raw stock and the
     * all-time imported/production/wastage totals it comes from, plus the
     * current shipment cycle's opening/received/consumed/closing.
     *
     * `current_raw_stock_ton` is what the business asks for — how many tons are
     * physically on hand right now (see currentRawStock()). `available_ton` and
     * the `*_ton` cycle figures describe the current *shipment cycle* and are
     * what the Shipment History screen reports; they agree with the headline
     * except across a frozen closed shipment.
     *
     * @return array{
     *   product_id: int, product_name: string, imported_ton: float, wastage_ton: float,
     *   produced_ton: float, current_raw_stock_ton: float, available_ton: float,
     *   opening_ton: float, received_ton: float, consumed_ton: float, closing_ton: float,
     *   shipment_count: int, open_shipment_count: int, average_cost_per_ton: ?float,
     * }
     */
    public function getCurrentStock(int $productId): array
    {
        $product = Product::findOrFail($productId);
        $cycles = $this->shipmentCycles($productId);

        $importedTon = $this->importedTon($productId);
        $wastageTon = $this->wastageTon($productId);
        $producedTon = $this->productionTon($productId);
        $rawSoldTon = $this->rawSaleTon($productId);

        $latest = $cycles->last();
        if ($latest) {
            [$opening, $received, $consumed, $cycleWastage, $cycleRawSale, $closing] = [
                $latest['opening_ton'], $latest['received_ton'], $latest['consumed_ton'],
                $latest['wastage_ton'], $latest['raw_sale_ton'], $latest['closing_ton'],
            ];
        } else {
            // No shipment at all yet — still report a number (matches the frontend fallback).
            $opening = 0.0;
            $received = 0.0;
            $consumed = $producedTon;
            $cycleWastage = $wastageTon;
            $cycleRawSale = $rawSoldTon;
            $closing = -($consumed + $cycleWastage + $cycleRawSale);
        }

        return [
            'product_id' => $product->id,
            'product_name' => $product->name,
            'imported_ton' => $this->round($importedTon),
            'wastage_ton' => $this->round($wastageTon),
            'produced_ton' => $this->round($producedTon),
            'raw_sale_ton' => $this->round($rawSoldTon),
            'current_raw_stock_ton' => $this->round($importedTon - $producedTon - $wastageTon - $rawSoldTon),
            'available_ton' => $this->round($closing),
            'opening_ton' => $this->round($opening),
            'received_ton' => $this->round($received),
            'consumed_ton' => $this->round($consumed),
            /** Wastage within the *current shipment cycle* only — see `wastage_ton` above for the all-time figure. */
            'cycle_wastage_ton' => $this->round($cycleWastage),
            /** Raw material sold within the current shipment cycle only. */
            'cycle_raw_sale_ton' => $this->round($cycleRawSale),
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

    /**
     * Receive a new import, writing the audit-log IN row alongside it.
     *
     * Joins the product's current *open* shipment cycle if one exists —
     * every import received while a cycle is open accumulates into it,
     * never starting a new one. Only when there is no open cycle (the
     * first-ever import for this product, or the last one was closed) is a
     * new `Shipment` created first, with this import as its first entry.
     */
    public function receiveStock(array $attributes): RawMaterialImport
    {
        return DB::transaction(function () use ($attributes) {
            $productId = (int) $attributes['product_id'];

            $shipment = Shipment::where('product_id', $productId)->where('status', 'open')
                ->lockForUpdate()->first();

            if (! $shipment) {
                $shipment = Shipment::create([
                    'product_id' => $productId,
                    'opened_on' => $attributes['date'],
                    'status' => 'open',
                ]);
            }

            $import = RawMaterialImport::create($attributes + ['shipment_id' => $shipment->id]);

            $receivedTon = $import->netWeightTon();
            $lifetimeBalance = $this->lifetimeBalance($productId) + $receivedTon;

            InventoryTransaction::create([
                'product_id' => $productId,
                'direction' => 'in',
                'source_type' => 'shipment',
                'source_id' => $import->id,
                'quantity_ton' => $receivedTon,
                'balance_after_ton' => $lifetimeBalance,
                'occurred_at' => $import->created_at,
            ]);

            return $import->fresh();
        });
    }

    /**
     * Record a wastage, production or raw material sale entry that consumes
     * raw-material stock (`$sourceType` is what the audit-log OUT row is filed
     * under — a raw material sale is never filed as production).
     * Rejects entries dated inside an already-closed shipment cycle, or that
     * would drive the material's current raw stock negative.
     *
     * The guard is currentRawStock() — the tonnage physically in the yard —
     * rather than the shipment cycle's closing balance, because no amount of
     * shipment bookkeeping lets more limestone leave than actually arrived. The
     * two figures are the same number while every shipment is open; where a
     * frozen closed cycle makes them differ, the physical one is the real limit.
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

            $available = $this->currentRawStock($productId);
            if ($tons > $available) {
                $product = Product::find($productId);
                throw new InsufficientStockException(
                    "This would take {$product?->name} raw stock negative. Only ".round($available, 3).' Ton is currently available.'
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

    /**
     * Put raw-material stock back — the opposite of consumeStock(), for a
     * reversal that returns tons on its own date. Refused when that date sits
     * in a closed shipment cycle: the return must land in an open period, so
     * the closed cycle's frozen figures stay exactly what was reported.
     */
    public function returnStock(int $productId, string $sourceType, int $sourceId, string $date, float $tons): void
    {
        DB::transaction(function () use ($productId, $sourceType, $sourceId, $date, $tons) {
            if ($this->cycleStatusForDate($productId, $date) === 'closed') {
                $product = Product::find($productId);
                throw new ShipmentClosedException(
                    "This date falls inside a closed shipment cycle for {$product?->name}. Date the reversal inside an open cycle."
                );
            }

            InventoryTransaction::create([
                'product_id' => $productId,
                'direction' => 'in',
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'quantity_ton' => $tons,
                'balance_after_ton' => $this->lifetimeBalance($productId) + $tons,
                'occurred_at' => now(),
            ]);
        });
    }

    /**
     * Edit a shipment's own fields. Blocked while closed — reopen it first.
     *
     * Also blocked if the edit would take the product's current raw stock
     * negative — e.g. lowering gross/tare weight on a shipment whose tonnage
     * has already been consumed by production/wastage recorded since. Same
     * guard as `consumeStock()`, just re-checked after the edit rather than
     * before a new entry, since the edit itself is what could create the
     * shortfall here.
     */
    /** Edit one import entry's own fields. Blocked while its shipment cycle is closed — reopen it first. */
    public function updateShipment(int $importId, array $attributes): RawMaterialImport
    {
        return DB::transaction(function () use ($importId, $attributes) {
            $import = RawMaterialImport::with('shipment')->lockForUpdate()->findOrFail($importId);

            if ($import->isClosed()) {
                throw new BusinessRuleException('This shipment is closed. Reopen it first, then edit.');
            }

            $productId = $import->product_id;
            unset($attributes['shipment_id']); // an import never moves to a different cycle via a plain edit
            $import->update($attributes);

            $receivedTon = $import->netWeightTon();
            InventoryTransaction::where('source_type', 'shipment')->where('source_id', $import->id)
                ->update(['quantity_ton' => $receivedTon]);

            $availableAfterEdit = $this->currentRawStock($productId);
            if ($availableAfterEdit < 0) {
                $product = Product::find($productId);
                throw new InsufficientStockException(
                    "This edit would take {$product?->name} raw stock negative by ".round(abs($availableAfterEdit), 3)
                    .' Ton — production or wastage already recorded against this shipment exceeds the new weight.'
                );
            }

            return $import->fresh();
        });
    }

    /**
     * Delete one import entry (only while its shipment cycle is open) and its
     * audit-log IN row. Blocked while closed — reopen the cycle first,
     * matching the frontend's "reopen before delete" rule. The shipment
     * cycle itself is left in place even if this was its last import — a
     * still-open, now-empty cycle is exactly where the next import for this
     * product belongs, never a reason to create another one.
     */
    public function deleteShipment(int $importId): void
    {
        DB::transaction(function () use ($importId) {
            $import = RawMaterialImport::with('shipment')->lockForUpdate()->findOrFail($importId);

            if ($import->isClosed()) {
                throw new BusinessRuleException('This shipment is closed. Reopen it first, then delete.');
            }

            InventoryTransaction::where('source_type', 'shipment')->where('source_id', $import->id)->delete();
            $import->delete();
        });
    }

    /**
     * Edit one production entry (date, product, mesh, bags, notes).
     *
     * The same rules as recording it, re-checked after the change: neither the
     * old nor the new date may sit inside a closed shipment cycle, the new
     * product's raw stock may not go negative, and the bags it used to supply
     * may not already have been sold — the old (product, mesh) bag stock must
     * not dip below zero on any date where it was not already short.
     */
    public function updateProduction(int $entryId, array $attributes): ProductionEntry
    {
        return DB::transaction(function () use ($entryId, $attributes) {
            $entry = ProductionEntry::lockForUpdate()->findOrFail($entryId);
            $oldProductId = (int) $entry->product_id;
            $oldMeshId = (int) $entry->mesh_id;

            $this->assertConsumptionCorrectable($entry, 'edited');
            $newProductId = (int) $attributes['product_id'];
            if ($this->cycleStatusForDate($newProductId, $attributes['date']) === 'closed') {
                $product = Product::find($newProductId);
                throw new ShipmentClosedException(
                    "This falls inside a closed shipment cycle for {$product?->name}. Reopen that shipment first if this entry must be moved there."
                );
            }

            $lowestBefore = $this->lowestBagStock($oldProductId, $oldMeshId);

            $entry->update($attributes);
            $entry->load('mesh');
            $tons = ((float) $entry->bags * (float) $entry->mesh->bag_kg) / 1000;

            InventoryTransaction::where('source_type', 'production')->where('source_id', $entry->id)
                ->update(['product_id' => $newProductId, 'quantity_ton' => $tons]);

            $available = $this->currentRawStock($newProductId);
            if ($available < 0) {
                $product = Product::find($newProductId);
                throw new InsufficientStockException(
                    "This edit would take {$product?->name} raw stock negative by ".round(abs($available), 3).' Ton.'
                );
            }

            $lowestAfter = $this->lowestBagStock($oldProductId, $oldMeshId);
            if ($lowestAfter < 0 && $lowestAfter < $lowestBefore) {
                throw new InsufficientStockException(
                    'These bags have already been sold — this edit would take bag stock negative by '.abs($lowestAfter).' bags.'
                );
            }

            return $entry->fresh();
        });
    }

    /** The lowest running bag stock reached on any date for one (product, mesh). */
    private function lowestBagStock(int $productId, int $meshId): int
    {
        $rows = $this->stockLedger($productId, $meshId)['rows'];

        return $rows->isEmpty() ? 0 : (int) $rows->min('stock_bags');
    }

    /**
     * Delete a wastage/production entry and its matching audit-log OUT row.
     * Refused inside a closed shipment cycle, and for a reversed entry — see
     * assertConsumptionCorrectable().
     */
    public function deleteConsumption(string $sourceType, int $sourceId): void
    {
        DB::transaction(function () use ($sourceType, $sourceId) {
            $entry = $this->consumptionEntry($sourceType, $sourceId);
            $this->assertConsumptionCorrectable($entry, 'deleted');

            InventoryTransaction::where('source_type', $sourceType)->where('source_id', $sourceId)->delete();
            $entry->delete();
        });
    }

    /**
     * Reverse a production or wastage entry — the correction for one that can
     * no longer be edited or deleted because it sits in a closed shipment cycle
     * (Admin-only: PRODUCTION_REVERSE / RAW_MATERIAL_REVERSE).
     *
     * The entry stays exactly as it was, marked reversed. On `$date` its tons
     * return to raw stock via returnStock() — which refuses a date inside a
     * closed cycle, so the return lands in an open one and the closed cycle's
     * frozen figures never move. A production entry's bags come back out of
     * bag stock on that date too, so it is refused if they have already been
     * sold (bag stock would go negative).
     */
    public function reverseConsumption(string $sourceType, int $sourceId, string $date, string $reason, ?int $userId): ProductionEntry|WastageEntry
    {
        return DB::transaction(function () use ($sourceType, $sourceId, $date, $reason, $userId) {
            $entry = $this->consumptionEntry($sourceType, $sourceId);

            if ($entry->isReversed()) {
                throw new BusinessRuleException('This entry has already been reversed.');
            }
            if ($date < $entry->date->toDateString()) {
                throw new BusinessRuleException('A reversal cannot be dated before the entry it reverses.');
            }

            Product::lockForUpdate()->findOrFail($entry->product_id);
            $tons = $entry->quantityTon();

            $this->returnStock((int) $entry->product_id, "{$sourceType}_reversal", $entry->id, $date, $tons);

            $lowestBefore = $entry instanceof ProductionEntry ? $this->lowestBagStock((int) $entry->product_id, (int) $entry->mesh_id) : 0;

            $entry->update([
                'reversed_on' => $date,
                'reversed_at' => now(),
                'reversed_by_user_id' => $userId,
                'reversal_reason' => $reason,
            ]);

            if ($entry instanceof ProductionEntry) {
                $lowestAfter = $this->lowestBagStock((int) $entry->product_id, (int) $entry->mesh_id);
                if ($lowestAfter < 0 && $lowestAfter < $lowestBefore) {
                    throw new InsufficientStockException(
                        'These bags have already been sold — reversing this production would take bag stock negative by '.abs($lowestAfter).' bags.'
                    );
                }
            }

            return $entry->fresh();
        });
    }

    private function consumptionEntry(string $sourceType, int $sourceId): ProductionEntry|WastageEntry
    {
        return match ($sourceType) {
            'wastage' => WastageEntry::lockForUpdate()->findOrFail($sourceId),
            'production' => ProductionEntry::with('mesh')->lockForUpdate()->findOrFail($sourceId),
        };
    }

    /**
     * Edit and delete rewrite an entry in place, so they are refused where that
     * would rewrite history: a reversed entry, and one dated inside a closed
     * shipment cycle (its frozen figures would stop matching the logs). Both
     * are corrected by reverseConsumption() instead — or, for a cycle closed
     * by mistake, by reopening it.
     */
    private function assertConsumptionCorrectable(ProductionEntry|WastageEntry $entry, string $action): void
    {
        if ($entry->isReversed()) {
            throw new BusinessRuleException("This entry has been reversed and is kept as history — it cannot be {$action}.");
        }

        if ($this->cycleStatusForDate((int) $entry->product_id, $entry->date->toDateString()) === 'closed') {
            throw new ShipmentClosedException(
                "This entry is inside a closed shipment cycle and cannot be {$action}. An Admin can reverse it instead."
            );
        }
    }

    public function closeShipment(int $shipmentId): Shipment
    {
        return DB::transaction(function () use ($shipmentId) {
            $shipment = Shipment::lockForUpdate()->findOrFail($shipmentId);

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
                'closing_wastage_ton' => $cycle['wastage_ton'],
                'closing_raw_sale_ton' => $cycle['raw_sale_ton'],
                'closing_closing_ton' => $cycle['closing_ton'],
                'closing_closed_at' => now(),
            ]);

            return $shipment->fresh();
        });
    }

    public function reopenShipment(int $shipmentId): Shipment
    {
        $shipment = Shipment::findOrFail($shipmentId);

        if (! $shipment->isClosed()) {
            throw new BusinessRuleException('This shipment is not closed.');
        }

        $shipment->update([
            'status' => 'open',
            'closing_opening_ton' => null,
            'closing_received_ton' => null,
            'closing_consumed_ton' => null,
            'closing_wastage_ton' => null,
            'closing_raw_sale_ton' => null,
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

    private function momentOf($model, string $dateField = 'date'): Carbon
    {
        return Carbon::parse($model->{$dateField})->setTimeFromTimeString(
            optional($model->created_at)->format('H:i:s.u') ?? '00:00:00'
        );
    }

    private function reversalMomentOf($entry): Carbon
    {
        return Carbon::parse($entry->reversed_on)->setTimeFromTimeString(
            optional($entry->reversed_at)->format('H:i:s.u') ?? '00:00:00'
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

        // A reversed production entry takes its bags back out on its reversal date.
        $reversed = $production->filter(fn (ProductionEntry $p) => $p->isReversed());

        $dates = $production->pluck('date')->map(fn ($d) => $d->toDateString())
            ->merge($reversed->pluck('reversed_on')->map(fn ($d) => $d->toDateString()))
            ->merge($soldByDate->keys())
            ->unique()->sort()->values();

        $producedByDate = $production->groupBy(fn ($p) => $p->date->toDateString())
            ->map(fn ($rows) => $rows->sum('bags'));
        foreach ($reversed->groupBy(fn ($p) => $p->reversed_on->toDateString()) as $date => $rows) {
            $producedByDate[$date] = ($producedByDate[$date] ?? 0) - $rows->sum('bags');
        }

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
