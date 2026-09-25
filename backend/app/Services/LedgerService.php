<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Models\Account;
use App\Models\Category;
use App\Models\CompanyCostSelection;
use App\Models\CustomerTransaction;
use App\Models\LedgerClosing;
use App\Models\LedgerClosingBalance;
use App\Models\Transaction;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Ported from src/utils/ledger.ts. The Cash & Bank ledger — separate from the
 * customer receivables ledger. Balance per account = running (in - out), never
 * stored. A transfer between two accounts writes two rows sharing transfer_id.
 *
 * Every mutation here records itself through the one central
 * {@see AuditLogger}, inside the same DB transaction as the change, so a
 * committed change and its audit row cannot come apart. Nothing in this file
 * ever takes the acting user from a payload — the logger resolves that from
 * the authenticated session itself.
 */
class LedgerService
{
    public function __construct(
        private AuditLogger $audit,
        private CustomerLedgerService $customerLedger,
    ) {}

    /** @return Collection<int, array> rows for one account (or all), newest-first, with running balance */
    public function ledgerRows(?int $accountId = null): Collection
    {
        $query = Transaction::query()->with(['account', 'category', 'customer']);
        if ($accountId) {
            $query->where('account_id', $accountId);
        }

        $running = [];
        $rows = $query->orderBy('date')->orderBy('created_at')->orderBy('id')->get()
            ->map(function (Transaction $t) use (&$running) {
                $running[$t->account_id] = ($running[$t->account_id] ?? 0)
                    + ($t->direction === 'in' ? (float) $t->amount : -(float) $t->amount);

                return array_merge($t->toArray(), [
                    'account_name' => $t->account?->name,
                    'customer_name' => $t->customer?->name,
                    'balance' => $running[$t->account_id],
                ]);
            });

        return $rows->reverse()->values();
    }

    /** @return Collection<int, array{account_id,account_name,kind,total_in,total_out,balance}> */
    public function accountBalances(?string $asOf = null): Collection
    {
        return Account::orderBy('name')->get()->map(function (Account $account) use ($asOf) {
            $query = Transaction::where('account_id', $account->id);
            if ($asOf) {
                $query->where('date', '<=', $asOf);
            }
            $totalIn = (float) (clone $query)->where('direction', 'in')->sum('amount');
            $totalOut = (float) (clone $query)->where('direction', 'out')->sum('amount');

            return [
                'account_id' => $account->id,
                'account_name' => $account->name,
                'kind' => $account->kind,
                'total_in' => $totalIn,
                'total_out' => $totalOut,
                'balance' => $totalIn - $totalOut,
            ];
        });
    }

    public function totalBalances(?string $asOf = null): array
    {
        $balances = $this->accountBalances($asOf);
        $cash = $balances->where('kind', 'cash')->sum('balance');
        $bank = $balances->where('kind', 'bank')->sum('balance');

        return ['cash' => $cash, 'bank' => $bank, 'combined' => $cash + $bank];
    }

    /** Excludes transfer legs so internal moves don't inflate turnover. */
    public function monthMovement(string $monthKey): array
    {
        [$year, $month] = explode('-', $monthKey);
        $query = Transaction::whereYear('date', $year)->whereMonth('date', $month)
            ->whereNull('transfer_id');

        $in = (float) (clone $query)->where('direction', 'in')->sum('amount');
        $out = (float) (clone $query)->where('direction', 'out')->sum('amount');

        return ['month_in' => $in, 'month_out' => $out, 'net' => $in - $out];
    }

