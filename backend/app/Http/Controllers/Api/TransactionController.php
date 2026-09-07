<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Transaction;
use App\Services\LedgerService;
use Illuminate\Http\Request;

class TransactionController extends Controller
{
    public function __construct(private LedgerService $ledger) {}

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

    public function store(Request $request)
    {
        $data = $request->validate([
            'date' => ['required', 'date', 'before_or_equal:today'],
            'details' => ['nullable', 'string', 'max:255'],
            'account_id' => ['required', 'exists:accounts,id'],
            'direction' => ['required', 'in:in,out'],
            'category_id' => ['required', 'exists:categories,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
        ]);

        $category = Category::find($data['category_id']);
        if ($category && $category->direction !== $data['direction']) {
            return response()->json(['message' => 'That category is not valid for this direction.'], 422);
        }

        $transaction = Transaction::create($data + ['category_name' => $category?->name]);

        return response()->json($transaction, 201);
    }

    public function transfer(Request $request)
    {
        $data = $request->validate([
            'date' => ['required', 'date', 'before_or_equal:today'],
            'from_account_id' => ['required', 'exists:accounts,id'],
            'to_account_id' => ['required', 'exists:accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0'],
            'details' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            [$out, $in] = $this->ledger->transfer($data);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['out' => $out, 'in' => $in], 201);
    }

    public function destroy(Transaction $transaction)
    {
        $this->ledger->deleteTransaction($transaction->id);

        return response()->json(null, 204);
    }
}
