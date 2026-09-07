<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\LedgerClosing;
use App\Services\LedgerService;
use Illuminate\Http\Request;

class LedgerClosingController extends Controller
{
    public function __construct(private LedgerService $ledger) {}

    public function index()
    {
        return LedgerClosing::with('balances')->orderByDesc('month_key')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'month_key' => ['required', 'regex:/^\d{4}-\d{2}$/'],
        ]);

        try {
            $closing = $this->ledger->closeMonth($data['month_key']);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($closing, 201);
    }

    public function destroy(LedgerClosing $ledgerClosing)
    {
        $this->ledger->reopenMonth($ledgerClosing->id);

        return response()->json(null, 204);
    }
}
