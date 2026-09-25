<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Models\Customer;
use App\Models\CustomerInternalLedgerEntry;
use App\Models\CustomerInternalLedgerOpening;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The owner's private bookkeeping ledger.
 *
 * Entirely separate from {@see CustomerLedgerService}, which owns the
 * operational receivables ledger (sales, payments, Due, Advance). Nothing in
 * this file reads or writes `customer_transactions`, `transactions`, stock or
 * anything a sale touches, and nothing here can move a customer's actual
 * balance. The two ledgers share only the `customers` master list.
 *
 * Convention, matched to the receivables ledger rather than invented here:
 * balance = running (debit - credit); positive means the party owes us (Dr),
 * negative means they are ahead (Cr).
 *
 * The running balance is never stored. It is derived, in date order, from the
 * party's opening balance plus every entry — so it cannot drift from the
 * entries behind it, and an edit or delete anywhere in the middle of a book
 * simply produces the right numbers on the next read rather than needing a
 * recalculation pass.
 *
 * Every mutation records itself through the one central {@see AuditLogger},
 * inside the same DB transaction as the change.
 */
class CustomerInternalLedgerService
{
    public function __construct(private AuditLogger $audit) {}

    /**
     * The ledger for one party, or for the whole book.
     *
     * Two things happen here that a naive "filter then sum" would get wrong:
     *
     *  1. The running balance on each row is computed over the *complete*
     *     chronological series, then the display filters are applied. A row's
     *     balance is therefore the book's true position after that entry,
     *     whatever is being filtered — never a total restarted from zero
     *     inside a date window.
     *  2. The period's opening balance carries forward: it is the balance
     *     immediately before `from`, which is the party's opening balance plus
     *     every entry that predates the window.
     *
     * @param  array{customer_id?: int|null, from?: string|null, to?: string|null, type?: string|null, search?: string|null}  $filters
     * @return array{rows: Collection<int, array>, summary: array, narrowed: bool}
     */
    public function ledger(array $filters = []): array
    {
        $customerId = $filters['customer_id'] ?? null;
        $from = $filters['from'] ?? null;
        $to = $filters['to'] ?? null;
        $type = $filters['type'] ?? null;
        $search = $filters['search'] ?? null;

        $opening = $this->openingBalanceFor($customerId);

        // The whole series in date order — this is what the running balance is
        // built from, before anything is filtered out of the display.
        $query = CustomerInternalLedgerEntry::with('customer:id,name')
            ->orderBy('date')->orderBy('created_at')->orderBy('id');
        if ($customerId) {
            $query->where('customer_id', $customerId);
        }

        $running = $opening;
        $all = $query->get()->map(function (CustomerInternalLedgerEntry $entry) use (&$running) {
            $running += $entry->signedAmount();

            return [
                'id' => (string) $entry->id,
                'customer_id' => (string) $entry->customer_id,
                'customer_name' => $entry->customer?->name,
                'date' => $entry->date?->toDateString(),
                'details' => $entry->details,
                'reference' => $entry->reference,
                'debit' => (float) $entry->debit,
                'credit' => (float) $entry->credit,
                'balance' => round($running, 2),
                'entry_no' => $entry->reference_label,
                'updated_at' => $entry->updated_at?->toJSON(),
            ];
        });

        // The summary describes the *period*: party plus date range only. The
        // type and search filters narrow what is listed, not what the period
        // contains — a closing balance that moved because someone typed in a
        // search box would not be a closing balance.
        $inPeriod = $all->filter(fn (array $row) => $this->withinDates($row['date'], $from, $to))->values();
        $periodOpening = $this->balanceBefore($all, $opening, $from);

        $totalDebit = round($inPeriod->sum('debit'), 2);
        $totalCredit = round($inPeriod->sum('credit'), 2);

        $rows = $inPeriod
            ->filter(fn (array $row) => $this->matchesType($row, $type))
            ->filter(fn (array $row) => $this->matchesSearch($row, $search))
            ->values();

        return [
            // Newest first on screen, like every other register in this app.
            'rows' => $rows->reverse()->values(),
            'summary' => [
                'opening_balance' => round($periodOpening, 2),
                'total_debit' => $totalDebit,
                'total_credit' => $totalCredit,
                'closing_balance' => round($periodOpening + $totalDebit - $totalCredit, 2),
                'entry_count' => $rows->count(),
                'period_entry_count' => $inPeriod->count(),
            ],
            // True when Type/Search are hiding rows the summary still counts,
            // so the screen can say so rather than look wrong.
            'narrowed' => $rows->count() !== $inPeriod->count(),
        ];
    }

