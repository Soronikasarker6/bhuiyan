<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Services\AuditLogger;
use App\Services\LedgerService;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    public function __construct(
        private LedgerService $ledger,
        private AuditLogger $audit,
    ) {}

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

        $account = Account::create($data + ['system' => false]);

        $this->audit->record(AuditEntity::ACCOUNT, $account->id, AuditAction::CREATE, [
            'record' => $account->name,
            'after' => $this->audit->snapshot($account),
            'summary' => "Added {$account->kind} account {$account->name}",
        ]);

        return response()->json($account, 201);
    }

    /** Renaming is safe — transactions reference account_id, not name. */
    public function update(Request $request, Account $account)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'kind' => ['required', 'in:cash,bank'],
        ]);

        $before = $this->audit->snapshot($account);
        $account->update($data);

        $this->audit->recordUpdate(
            AuditEntity::ACCOUNT,
            $account->id,
            $before,
            $account->refresh(),
            ['record' => $account->name],
        );

        return $account;
    }

    public function destroy(Account $account)
    {
        $before = $this->audit->snapshot($account);
        $name = $account->name;

        try {
            $this->ledger->deleteAccount($account->id);
        } catch (\App\Exceptions\BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $this->audit->record(AuditEntity::ACCOUNT, $account->id, AuditAction::DELETE, [
            'record' => $name,
            'before' => $before,
            'summary' => "Deleted account {$name}",
        ]);

        return response()->json(null, 204);
    }

    public function balance(Account $account)
    {
        return $this->ledger->accountBalances()->firstWhere('account_id', $account->id);
    }
}