    /**
     * Every category eligible to be a Profit & Loss "Company Cost"
     * (direction='out', not a transfer/financing/personal category someone
     * excluded in Settings), each with its own Cash Out total for the month
     * and whether it is currently selected. Included even at ৳0 so the
     * picker can show every eligible category, checked or not.
     */
    public function companyCostCategoryTotals(string $monthKey): Collection
    {
        [$year, $month] = explode('-', $monthKey);

        $selectedIds = CompanyCostSelection::where('month_key', $monthKey)->pluck('category_id')->all();

        $categories = Category::where('direction', 'out')
            ->where('expense_type', 'company_expense')
            ->orderBy('name')
            ->get();

        // One grouped query for every eligible category's total, not one
        // Transaction::sum() per category — this runs on every P&L page
        // load and once per month in the yearly Reports build.
        $amountByCategory = Transaction::whereIn('category_id', $categories->pluck('id'))
            ->whereYear('date', $year)->whereMonth('date', $month)
            ->whereNull('transfer_id')
            ->where('direction', 'out')
            ->selectRaw('category_id, SUM(amount) as total')
            ->groupBy('category_id')
            ->pluck('total', 'category_id');

        return $categories->map(fn (Category $category) => [
            'category_id' => $category->id,
            'name' => $category->name,
            'amount' => (float) ($amountByCategory[$category->id] ?? 0),
            'selected' => in_array($category->id, $selectedIds, true),
        ]);
    }

    /**
     * Profit & Loss's "Company Costs" for one month: the sum of every
     * eligible category someone has selected, not the full month's cash-out
     * movement. Customer payments are always direction='in' so they can
     * never appear here regardless of selection.
     */
    public function companyCostsForMonth(string $monthKey): float
    {
        return $this->companyCostCategoryTotals($monthKey)
            ->where('selected', true)
            ->sum('amount');
    }

    /**
     * Selects or clears one category as a Company Cost for one month.
     * Rejects anything that isn't an eligible Cash Out category — a Cash In
     * category, or one someone marked Excluded (a transfer, a loan
     * repayment, a personal withdrawal) — the same way the old per-
     * transaction toggle only ever accepted direction='out' rows.
     */
    public function setCompanyCostSelection(string $monthKey, int $categoryId, bool $selected): void
    {
        $category = Category::findOrFail($categoryId);
        if ($category->direction !== 'out' || $category->expense_type !== 'company_expense') {
            throw new BusinessRuleException('Only an eligible Cash Out expense category can be a company cost.');
        }

        if ($selected) {
            CompanyCostSelection::firstOrCreate(['month_key' => $monthKey, 'category_id' => $categoryId]);
        } else {
            CompanyCostSelection::where('month_key', $monthKey)->where('category_id', $categoryId)->delete();
        }
    }

    /**
     * Replaces the *entire* set of Company Cost categories selected for one
     * month in a single call — the picker's "Go" batches every pick/unpick
     * from one session into this one request instead of one round trip per
     * category, the way {@see setCompanyCostSelection()} works.
     */
    public function setCompanyCostSelections(string $monthKey, array $categoryIds): void
    {
        $categoryIds = array_values(array_unique(array_map('intval', $categoryIds)));

        $eligibleIds = Category::where('direction', 'out')
            ->where('expense_type', 'company_expense')
            ->pluck('id')
            ->all();

        if (array_diff($categoryIds, $eligibleIds)) {
            throw new BusinessRuleException('Only an eligible Cash Out expense category can be a company cost.');
        }

        DB::transaction(function () use ($monthKey, $categoryIds) {
            CompanyCostSelection::where('month_key', $monthKey)
                ->whereNotIn('category_id', $categoryIds)
                ->delete();

            $existingIds = CompanyCostSelection::where('month_key', $monthKey)->pluck('category_id')->all();
            foreach (array_diff($categoryIds, $existingIds) as $categoryId) {
                CompanyCostSelection::create(['month_key' => $monthKey, 'category_id' => $categoryId]);
            }
        });
    }

    /**
     * One plain ledger entry (not a transfer, not a customer payment — both of
     * those have their own path). Here purely so that creating an entry and
     * auditing it are one operation rather than two things a controller has to
     * remember to do in order.
     */
    public function createTransaction(array $attributes, ?string $reason = null): Transaction
    {
        return DB::transaction(function () use ($attributes, $reason) {
            $transaction = Transaction::create($attributes);

            $this->audit->record(AuditEntity::CASH_TRANSACTION, $transaction->id, AuditAction::CREATE, [
                'record' => $transaction->reference,
                'after' => $this->audit->snapshot($transaction),
                'reason' => $reason,
                'summary' => sprintf(
                    'Recorded %s %s · %s',
                    $transaction->direction === 'in' ? 'money in' : 'money out',
                    $this->money((float) $transaction->amount),
                    $transaction->category_name ?? 'Uncategorised',
                ),
            ]);

            return $transaction;
        });
    }