    /** Every party's opening balance combined, or one party's. */
    public function openingBalanceFor(?int $customerId): float
    {
        $query = CustomerInternalLedgerOpening::query();
        if ($customerId) {
            $query->where('customer_id', $customerId);
        }

        return round((float) $query->sum('opening_balance'), 2);
    }

    /** The party's stated opening balance row, for the screen's own header. */
    public function opening(int $customerId): ?CustomerInternalLedgerOpening
    {
        return CustomerInternalLedgerOpening::where('customer_id', $customerId)->first();
    }

    public function createEntry(array $payload): CustomerInternalLedgerEntry
    {
        return DB::transaction(function () use ($payload) {
            $this->assertOneSidedAmount($payload);

            $entry = CustomerInternalLedgerEntry::create([
                'customer_id' => $payload['customer_id'],
                'date' => $payload['date'],
                'details' => $payload['details'],
                'reference' => $payload['reference'] ?? null,
                'debit' => $payload['debit'] ?? 0,
                'credit' => $payload['credit'] ?? 0,
            ]);

            $this->audit->record(
                AuditEntity::CUSTOMER_INTERNAL_LEDGER,
                $entry->id,
                AuditAction::CREATE,
                [
                    'record' => $entry->reference_label,
                    'after' => $this->auditSnapshot($entry),
                    'summary' => $this->describe('Recorded', $entry),
                ],
            );

            return $entry->load('customer:id,name');
        });
    }

    public function updateEntry(CustomerInternalLedgerEntry $entry, array $payload): CustomerInternalLedgerEntry
    {
        return DB::transaction(function () use ($entry, $payload) {
            $this->assertOneSidedAmount($payload);

            $before = $this->auditSnapshot($entry);

            $entry->update([
                'customer_id' => $payload['customer_id'],
                'date' => $payload['date'],
                'details' => $payload['details'],
                'reference' => $payload['reference'] ?? null,
                'debit' => $payload['debit'] ?? 0,
                'credit' => $payload['credit'] ?? 0,
            ]);

            $entry->refresh()->load('customer:id,name');

            $this->audit->recordUpdate(
                AuditEntity::CUSTOMER_INTERNAL_LEDGER,
                $entry->id,
                $before,
                $this->auditSnapshot($entry),
                ['record' => $entry->reference_label, 'reason' => $payload['reason'] ?? null],
            );

            return $entry;
        });
    }

    public function deleteEntry(CustomerInternalLedgerEntry $entry, ?string $reason = null): void
    {
        DB::transaction(function () use ($entry, $reason) {
            $entry->load('customer:id,name');
            $before = $this->auditSnapshot($entry);
            $label = $entry->reference_label;
            $summary = $this->describe('Deleted', $entry);
            $id = $entry->id;

            $entry->delete();

            $this->audit->record(AuditEntity::CUSTOMER_INTERNAL_LEDGER, $id, AuditAction::DELETE, [
                'record' => $label,
                'before' => $before,
                'reason' => $reason,
                'summary' => $summary,
            ]);
        });
    }

