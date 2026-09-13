<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\Transaction;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Ported from src/utils/customerLedger.ts. Balance = running (debit - credit)
 * ordered by (date, created_at, id) — never stored. A negative balance is simply
 * displayed as customer advance; there is no separate advance pool.
 */
class CustomerLedgerService
{
    private const PREFIXES = [
        'payment' => 'PAY',
        'advance' => 'ADV',
        'advance_adjustment' => 'ADJ',
        'refund' => 'REF',
        'opening_balance' => 'OPN',
        'other' => 'OTH',
    ];

    /** @return Collection<int, array> rows newest-first, each with a running `balance` */
    public function ledgerRows(int $customerId): Collection
    {
        $running = 0.0;
        $rows = CustomerTransaction::where('customer_id', $customerId)
            ->orderBy('date')->orderBy('created_at')->orderBy('id')
            ->get()
            ->map(function (CustomerTransaction $t) use (&$running) {
                $running += (float) $t->debit - (float) $t->credit;

                return array_merge($t->toArray(), ['balance' => $running]);
            });

        return $rows->reverse()->values();
    }

    public function totals(int $customerId): array
    {
        $rows = CustomerTransaction::where('customer_id', $customerId)->get();
        $totalSales = $rows->where('type', 'sale')->sum('debit');
        $totalPaid = $rows->where('type', 'payment')->sum('credit');
        $balance = $rows->sum('debit') - $rows->sum('credit');

        return [
            'total_sales' => (float) $totalSales,
            'total_paid' => (float) $totalPaid,
            'balance' => (float) $balance,
            'total_due' => max(0.0, (float) $balance),
            'available_advance' => max(0.0, -(float) $balance),
            'transaction_count' => $rows->count(),
            'last_transaction_date' => optional($rows->sortByDesc('date')->first())->date,
        ];
    }

    /**
     * Record a customer payment (a.k.a. "Cash In"). No cap against the due amount —
     * an overpayment simply becomes a negative balance (advance), matching the
     * frontend. Optionally also posts a linked row into the Cash & Bank ledger.
     *
     * This is the *only* way a customer payment is written, whether it was
     * entered on the Cash In screen or as a Cash In on the Cash & Bank Ledger:
     * one call, one receivables row, at most one cash row, the two pointing at
     * each other. Routing both screens through here is what stops the same
     * payment being recorded twice — once against the customer and again as an
     * unrelated cash receipt.
     */
    public function recordPayment(array $payload): CustomerTransaction
    {
        return DB::transaction(function () use ($payload) {
            $customer = Customer::findOrFail($payload['customer_id']);
            $reference = $this->nextReference('payment');

            $transaction = CustomerTransaction::create([
                'customer_id' => $customer->id,
                'date' => $payload['date'],
                'type' => 'payment',
                'reference' => $reference,
                'description' => $payload['description'] ?? 'Payment received',
                'debit' => 0,
                'credit' => $payload['amount'],
                'method' => $payload['method'] ?? null,
                'linked_account_id' => $payload['account_id'] ?? null,
            ]);

            if (! empty($payload['account_id'])) {
                Transaction::create([
                    'date' => $payload['date'],
                    'details' => $payload['details'] ?? "Payment from {$customer->name} ({$reference})",
                    'account_id' => $payload['account_id'],
                    'direction' => 'in',
                    'category_name' => 'Customer Payment',
                    'amount' => $payload['amount'],
                    'customer_id' => $customer->id,
                    'customer_transaction_id' => $transaction->id,
                ]);
            }

            return $transaction->fresh();
        });
    }

    /**
     * Edit a payment already recorded. The customer it belongs to never
     * changes here — only when, how much, how, and whether it is deposited —
     * so this only ever touches the one receivables row plus, if present, the
     * one Cash & Bank row it is paired with (added, updated or removed to
     * match the account chosen, never left stale or duplicated).
     */
    public function updatePayment(CustomerTransaction $transaction, array $payload): CustomerTransaction
    {
        return DB::transaction(function () use ($transaction, $payload) {
            $transaction->update([
                'date' => $payload['date'],
                'credit' => $payload['amount'],
                'method' => $payload['method'] ?? null,
                'linked_account_id' => $payload['account_id'] ?? null,
            ]);

            $cash = $transaction->cashTransaction;

            if (! empty($payload['account_id'])) {
                if ($cash) {
                    $cash->update([
                        'date' => $payload['date'],
                        'account_id' => $payload['account_id'],
                        'amount' => $payload['amount'],
                    ]);
                } else {
                    Transaction::create([
                        'date' => $payload['date'],
                        'details' => "Payment from {$transaction->customer->name} ({$transaction->reference})",
                        'account_id' => $payload['account_id'],
                        'direction' => 'in',
                        'category_name' => 'Customer Payment',
                        'amount' => $payload['amount'],
                        'customer_id' => $transaction->customer_id,
                        'customer_transaction_id' => $transaction->id,
                    ]);
                }
            } elseif ($cash) {
                // No longer deposited anywhere — the cash leg of this payment
                // no longer exists, so it is removed rather than left pointing
                // at money that was never actually banked.
                $cash->delete();
            }

            return $transaction->fresh();
        });
    }

    /**
     * Remove a payment entirely. `cascadeOnDelete` on
     * `transactions.customer_transaction_id` (see the migration) removes its
     * linked Cash & Bank row automatically — the two are one event and are
     * always deleted together, exactly as `LedgerService::deleteTransaction`
     * does from the other side of the same pairing.
     */
    public function deletePayment(CustomerTransaction $transaction): void
    {
        $transaction->delete();
    }

    /** Scans existing references with this type's prefix, returns max+1, zero-padded. */
    public function nextReference(string $type): string
    {
        $prefix = self::PREFIXES[$type] ?? 'TXN';
        $max = CustomerTransaction::where('reference', 'like', "{$prefix}-%")
            ->get()
            ->map(fn (CustomerTransaction $t) => (int) substr($t->reference, strlen($prefix) + 1))
            ->max() ?? 0;

        return $prefix.'-'.str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }
}
