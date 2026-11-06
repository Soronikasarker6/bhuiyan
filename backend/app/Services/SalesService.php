<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShipmentClosedException;
use App\Models\Account;
use App\Models\CustomerTransaction;
use App\Models\InventoryTransaction;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Transaction;
use Illuminate\Support\Facades\DB;

/**
 * Ported from src/utils/sales.ts. A single sale can hold multiple product/mesh
 * line items; creating one always posts a `sale` debit to the customer ledger,
 * plus a linked `payment` credit if anything was paid at the moment of sale —
 * and, since that credit is real cash/bank money received, a matching `in`
 * row on the Cash & Bank ledger too (same pattern as a standalone Cash In via
 * CustomerLedgerService::recordPayment — one payment, reflected in both
 * ledgers, never two payment records).
 *
 *   Weight (Ton) = actualWeightTon ?? (Bags x BagKg / 1000)
 *   Amount       = Weight (Ton) x Rate/Ton
 */
class SalesService
{
    public function __construct(private InventoryService $inventory) {}

    /**
     * @param  array{date:string, customer_id:int, truck_no?:string, notes?:string,
     *   paid_at_sale?:float, account_id?:int, items: array<int, array{product_id:int, mesh_size_id:int,
     *   bags:int, rate_per_ton:float, actual_weight_ton?:float}>} $payload
     */
    public function createSale(array $payload): Sale
    {
        if ($this->isRawMaterialPayload($payload)) {
            return $this->createRawMaterialSale($payload);
        }

        return DB::transaction(function () use ($payload) {
            $this->assertStockAvailable($payload['items']);

            return $this->persistNewSale($payload + ['sale_type' => Sale::TYPE_FINISHED_PRODUCT]);
        });
    }

    /**
     * Raw limestone sold straight from the yard: one line, billed and
     * deducted by its net weight as entered at billing. Goes through
     * InventoryService::consumeStock() — the same closed-cycle and
     * physical-stock guards production and wastage use — filed as a
     * `raw_material_sale` OUT. Bag stock is never touched.
     *
     * The material's product row is locked first, so two raw sales of the
     * same material racing each other are checked one after the other and
     * cannot both pass against the same remaining stock.
     *
     * @param  array{date:string, customer_id:int, product_id:int, net_weight_kg:float,
     *   rate_per_ton:float, truck_no?:string, notes?:string,
     *   paid_at_sale?:float, account_id?:int} $payload
     */
    private function createRawMaterialSale(array $payload): Sale
    {
        $payload = $this->withRawMaterialLine($payload);
        $productId = (int) $payload['product_id'];

        return DB::transaction(function () use ($payload, $productId) {
            Product::lockForUpdate()->findOrFail($productId);

            return $this->inventory->consumeStock(
                $productId,
                Sale::TYPE_RAW_MATERIAL_SOURCE,
                $payload['date'],
                $payload['items'][0]['actual_weight_ton'],
                fn () => $this->persistNewSale($payload),
            );
        });
    }