    /** Sets (or clears) a party's opening balance. Audited like any other change to the book. */
    public function setOpeningBalance(Customer $customer, array $payload): CustomerInternalLedgerOpening
    {
        return DB::transaction(function () use ($customer, $payload) {
            $existing = $this->opening($customer->id);
            $before = $existing ? $this->audit->snapshot($existing) : null;

            $opening = CustomerInternalLedgerOpening::updateOrCreate(
                ['customer_id' => $customer->id],
                [
                    'opening_balance' => $payload['opening_balance'],
                    'as_of' => $payload['as_of'] ?? null,
                    'notes' => $payload['notes'] ?? null,
                ],
            );

            $after = $this->audit->snapshot($opening->refresh());

            if ($before === null) {
                $this->audit->record(
                    AuditEntity::CUSTOMER_INTERNAL_LEDGER_OPENING,
                    $opening->id,
                    AuditAction::CREATE,
                    [
                        'record' => $customer->name,
                        'after' => $after,
                        'summary' => sprintf(
                            'Set opening balance for %s to %s',
                            $customer->name,
                            $this->money((float) $opening->opening_balance),
                        ),
                    ],
                );
            } else {
                $this->audit->recordUpdate(
                    AuditEntity::CUSTOMER_INTERNAL_LEDGER_OPENING,
                    $opening->id,
                    $before,
                    $after,
                    ['record' => $customer->name],
                );
            }

            return $opening;
        });
    }

    /**
     * The balance the period starts from (§12): the party's opening balance
     * plus every entry strictly before the window. With no `from`, that is
     * simply the opening balance — nothing precedes the book.
     *
     * @param  Collection<int, array>  $all  the complete series, oldest first, each carrying its running balance
     */
    private function balanceBefore(Collection $all, float $opening, ?string $from): float
    {
        if (blank($from)) {
            return $opening;
        }

        $preceding = $all->filter(fn (array $row) => $row['date'] < $from);

        // The running balance on the last row before the window already *is*
        // the carried-forward opening — no re-summing, and no chance of the
        // two disagreeing.
        return $preceding->isEmpty() ? $opening : (float) $preceding->last()['balance'];
    }

    private function withinDates(?string $date, ?string $from, ?string $to): bool
    {
        if ($date === null) {
            return false;
        }
        if (filled($from) && $date < $from) {
            return false;
        }

        return ! (filled($to) && $date > $to);
    }

    private function matchesType(array $row, ?string $type): bool
    {
        return match ($type) {
            'debit' => $row['debit'] > 0,
            'credit' => $row['credit'] > 0,
            default => true,
        };
    }

    private function matchesSearch(array $row, ?string $search): bool
    {
        if (blank($search)) {
            return true;
        }

        $needle = mb_strtolower(trim($search));
        $haystack = mb_strtolower(implode(' ', array_filter([
            $row['details'], $row['reference'], $row['customer_name'], $row['entry_no'],
        ])));

        return str_contains($haystack, $needle);
    }

    /**
     * An entry is one-sided: a debit or a credit, never both, never neither.
     * Validation already enforces this on the request, but the rule belongs
     * with the ledger rather than only with the HTTP layer — nothing should
     * be able to write a two-sided line, whatever calls it.
     */
    private function assertOneSidedAmount(array $payload): void
    {
        $debit = (float) ($payload['debit'] ?? 0);
        $credit = (float) ($payload['credit'] ?? 0);

        if ($debit > 0 && $credit > 0) {
            throw new BusinessRuleException('An entry is either a debit or a credit, not both.');
        }
        if ($debit <= 0 && $credit <= 0) {
            throw new BusinessRuleException('Enter an amount in either Debit or Credit.');
        }
    }

    /** What the audit trail stores — the entry in business terms, not raw columns. */
    private function auditSnapshot(CustomerInternalLedgerEntry $entry): array
    {
        return [
            'customer' => $entry->customer?->name,
            'date' => $entry->date?->toDateString(),
            'details' => $entry->details,
            'reference' => $entry->reference,
            'debit' => (float) $entry->debit,
            'credit' => (float) $entry->credit,
        ];
    }

    private function describe(string $verb, CustomerInternalLedgerEntry $entry): string
    {
        $side = $entry->debit > 0 ? 'debit' : 'credit';
        $amount = $this->money((float) ($entry->debit > 0 ? $entry->debit : $entry->credit));

        return sprintf('%s %s %s for %s', $verb, $side, $amount, $entry->customer?->name ?? 'party');
    }

    private function money(float $amount): string
    {
        return '৳'.number_format($amount, 2);
    }
}