    /** Two linked rows sharing transfer_id, written atomically. */
    public function transfer(array $payload): array
    {
        return DB::transaction(function () use ($payload) {
            if ((int) $payload['from_account_id'] === (int) $payload['to_account_id']) {
                throw new BusinessRuleException('Cannot transfer an account to itself.');
            }

            $from = Account::findOrFail($payload['from_account_id']);
            $to = Account::findOrFail($payload['to_account_id']);
            $transferId = (string) Str::uuid();
            $category = $this->transferCategory($from, $to);

            $out = Transaction::create([
                'date' => $payload['date'],
                'details' => $payload['details'] ?? "Transfer to {$to->name}",
                'account_id' => $from->id,
                'direction' => 'out',
                'category_name' => $category,
                'amount' => $payload['amount'],
                'transfer_id' => $transferId,
            ]);

            $in = Transaction::create([
                'date' => $payload['date'],
                'details' => $payload['details'] ?? "Transfer from {$from->name}",
                'account_id' => $to->id,
                'direction' => 'in',
                'category_name' => $category,
                'amount' => $payload['amount'],
                'transfer_id' => $transferId,
            ]);

            // One business operation, one audit event — keyed on the transfer,
            // not on either leg, so "who moved ৳50,000 from Cash to Janata
            // Bank" reads as the single thing it is (§17). Both leg references
            // are in the metadata for anyone tracing it back to the register.
            $this->audit->record(AuditEntity::TRANSFER, $transferId, AuditAction::TRANSFER, [
                'record' => $this->transferReference($transferId),
                'after' => $this->transferSnapshot($out, $in, $from, $to),
                'reason' => $payload['reason'] ?? null,
                'metadata' => $this->transferMetadata($out, $in),
                'summary' => "Transferred {$this->money($payload['amount'])} from {$from->name} to {$to->name}",
            ]);

            return [$out, $in];
        });
    }

    /**
     * Edit one ledger entry in place (§13).
     *
     * The row is updated, never deleted-and-recreated: TX-000123 stays
     * TX-000123, every report that already cites it keeps pointing at the same
     * event, and the audit trail gets one UPDATE with the old and new figures
     * rather than a DELETE followed by an unrelated-looking CREATE.
     *
     * Three kinds of row are refused rather than half-edited here, because
     * each is one leg of a larger event that has its own edit path:
     * a transfer leg ({@see updateTransfer}), the cash half of a customer
     * payment (the Cash In screen, which moves both ledgers together), and the
     * "paid at sale" row an invoice posted.
     */
    public function updateTransaction(Transaction $transaction, array $payload, ?string $reason = null): Transaction
    {
        return DB::transaction(function () use ($transaction, $payload, $reason) {
            if ($transaction->transfer_id) {
                throw new BusinessRuleException('This entry is one leg of a transfer — edit the transfer itself so both legs stay in step.');
            }
            if ($transaction->customer_transaction_id) {
                throw new BusinessRuleException('This entry is a customer payment — edit it on the Cash In screen so the customer ledger is updated with it.');
            }
            if ($transaction->reference_sale_id) {
                throw new BusinessRuleException('This entry is the amount paid on an invoice — it can only change by editing that sale.');
            }

            $before = $this->audit->snapshot($transaction);

            $category = Category::find($payload['category_id'] ?? null);
            if ($category && $category->direction !== $payload['direction']) {
                throw new BusinessRuleException('That category is not valid for this direction.');
            }

            $transaction->update([
                'date' => $payload['date'],
                'details' => $payload['details'] ?? null,
                'account_id' => $payload['account_id'],
                'direction' => $payload['direction'],
                'category_id' => $payload['category_id'] ?? null,
                'category_name' => $category?->name ?? $transaction->category_name,
                'amount' => $payload['amount'],
            ]);

            $transaction->refresh();

            $this->audit->recordUpdate(
                AuditEntity::CASH_TRANSACTION,
                $transaction->id,
                $before,
                $transaction,
                ['record' => $transaction->reference, 'reason' => $reason],
            );

            return $transaction;
        });
    }

