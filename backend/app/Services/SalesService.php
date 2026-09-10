<?php

namespace App\Services;

use App\Exceptions\InsufficientStockException;
use App\Models\Account;
use App\Models\CustomerTransaction;
use App\Models\MeshSize;
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
        return DB::transaction(function () use ($payload) {
            $this->assertStockAvailable($payload['items']);

            $sale = Sale::create([
                'invoice_no' => $this->nextInvoiceNo((int) date('Y', strtotime($payload['date']))),
                'date' => $payload['date'],
                'customer_id' => $payload['customer_id'],
                'truck_no' => $payload['truck_no'] ?? null,
                'notes' => $payload['notes'] ?? null,
                'paid_at_sale' => $payload['paid_at_sale'] ?? 0,
            ]);

            $totalAmount = 0.0;
            foreach ($payload['items'] as $item) {
                $meshBagKg = (float) MeshSize::findOrFail($item['mesh_size_id'])->bag_kg;
                $calculatedWeightTon = ((float) $item['bags'] * $meshBagKg) / 1000;
                $actual = (float) ($item['actual_weight_ton'] ?? 0);
                $weightTon = $actual > 0 ? $actual : $calculatedWeightTon;
                $amount = $weightTon * (float) $item['rate_per_ton'];
                $totalAmount += $amount;

                SaleItem::create([
                    'sale_id' => $sale->id,
                    'product_id' => $item['product_id'],
                    'mesh_size_id' => $item['mesh_size_id'],
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
        });
    }

    public function deleteSale(int $saleId): void
    {
        DB::transaction(function () use ($saleId) {
            $sale = Sale::findOrFail($saleId);
            CustomerTransaction::where('reference_sale_id', $sale->id)->delete();
            // The Cash & Bank ledger row a "paid at sale" amount posted, if any —
            // otherwise deleting the invoice would leave cash-in-hand overstated
            // by money whose invoice no longer exists.
            Transaction::where('reference_sale_id', $sale->id)->delete();
            $sale->items()->delete();
            $sale->delete();
        });
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