    private function persistNewSale(array $payload): Sale
    {
        $sale = Sale::create([
            'invoice_no' => $this->nextInvoiceNo((int) date('Y', strtotime($payload['date']))),
            'date' => $payload['date'],
            'customer_id' => $payload['customer_id'],
            'sale_type' => $payload['sale_type'],
            'truck_no' => $payload['truck_no'] ?? null,
            'gross_weight_kg' => $payload['gross_weight_kg'] ?? null,
            'tare_weight_kg' => $payload['tare_weight_kg'] ?? null,
            'notes' => $payload['notes'] ?? null,
            'paid_at_sale' => $payload['paid_at_sale'] ?? 0,
        ]);

        $totalAmount = 0.0;
        foreach ($payload['items'] as $item) {
            $meshBagKg = empty($item['mesh_size_id']) ? 0.0 : (float) MeshSize::findOrFail($item['mesh_size_id'])->bag_kg;
            $calculatedWeightTon = ((float) $item['bags'] * $meshBagKg) / 1000;
            $actual = (float) ($item['actual_weight_ton'] ?? 0);
            $weightTon = $actual > 0 ? $actual : $calculatedWeightTon;
            $amount = $weightTon * (float) $item['rate_per_ton'];
            $totalAmount += $amount;

            SaleItem::create([
                'sale_id' => $sale->id,
                'product_id' => $item['product_id'],
                'mesh_size_id' => $item['mesh_size_id'] ?: null,
                'bags' => $item['bags'],
                'rate_per_ton' => $item['rate_per_ton'],
                'actual_weight_ton' => $item['actual_weight_ton'] ?? null,
            ]);
        }

        CustomerTransaction::create([
            'customer_id' => $sale->customer_id,
            'date' => $sale->date,
            'type' => 'sale',
            'reference' => $sale->invoice_no,
            'description' => "Sale {$sale->invoice_no}",
            'debit' => $totalAmount,
            'credit' => 0,
            'reference_sale_id' => $sale->id,
        ]);

        $paidAtSale = (float) $sale->paid_at_sale;
        if ($paidAtSale > 0) {
            // Falls back to the one system Cash account when the form didn't send
            // one — this money must land in the Cash & Bank ledger regardless.
            $accountId = $payload['account_id'] ?? Account::where('system', true)->value('id');

            CustomerTransaction::create([
                'customer_id' => $sale->customer_id,
                'date' => $sale->date,
                'type' => 'payment',
                'reference' => "{$sale->invoice_no}-PD",
                'description' => "Paid at sale for {$sale->invoice_no}",
                'debit' => 0,
                'credit' => $paidAtSale,
                'reference_sale_id' => $sale->id,
                'linked_account_id' => $accountId,
            ]);

            if ($accountId) {
                Transaction::create([
                    'date' => $sale->date,
                    'details' => "Paid at sale — {$sale->invoice_no}",
                    'account_id' => $accountId,
                    'direction' => 'in',
                    'category_name' => 'Payment at Sale',
                    'amount' => $paidAtSale,
                    'reference_sale_id' => $sale->id,
                ]);
            }
        }

        return $sale->fresh(['items', 'transactions']);
    }

    /**
     * Edits an invoice in place — same invoice number, same id, so every
     * report and ledger row citing it still points at the same sale. The old
     * lines are dropped before the stock check, so the bags this invoice
     * already holds count as available again. The `sale` debit, the
     * paid-at-sale credit and its Cash & Bank row are updated (or added /
     * removed when the paid amount moves to or from zero), never duplicated.
     *
     * @param  array  $payload  same shape as createSale()
     */
    public function updateSale(int $saleId, array $payload): Sale
    {
        return DB::transaction(function () use ($saleId, $payload) {
            $sale = Sale::lockForUpdate()->findOrFail($saleId);
            $this->assertCorrectable($sale, 'edited');

            // A sale's kind is fixed once recorded: switching would move
            // stock between two different ledgers (bags vs. raw tons).
            if ($this->isRawMaterialPayload($payload) !== $sale->isRawMaterial()) {
                throw new BusinessRuleException('A sale cannot change between finished product and raw material. Delete it and record a new one instead.');
            }

            if ($sale->isRawMaterial()) {
                return $this->updateRawMaterialSale($sale, $this->withRawMaterialLine($payload));
            }

            $sale->items()->delete();
            $this->assertStockAvailable($payload['items']);

            return $this->persistUpdatedSale($sale, $payload);
        });
    }