    /**
     * Edit a transfer as the one operation it is (§17) — both legs move
     * together or neither does, so the two accounts can never be left
     * disagreeing about how much was moved.
     *
     * @return array{0: Transaction, 1: Transaction} the out leg, then the in leg
     */
    public function updateTransfer(Transaction $leg, array $payload, ?string $reason = null): array
    {
        return DB::transaction(function () use ($leg, $payload, $reason) {
            if (! $leg->transfer_id) {
                throw new BusinessRuleException('That entry is not part of a transfer.');
            }
            if ((int) $payload['from_account_id'] === (int) $payload['to_account_id']) {
                throw new BusinessRuleException('Cannot transfer an account to itself.');
            }

            $legs = Transaction::where('transfer_id', $leg->transfer_id)->get();
            $out = $legs->firstWhere('direction', 'out');
            $in = $legs->firstWhere('direction', 'in');

            if (! $out || ! $in) {
                throw new BusinessRuleException('This transfer is missing one of its legs and cannot be edited.');
            }

            $from = Account::findOrFail($payload['from_account_id']);
            $to = Account::findOrFail($payload['to_account_id']);
            $before = $this->transferSnapshot($out, $in, $out->account, $in->account);
            $category = $this->transferCategory($from, $to);

            $out->update([
                'date' => $payload['date'],
                'details' => $payload['details'] ?? "Transfer to {$to->name}",
                'account_id' => $from->id,
                'category_name' => $category,
                'amount' => $payload['amount'],
            ]);

            $in->update([
                'date' => $payload['date'],
                'details' => $payload['details'] ?? "Transfer from {$from->name}",
                'account_id' => $to->id,
                'category_name' => $category,
                'amount' => $payload['amount'],
            ]);

            $this->audit->recordUpdate(
                AuditEntity::TRANSFER,
                $leg->transfer_id,
                $before,
                $this->transferSnapshot($out->refresh(), $in->refresh(), $from, $to),
                [
                    'record' => $this->transferReference($leg->transfer_id),
                    'reason' => $reason,
                    'metadata' => $this->transferMetadata($out, $in),
                ],
            );

            return [$out, $in];
        });
    }

    /**
     * Voids a ledger entry and whatever else was part of the same event:
     * both legs of a transfer, or — for the cash half of a customer payment —
     * the receivables row it was written with, so removing the receipt puts the
     * customer's due back rather than leaving them credited for money that is
     * no longer recorded anywhere.
     *
     * A void, not a delete (§14): the row leaves the active register but its
     * original figures survive on the row, behind the VOID audit event that
     * also carries the full before-snapshot, who voided it and why.
     *
     * The pairing used to be maintained by the database
     * (`transactions.customer_transaction_id` cascades on delete). A cascade
     * only fires on a hard delete, so both halves are now voided explicitly —
     * one code path, one audit event, neither half able to survive alone.
     */
    public function voidTransaction(int $id, ?string $reason = null): void
    {
        DB::transaction(function () use ($id, $reason) {
            $transaction = Transaction::findOrFail($id);

            if ($transaction->transfer_id) {
                $this->voidTransfer($transaction, $reason);

                return;
            }

            if ($transaction->customer_transaction_id) {
                $payment = CustomerTransaction::find($transaction->customer_transaction_id);
                if ($payment) {
                    $this->customerLedger->voidPayment($payment, $reason);

                    return;
                }
            }

            $before = $this->audit->snapshot($transaction);
            $reference = $transaction->reference;
            $this->markVoided($transaction, $reason);

            $this->audit->record(AuditEntity::CASH_TRANSACTION, $id, AuditAction::VOID, [
                'record' => $reference,
                'before' => $before,
                'reason' => $reason,
                'summary' => sprintf(
                    'Voided %s %s · %s',
                    $before['direction'] === 'in' ? 'money in' : 'money out',
                    $this->money((float) $before['amount']),
                    $before['category_name'] ?? 'Uncategorised',
                ),
            ]);
        });
    }

