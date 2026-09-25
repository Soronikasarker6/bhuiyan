<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\Transaction;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Ported from src/utils/customerLedger.ts. Balance = running (debit - credit)
 * ordered by (date, created_at, id) — never stored. A negative balance is simply
 * displayed as customer advance; there is no separate advance pool.
 *
 * Every payment mutation records itself through the one central
 * {@see AuditLogger}, inside the same DB transaction as the change (§16).
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

    public function __construct(private AuditLogger $audit) {}

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

            $cash = null;
            if (! empty($payload['account_id'])) {
                $cash = Transaction::create([
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

            $this->audit->record(AuditEntity::CUSTOMER_PAYMENT, $transaction->id, AuditAction::CREATE, [
                'record' => $reference,
                'after' => $this->audit->snapshot($transaction),
                'reason' => $payload['reason'] ?? null,
                'metadata' => $this->paymentMetadata($customer, $cash),
                'summary' => sprintf('Recorded %s from %s', $this->money((float) $payload['amount']), $customer->name),
            ]);

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
    public function updatePayment(CustomerTransaction $transaction, array $payload, ?string $reason = null): CustomerTransaction
    {
        return DB::transaction(function () use ($transaction, $payload, $reason) {
            $before = $this->audit->snapshot($transaction);

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

            $transaction->refresh();

            $this->audit->recordUpdate(
                AuditEntity::CUSTOMER_PAYMENT,
                $transaction->id,
                $before,
                $transaction,
                [
                    'record' => $transaction->reference,
                    'reason' => $reason,
                    'metadata' => $this->paymentMetadata($transaction->customer, $transaction->cashTransaction),
                ],
            );

            return $transaction->fresh();
        });
    }

    /**
     * Void a payment (§14). Both halves go together — the receivables credit
     * and, if the money was banked, the Cash & Bank row it was written with —
     * so the customer's due comes back and the cash account drops by the same
     * amount in one step.
     *
     * This used to lean on `cascadeOnDelete` on
     * `transactions.customer_transaction_id`. A database cascade only fires on
     * a hard delete, so now that both tables soft-delete, the cash leg is
     * voided explicitly here instead — the pairing is the same, it is just
     * maintained in code where the audit event can be written alongside it.
     */
    public function voidPayment(CustomerTransaction $transaction, ?string $reason = null): void
    {
        DB::transaction(function () use ($transaction, $reason) {
            $before = $this->audit->snapshot($transaction);
            $cash = $transaction->cashTransaction;
            $customer = $transaction->customer;

            foreach (array_filter([$transaction, $cash]) as $row) {
                $row->forceFill([
                    'voided_by_user_id' => auth()->id(),
                    'void_reason' => $reason,
                ])->save();
                $row->delete();
            }

            $this->audit->record(AuditEntity::CUSTOMER_PAYMENT, $transaction->id, AuditAction::VOID, [
                'record' => $transaction->reference,
                'before' => $before,
                'reason' => $reason,
                'metadata' => $this->paymentMetadata($customer, $cash),
                'summary' => sprintf(
                    'Voided %s from %s',
                    $this->money((float) $before['credit']),
                    $customer?->name ?? 'customer',
                ),
            ]);
        });
    }

    /**
     * Scans existing references with this type's prefix, returns max+1,
     * zero-padded. Voided rows are included on purpose: PAY-023 must never be
     * handed to a second payment just because the first one was voided — the
     * audit trail still refers to it by that name.
     */
    public function nextReference(string $type): string
    {
        $prefix = self::PREFIXES[$type] ?? 'TXN';
        $max = CustomerTransaction::withTrashed()
            ->where('reference', 'like', "{$prefix}-%")
            ->get()
            ->map(fn (CustomerTransaction $t) => (int) substr($t->reference, strlen($prefix) + 1))
            ->max() ?? 0;

        return $prefix.'-'.str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }

    /** Where a payment landed and who it came from — context a bare row can't give. */
    private function paymentMetadata(?Customer $customer, ?Transaction $cash): array
    {
        return array_filter([
            'customer_id' => $customer?->id,
            'customer_name' => $customer?->name,
            'cash_reference' => $cash?->reference,
            'account_name' => $cash?->account?->name,
        ], fn ($value) => $value !== null);
    }

    private function money(float $amount): string
    {
        return '৳'.number_format($amount, 2);
    }
}
