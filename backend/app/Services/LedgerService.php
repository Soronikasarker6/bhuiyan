<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Models\Account;
use App\Models\Category;
use App\Models\LedgerClosing;
use App\Models\LedgerClosingBalance;
use App\Models\Transaction;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Ported from src/utils/ledger.ts. The Cash & Bank ledger — separate from the
 * customer receivables ledger. Balance per account = running (in - out), never
 * stored. A transfer between two accounts writes two rows sharing transfer_id.
 */
class LedgerService
{
    /** @return Collection<int, array> rows for one account (or all), newest-first, with running balance */
    public function ledgerRows(?int $accountId = null): Collection
    {
        $query = Transaction::query()->with(['account', 'category']);
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

            return [$out, $in];
        });
    }

    public function deleteTransaction(int $id): void
    {
        DB::transaction(function () use ($id) {
            $transaction = Transaction::findOrFail($id);
            if ($transaction->transfer_id) {
                Transaction::where('transfer_id', $transaction->transfer_id)->delete();
            } else {
                $transaction->delete();
            }
        });
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

            return $closing->fresh('balances');
        });
    }

    public function reopenMonth(int $closingId): void
    {
        LedgerClosing::findOrFail($closingId)->delete();
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