    /**
     * Reverse-then-reapply, atomically: the old line and its raw-stock OUT row
     * go first (so the tons this sale already held count as available again),
     * then the edited sale is re-checked and re-posted through consumeStock()
     * exactly as a new one would be. Any failure rolls the whole edit back.
     * Neither the old nor the new date may sit in a closed shipment cycle —
     * the same rule as editing production.
     */
    private function updateRawMaterialSale(Sale $sale, array $payload): Sale
    {
        $oldItem = $sale->items()->first();
        $newProductId = (int) $payload['product_id'];

        Product::whereIn('id', array_filter([$oldItem?->product_id, $newProductId]))->lockForUpdate()->get();

        InventoryTransaction::where('source_type', Sale::TYPE_RAW_MATERIAL_SOURCE)->where('source_id', $sale->id)->delete();
        $sale->items()->delete();

        return $this->inventory->consumeStock(
            $newProductId,
            Sale::TYPE_RAW_MATERIAL_SOURCE,
            $payload['date'],
            $payload['items'][0]['actual_weight_ton'],
            fn () => $this->persistUpdatedSale($sale, $payload),
        );
    }

    private function persistUpdatedSale(Sale $sale, array $payload): Sale
    {
        $sale->update([
            'date' => $payload['date'],
            'customer_id' => $payload['customer_id'],
            'truck_no' => $payload['truck_no'] ?? null,
            'gross_weight_kg' => $payload['gross_weight_kg'] ?? null,
            'tare_weight_kg' => $payload['tare_weight_kg'] ?? null,
            'notes' => $payload['notes'] ?? null,
            'paid_at_sale' => $payload['paid_at_sale'] ?? 0,
        ]);

        $totalAmount = 0.0;
        foreach ($payload['items'] as $item) {
            $meshBagKg = empty($item['mesh_size_id']) ? 0.0 : (float) MeshSize::findOrFail($item['mesh_size_id'])->bag_kg;
            $calculatedWeightTon = ((float) $item['bags'] * $meshBagKg) / 1000;
            $actual = (float) ($item['actual_weight_ton'] ?? 0);
            $weightTon = $actual > 0 ? $actual : $calculatedWeightTon;
            $totalAmount += $weightTon * (float) $item['rate_per_ton'];

            SaleItem::create([
                'sale_id' => $sale->id,
                'product_id' => $item['product_id'],
                'mesh_size_id' => $item['mesh_size_id'] ?: null,
                'bags' => $item['bags'],
                'rate_per_ton' => $item['rate_per_ton'],
                'actual_weight_ton' => $item['actual_weight_ton'] ?? null,
            ]);
        }

        CustomerTransaction::updateOrCreate(
            ['reference_sale_id' => $sale->id, 'type' => 'sale'],
            [
                'customer_id' => $sale->customer_id,
                'date' => $sale->date,
                'reference' => $sale->invoice_no,
                'description' => "Sale {$sale->invoice_no}",
                'debit' => $totalAmount,
                'credit' => 0,
            ],
        );

        $paymentRow = CustomerTransaction::where('reference_sale_id', $sale->id)->where('type', 'payment')->first();
        $cashRow = Transaction::where('reference_sale_id', $sale->id)->first();
        $paidAtSale = (float) $sale->paid_at_sale;

        if ($paidAtSale <= 0) {
            $paymentRow?->delete();
            $cashRow?->delete();
        } else {
            // Keeps the account the money already landed in unless the form
            // picked a different one.
            $accountId = $payload['account_id']
                ?? $cashRow?->account_id
                ?? $paymentRow?->linked_account_id
                ?? Account::where('system', true)->value('id');

            $paymentAttributes = [
                'customer_id' => $sale->customer_id,
                'date' => $sale->date,
                'type' => 'payment',
                'reference' => "{$sale->invoice_no}-PD",
                'description' => "Paid at sale for {$sale->invoice_no}",
                'debit' => 0,
                'credit' => $paidAtSale,
                'reference_sale_id' => $sale->id,
                'linked_account_id' => $accountId,
            ];
            $paymentRow ? $paymentRow->update($paymentAttributes) : CustomerTransaction::create($paymentAttributes);

            if ($accountId) {
                $cashAttributes = [
                    'date' => $sale->date,
                    'details' => "Paid at sale — {$sale->invoice_no}",
                    'account_id' => $accountId,
                    'direction' => 'in',
                    'category_name' => 'Payment at Sale',
                    'amount' => $paidAtSale,
                    'reference_sale_id' => $sale->id,
                ];
                $cashRow ? $cashRow->update($cashAttributes) : Transaction::create($cashAttributes);
            }
        }

        return $sale->fresh(['items', 'transactions']);
    }