    /** Puts a voided entry back on the active register, as its own audited event (§3). */
    public function restoreTransaction(int $id, ?string $reason = null): Transaction
    {
        return DB::transaction(function () use ($id, $reason) {
            $transaction = Transaction::withTrashed()->findOrFail($id);

            if (! $transaction->trashed()) {
                throw new BusinessRuleException('That entry is not voided.');
            }

            if ($transaction->transfer_id) {
                Transaction::withTrashed()->where('transfer_id', $transaction->transfer_id)
                    ->get()->each(fn (Transaction $leg) => $this->markRestored($leg));

                $this->audit->record(AuditEntity::TRANSFER, $transaction->transfer_id, AuditAction::RESTORE, [
                    'record' => $this->transferReference($transaction->transfer_id),
                    'after' => $this->audit->snapshot($transaction->fresh()),
                    'reason' => $reason,
                ]);

                return $transaction->fresh();
            }

            $this->markRestored($transaction);

            $this->audit->record(AuditEntity::CASH_TRANSACTION, $id, AuditAction::RESTORE, [
                'record' => $transaction->reference,
                'after' => $this->audit->snapshot($transaction->fresh()),
                'reason' => $reason,
            ]);

            return $transaction->fresh();
        });
    }

    /** Both legs voided together, audited once against the transfer (§17). */
    private function voidTransfer(Transaction $leg, ?string $reason): void
    {
        $legs = Transaction::where('transfer_id', $leg->transfer_id)->get();
        $out = $legs->firstWhere('direction', 'out');
        $in = $legs->firstWhere('direction', 'in');
        $before = $out && $in ? $this->transferSnapshot($out, $in, $out->account, $in->account) : $this->audit->snapshot($leg);

        $legs->each(fn (Transaction $row) => $this->markVoided($row, $reason));

        $this->audit->record(AuditEntity::TRANSFER, $leg->transfer_id, AuditAction::VOID, [
            'record' => $this->transferReference($leg->transfer_id),
            'before' => $before,
            'reason' => $reason,
            'metadata' => $out && $in ? $this->transferMetadata($out, $in) : null,
            'summary' => 'Voided transfer of '.$this->money((float) $leg->amount),
        ]);
    }

    private function markVoided(Transaction $transaction, ?string $reason): void
    {
        $transaction->forceFill([
            'voided_by_user_id' => auth()->id(),
            'void_reason' => $reason,
        ])->save();

        $transaction->delete();
    }

    private function markRestored(Transaction $transaction): void
    {
        $transaction->restore();
        $transaction->forceFill(['voided_by_user_id' => null, 'void_reason' => null])->save();
    }

    /**
     * A transfer as one object rather than two rows, so before/after in the
     * audit detail reads the way the operation itself does: an amount moving
     * from one named account to another.
     */
    private function transferSnapshot(Transaction $out, Transaction $in, ?Account $from, ?Account $to): array
    {
        return [
            'date' => $out->date?->toDateString(),
            'amount' => (float) $out->amount,
            'from_account' => $from?->name,
            'to_account' => $to?->name,
            'category_name' => $out->category_name,
            'details' => $out->details,
        ];
    }

    private function transferMetadata(Transaction $out, Transaction $in): array
    {
        return [
            'out_reference' => $out->reference,
            'in_reference' => $in->reference,
            'transfer_id' => $out->transfer_id,
        ];
    }

    /** TR-xxxxxxxx — the short, readable handle for a transfer's UUID. */
    private function transferReference(string $transferId): string
    {
        return 'TR-'.strtoupper(substr(str_replace('-', '', $transferId), 0, 8));
    }

