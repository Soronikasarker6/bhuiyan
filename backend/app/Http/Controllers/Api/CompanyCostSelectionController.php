<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Services\LedgerService;
use Illuminate\Http\Request;

/**
 * Curates which Cash Out categories count toward Profit & Loss's "Company
 * Costs" for a given month — replaces the old per-transaction toggle
 * (TransactionController::togglePnlCost) now that the picker works at
 * category grain. Deliberately narrow, same as that toggle was: it never
 * touches a ledger entry, only this one selection.
 */
class CompanyCostSelectionController extends Controller
{
    public function __construct(private LedgerService $ledger) {}

    public function toggle(Request $request)
    {
        $data = $request->validate([
            'month_key' => ['required', 'regex:/^\d{4}-\d{2}$/'],
            'category_id' => ['required', 'exists:categories,id'],
            'selected' => ['required', 'boolean'],
        ]);

        try {
            $this->ledger->setCompanyCostSelection($data['month_key'], (int) $data['category_id'], $data['selected']);
        } catch (BusinessRuleException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(
            $this->ledger->companyCostCategoryTotals($data['month_key'])
                ->firstWhere('category_id', (int) $data['category_id'])
        );
    }
}
