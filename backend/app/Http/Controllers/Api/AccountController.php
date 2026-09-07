<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Services\LedgerService;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    public function __construct(private LedgerService $ledger) {}

    public function index()
    {
        return Account::orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'kind' => ['required', 'in:cash,bank'],
        ]);

        return response()->json(Account::create($data + ['system' => false]), 201);
    }

    /** Renaming is safe — transactions reference account_id, not name. */
    public function update(Request $request, Account $account)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'kind' => ['required', 'in:cash,bank'],
        ]);

        $account->update($data);

        return $account;
    }

    public function destroy(Account $account)
    {
        try {
            $this->ledger->deleteAccount($account->id);
        } catch (\App\Exceptions\BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(null, 204);
    }

    public function balance(Account $account)
    {
        return $this->ledger->accountBalances()->firstWhere('account_id', $account->id);
    }
}