    public function deleteSale(int $saleId): void
    {
        DB::transaction(function () use ($saleId) {
            $sale = Sale::lockForUpdate()->findOrFail($saleId);
            $this->assertCorrectable($sale, 'deleted');

            CustomerTransaction::where('reference_sale_id', $sale->id)->delete();
            // The Cash & Bank ledger row a "paid at sale" amount posted, if any —
            // otherwise deleting the invoice would leave cash-in-hand overstated
            // by money whose invoice no longer exists.
            Transaction::where('reference_sale_id', $sale->id)->delete();
            // A raw material sale's stock OUT row — removing it (with the line
            // below) is what puts the tons back in the yard. No-op otherwise.
            InventoryTransaction::where('source_type', Sale::TYPE_RAW_MATERIAL_SOURCE)->where('source_id', $sale->id)->delete();
            $sale->items()->delete();
            $sale->delete();
        });
    }

    /**
     * Cancel a sale by offsetting entries on a later date, keeping the sale
     * and every row it posted exactly as they were. The way to correct a raw
     * material sale inside a closed shipment cycle, where edit and delete are
     * refused (Admin-only — SALES_REVERSE).
     *
     * On `$date`:
     *   - a `sale_reversal` credit for the invoice total, naming the sale —
     *     the allocator settles the invoice with it first, so it stops being
     *     owed, and any money already paid against it is freed as the
     *     customer's advance (no cash moves: none was refunded);
     *   - a `raw_material_sale_reversal` stock IN for the tons, which must
     *     land in an open shipment cycle (see InventoryService::returnStock).
     *
     * The closed cycle keeps its frozen figures; the returned tons show up in
     * the open cycle and current stock from `$date` on.
     */
    public function reverseSale(int $saleId, string $date, string $reason, ?int $userId): Sale
    {
        return DB::transaction(function () use ($saleId, $date, $reason, $userId) {
            $sale = Sale::with('items.meshSize')->lockForUpdate()->findOrFail($saleId);

            if ($sale->isReversed()) {
                throw new BusinessRuleException("{$sale->invoice_no} has already been reversed.");
            }
            if (! $sale->isRawMaterial()) {
                throw new BusinessRuleException('Only raw material sales are reversed. Edit or delete a finished-product sale instead.');
            }
            if ($date < $sale->date->toDateString()) {
                throw new BusinessRuleException('A reversal cannot be dated before the sale it reverses.');
            }

            $item = $sale->items->first();
            Product::lockForUpdate()->findOrFail($item->product_id);

            $this->inventory->returnStock(
                (int) $item->product_id,
                Sale::TYPE_RAW_MATERIAL_REVERSAL_SOURCE,
                $sale->id,
                $date,
                $item->billableWeightTon(),
            );

            CustomerTransaction::create([
                'customer_id' => $sale->customer_id,
                'date' => $date,
                'type' => 'sale_reversal',
                'reference' => "{$sale->invoice_no}-REV",
                'description' => "Reversal of {$sale->invoice_no}",
                'debit' => 0,
                'credit' => $sale->items->sum(fn (SaleItem $i) => $i->amount()),
                'reference_sale_id' => $sale->id,
            ]);

            $sale->update([
                'reversed_on' => $date,
                'reversed_at' => now(),
                'reversed_by_user_id' => $userId,
                'reversal_reason' => $reason,
            ]);

            return $sale->fresh(['items', 'transactions']);
        });
    }

