<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Transaction;
use App\Services\CustomerLedgerService;
use App\Services\LedgerService;
use App\Support\StaleWrite;
use Illuminate\Http\Request;

class TransactionController extends Controller
{
    public function __construct(
        private LedgerService $ledger,
        private CustomerLedgerService $customerLedger,
    ) {}

    public function index(Request $request)
    {
        $accountId = $request->integer('account_id') ?: null;
        $rows = $this->ledger->ledgerRows($accountId);

        if ($request->filled('category')) {
            $rows = $rows->filter(fn ($r) => $r['category_name'] === $request->string('category'))->values();
        }
        if ($request->filled('direction')) {
            $rows = $rows->filter(fn ($r) => $r['direction'] === $request->string('direction'))->values();
        }
        if ($request->filled('from')) {
            $rows = $rows->filter(fn ($r) => $r['date'] >= $request->string('from'))->values();
        }
        if ($request->filled('to')) {
            $rows = $rows->filter(fn ($r) => $r['date'] <= $request->string('to'))->values();
        }

        return $rows;
    }

    /**
     * A ledger entry, optionally tagged with the customer it came from.
     *
     * `customer_id` is optional and only meaningful on a Cash In: with it the
     * receipt is a customer payment, so it is handed to CustomerLedgerService
     * — which writes the receivables credit and this cash row together as one
     * linked pair — instead of being created here as a standalone cash row.
     * Without it nothing changes: a general Cash In (or any Cash Out) is still
     * the plain single row it has always been.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'date' => ['required', 'date', 'before_or_equal:today'],
            'details' => ['nullable', 'string', 'max:255'],
            'account_id' => ['required', 'exists:accounts,id'],
            'direction' => ['required', 'in:in,out'],
            'category_id' => ['required', 'exists:categories,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'method' => ['nullable', 'string', 'max:40'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $category = Category::find($data['category_id']);
        if ($category && $category->direction !== $data['direction']) {
            return response()->json(['message' => 'That category is not valid for this direction.'], 422);
        }

        if (! empty($data['customer_id'])) {
            if ($data['direction'] !== 'in') {
                return response()->json(['message' => 'A customer can only be attached to money coming in.'], 422);
            }

            $payment = $this->customerLedger->recordPayment([
                'customer_id' => $data['customer_id'],
                'date' => $data['date'],
                'amount' => $data['amount'],
                'account_id' => $data['account_id'],
                'method' => $data['method'] ?? null,
                'details' => $data['details'] ?? null,
                'reason' => $data['reason'] ?? null,
            ]);

            return response()->json($payment->cashTransaction, 201);
        }

        $reason = $data['reason'] ?? null;
        unset($data['customer_id'], $data['method'], $data['reason']);
        $transaction = $this->ledger->createTransaction($data + ['category_name' => $category?->name], $reason);

        return response()->json($transaction, 201);
    }

    /**
     * Edit an entry in place (§13) — the reference (TX-000123) is unchanged,
     * the old row is never deleted and re-created, and the before/after values
     * land in the audit trail.
     *
     * A transfer leg is edited as the whole transfer: both sides move together
     * or neither does, so the two accounts can never disagree about how much
     * was moved (§17).
     */
    public function update(Request $request, Transaction $transaction)
    {
        $isTransfer = $transaction->transfer_id !== null;

        $data = $request->validate($isTransfer ? [
            'date' => ['required', 'date', 'before_or_equal:today'],
            'from_account_id' => ['required', 'exists:accounts,id'],
            'to_account_id' => ['required', 'exists:accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'details' => ['nullable', 'string', 'max:255'],
            'reason' => ['nullable', 'string', 'max:255'],
            'expected_updated_at' => ['nullable', 'string'],
        ] : [
            'date' => ['required', 'date', 'before_or_equal:today'],
            'details' => ['nullable', 'string', 'max:255'],
            'account_id' => ['required', 'exists:accounts,id'],
            'direction' => ['required', 'in:in,out'],
            'category_id' => ['required', 'exists:categories,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'reason' => ['nullable', 'string', 'max:255'],
            'expected_updated_at' => ['nullable', 'string'],
        ]);

        if ($stale = StaleWrite::check($transaction, $data['expected_updated_at'] ?? null)) {
            return $stale;
        }

        try {
            if ($isTransfer) {
                [$out, $in] = $this->ledger->updateTransfer($transaction, $data, $data['reason'] ?? null);

                return response()->json(['out' => $out, 'in' => $in]);
            }

            return response()->json(
                $this->ledger->updateTransaction($transaction, $data, $data['reason'] ?? null)
            );
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function transfer(Request $request)
    {
        $data = $request->validate([
            'date' => ['required', 'date', 'before_or_equal:today'],
            'from_account_id' => ['required', 'exists:accounts,id'],
            'to_account_id' => ['required', 'exists:accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'details' => ['nullable', 'string', 'max:255'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            [$out, $in] = $this->ledger->transfer($data);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['out' => $out, 'in' => $in], 201);
    }

    /**
     * Void, not delete (§14). The entry leaves the active register; its
     * original figures stay on the row, behind an audit event that records who
     * removed it and the reason they gave.
     */
    public function destroy(Request $request, Transaction $transaction)
    {
        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:255']])['reason'] ?? null;

        $this->ledger->voidTransaction($transaction->id, $reason);

        return response()->json(null, 204);
    }

    /** Puts a voided entry back, as its own audited event. */
    public function restore(Request $request, int $transaction)
    {
        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:255']])['reason'] ?? null;

        try {
            return response()->json($this->ledger->restoreTransaction($transaction, $reason));
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
