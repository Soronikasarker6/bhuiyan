<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\LedgerClosing;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\RawMaterialImport;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Transaction;
use App\Models\UnitOfMeasure;
use App\Models\WastageEntry;
use App\Support\Permissions;
use Illuminate\Http\Request;

/**
 * Bootstrap endpoint: every collection in one call, shaped like the frontend's
 * AppData interface, so the existing src/utils/*.ts derivation functions keep
 * working completely unchanged once useAppData loads from this instead of
 * localStorage.
 */
class AppDataController extends Controller
{
    public function index(Request $request)
    {
        $canViewRate = (bool) $request->user()?->can(Permissions::SALES_RATE_VIEW);

        return response()->json([
            'products' => Product::orderBy('name')->get(),
            'meshSizes' => MeshSize::orderBy('name')->get(),
            'unitsOfMeasure' => UnitOfMeasure::orderBy('name')->get(),
            'customers' => Customer::orderBy('name')->get(),
            'accounts' => Account::orderBy('name')->get(),
            'categories' => Category::orderBy('name')->get(),
            'rawMaterialImports' => RawMaterialImport::with('product')->orderByDesc('date')->orderByDesc('id')
                ->get()->map(fn (RawMaterialImport $i) => $i->toPresentedArray()),
            'wastageEntries' => WastageEntry::orderByDesc('date')->orderByDesc('id')->get(),
            'productionEntries' => ProductionEntry::orderByDesc('date')->orderByDesc('id')->get(),
            'sales' => Sale::orderByDesc('date')->orderByDesc('id')->get(),
            'saleItems' => SaleItem::with('meshSize')->get()
                ->map(fn (SaleItem $item) => $this->presentSaleItem($item, $canViewRate)),
            'customerTransactions' => CustomerTransaction::orderByDesc('date')->orderByDesc('id')->get(),
            'transactions' => Transaction::orderByDesc('date')->orderByDesc('id')->get(),
            'ledgerClosings' => LedgerClosing::with('balances')->orderByDesc('month_key')->get(),
            'seeded' => true,
        ]);
    }

    /**
     * Rate/TON is confidential — it stays in the database and keeps driving
     * every calculation server-side, but is only included in this payload for
     * users holding SALES_RATE_VIEW. `amount`/weight figures are always
     * computed and included here so totals, due, ledger and reports keep
     * working for everyone regardless of rate visibility.
     */
    private function presentSaleItem(SaleItem $item, bool $canViewRate): array
    {
        $data = $item->toArray();
        $data['calculated_weight_ton'] = $item->calculatedWeightTon();
        $data['weight_ton'] = $item->billableWeightTon();
        $data['amount'] = $item->amount();

        if (! $canViewRate) {
            unset($data['rate_per_ton']);
        }

        return $data;
    }
}