    /**
     * Edit and delete rewrite a sale in place, so they are refused where that
     * would rewrite history: a reversed sale (its reversal entries point at
     * it), and a raw material sale inside a closed shipment cycle (the cycle's
     * frozen figures would stop matching the logs behind them). Both are
     * corrected through reverseSale() instead.
     */
    private function assertCorrectable(Sale $sale, string $action): void
    {
        if ($sale->isReversed()) {
            throw new BusinessRuleException("{$sale->invoice_no} has been reversed and is kept as history — it cannot be {$action}.");
        }

        if (! $sale->isRawMaterial()) {
            return;
        }

        $productId = (int) $sale->items()->value('product_id');
        if ($productId && $this->inventory->cycleStatusForDate($productId, $sale->date->toDateString()) === 'closed') {
            throw new ShipmentClosedException(
                "{$sale->invoice_no} is inside a closed shipment cycle and cannot be {$action}. An Admin can reverse it instead."
            );
        }
    }

    private function isRawMaterialPayload(array $payload): bool
    {
        return ($payload['sale_type'] ?? Sale::TYPE_FINISHED_PRODUCT) === Sale::TYPE_RAW_MATERIAL;
    }

    /**
     * Builds a raw material sale's single line from its header: no mesh, no
     * bags, billed on the net weight entered at billing — kg ÷ 1000, kept as
     * the line's billable ton. Rounded to the 5 decimals the column holds,
     * which is exact for kg figures with up to 2 decimals.
     */
    private function withRawMaterialLine(array $payload): array
    {
        $netKg = round((float) ($payload['net_weight_kg'] ?? 0), 2);
        if ($netKg <= 0) {
            throw new BusinessRuleException('Net weight must be more than zero.');
        }

        $payload['sale_type'] = Sale::TYPE_RAW_MATERIAL;
        // Weighbridge readings are kept as a record only, never billed: the
        // net weight above may have been edited away from gross − tare.
        $payload['gross_weight_kg'] = $this->optionalKg($payload['gross_weight_kg'] ?? null);
        $payload['tare_weight_kg'] = $this->optionalKg($payload['tare_weight_kg'] ?? null);
        $payload['items'] = [[
            'product_id' => (int) $payload['product_id'],
            'mesh_size_id' => null,
            'bags' => 0,
            'rate_per_ton' => (float) $payload['rate_per_ton'],
            'actual_weight_ton' => round($netKg / 1000, 5),
        ]];

        return $payload;
    }

    private function optionalKg(mixed $value): ?float
    {
        return $value === null || $value === '' ? null : round((float) $value, 2);
    }

    /** "INV-{year}-{seq}" — sequential within the year, never reused even after deletion. */
    public function nextInvoiceNo(int $year): string
    {
        $prefix = "INV-{$year}-";
        $max = Sale::where('invoice_no', 'like', "{$prefix}%")
            ->get()
            ->map(fn (Sale $s) => (int) substr($s->invoice_no, strlen($prefix)))
            ->max() ?? 0;

        return $prefix.str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }

    /** Aggregates requested bags per (product, mesh) across all lines of one sale. */
    private function assertStockAvailable(array $items): void
    {
        $requested = [];
        foreach ($items as $item) {
            $key = $item['product_id'].':'.$item['mesh_size_id'];
            $requested[$key] = ($requested[$key] ?? 0) + (int) $item['bags'];
        }

        foreach ($requested as $key => $bags) {
            [$productId, $meshId] = array_map('intval', explode(':', $key));
            $available = $this->inventory->availableBags($productId, $meshId);

            if ($bags > $available) {
                $mesh = MeshSize::find($meshId);
                throw new InsufficientStockException(
                    "Insufficient stock. Only {$available} bags are currently available for Mesh {$mesh?->name}."
                );
            }
        }
    }
}