    private function money(float $amount): string
    {
        return '৳'.number_format($amount, 2);
    }

    private function transferCategory(Account $from, Account $to): string
    {
        return match (true) {
            $from->kind === 'cash' && $to->kind === 'bank' => 'Cash to Bank',
            $from->kind === 'bank' && $to->kind === 'cash' => 'Bank to Cash',
            $from->kind === 'bank' && $to->kind === 'bank' => 'Bank to Bank',
            default => 'Cash to Cash',
        };
    }

    /** Spend-by-category, for the "Where the money went" report/chart. */
    public function categoryBreakdown(string $direction, ?string $from = null, ?string $to = null): Collection
    {
        $query = Transaction::where('direction', $direction)->whereNull('transfer_id');
        if ($from) {
            $query->where('date', '>=', $from);
        }
        if ($to) {
            $query->where('date', '<=', $to);
        }

        return $query->get()
            ->groupBy(fn (Transaction $t) => $t->category_name ?? 'Uncategorised')
            ->map(fn ($rows, $name) => ['category' => $name, 'amount' => (float) $rows->sum('amount')])
            ->values();
    }

    public function closeMonth(string $monthKey): LedgerClosing
    {
        return DB::transaction(function () use ($monthKey) {
            if (LedgerClosing::where('month_key', $monthKey)->exists()) {
                throw new BusinessRuleException("{$monthKey} has already been closed.");
            }

            $movement = $this->monthMovement($monthKey);
            if ($movement['month_in'] == 0 && $movement['month_out'] == 0) {
                throw new BusinessRuleException("There is no activity in {$monthKey} to close.");
            }

            $date = Carbon::createFromFormat('Y-m', $monthKey)->endOfMonth();
            $balances = $this->accountBalances($date->toDateString());
            $cashTotal = $balances->where('kind', 'cash')->sum('balance');
            $bankTotal = $balances->where('kind', 'bank')->sum('balance');

            $closing = LedgerClosing::create([
                'month_key' => $monthKey,
                'month' => $date->format('F'),
                'year' => $date->year,
                'cash_total' => $cashTotal,
                'bank_total' => $bankTotal,
                'grand_total' => $cashTotal + $bankTotal,
                'month_in' => $movement['month_in'],
                'month_out' => $movement['month_out'],
                'net_movement' => $movement['net'],
                'closed_at' => now(),
            ]);

            foreach ($balances as $balance) {
                LedgerClosingBalance::create([
                    'ledger_closing_id' => $closing->id,
                    'account_id' => $balance['account_id'],
                    'account_name' => $balance['account_name'],
                    'kind' => $balance['kind'],
                    'balance' => $balance['balance'],
                ]);
            }

            $this->audit->record(AuditEntity::LEDGER_CLOSING, $closing->id, AuditAction::CLOSE_MONTH, [
                'record' => $monthKey,
                'after' => $this->audit->snapshot($closing),
                'summary' => "Closed {$monthKey} at ".$this->money($cashTotal + $bankTotal),
            ]);

            return $closing->fresh('balances');
        });
    }

    public function reopenMonth(int $closingId): void
    {
        DB::transaction(function () use ($closingId) {
            $closing = LedgerClosing::findOrFail($closingId);
            $before = $this->audit->snapshot($closing);
            $monthKey = $closing->month_key;

            $closing->delete();

            $this->audit->record(AuditEntity::LEDGER_CLOSING, $closingId, AuditAction::REOPEN_MONTH, [
                'record' => $monthKey,
                'before' => $before,
                'summary' => "Reopened {$monthKey}",
            ]);
        });
    }

    public function deleteAccount(int $accountId): void
    {
        $account = Account::findOrFail($accountId);
        if ($account->system) {
            throw new BusinessRuleException('The system Cash account cannot be deleted.');
        }
        $account->delete();
    }

    public function deleteCategory(int $categoryId): void
    {
        Category::findOrFail($categoryId)->delete();
    }
}
