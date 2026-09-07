<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\ProductionEntry;
use App\Models\RawMaterialImport;
use App\Models\Sale;
use App\Services\CustomerLedgerService;
use App\Services\InventoryService;
use App\Services\LedgerService;
use App\Services\ProfitService;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function __construct(
        private InventoryService $inventory,
        private CustomerLedgerService $customerLedger,
        private LedgerService $ledger,
        private ProfitService $profit,
    ) {}

    public function summary()
    {
        $today = Carbon::today()->toDateString();
        $now = Carbon::now();

        $todaysImports = RawMaterialImport::where('date', $today)->get();
        $todaysImportedTon = $todaysImports->sum(fn (RawMaterialImport $i) => $i->netWeightTon());
        $totalImportedTon = RawMaterialImport::all()->sum(fn (RawMaterialImport $i) => $i->netWeightTon());

        $todaysProductionBags = ProductionEntry::where('date', $today)->sum('bags');
        $totalProductionBags = ProductionEntry::sum('bags');

        $todaysSales = Sale::where('date', $today)->get();
        $allSales = Sale::with('items.meshSize')->get();
        $totalSalesAmount = $allSales->sum(fn (Sale $s) => $s->items->sum(fn ($i) => $i->amount()));
        $todaysSalesAmount = $todaysSales->load('items.meshSize')
            ->sum(fn (Sale $s) => $s->items->sum(fn ($i) => $i->amount()));

        $totalDue = Customer::all()->sum(fn (Customer $c) => $this->customerLedger->totals($c->id)['total_due']);
        $totalAdvance = Customer::all()->sum(fn (Customer $c) => $this->customerLedger->totals($c->id)['available_advance']);

        $todaysCashIn = (float) CustomerTransaction::where('type', 'payment')->where('date', $today)->sum('credit');

        $netProfitThisMonth = $this->profit->monthlyProfit($now->year, $now->month - 1)['net_profit'];

        $stockByProduct = $this->inventory->allMeshStock()
            ->groupBy('product_name')
            ->map(fn ($rows, $name) => ['product' => $name, 'stock_ton' => $rows->sum('stock_ton')])
            ->sortByDesc('stock_ton')->values();

        $outstanding = Customer::orderBy('name')->get()
            ->map(fn (Customer $c) => array_merge(['id' => $c->id, 'name' => $c->name], $this->customerLedger->totals($c->id)))
            ->filter(fn ($c) => $c['total_due'] > 0)
            ->sortByDesc('total_due')->take(6)->values();

        return response()->json([
            'today' => [
                'imported_ton' => $todaysImportedTon,
                'production_bags' => (int) $todaysProductionBags,
                'sales_amount' => $todaysSalesAmount,
                'sales_count' => $todaysSales->count(),
                'cash_in' => $todaysCashIn,
            ],
            'totals' => [
                'imported_ton' => $totalImportedTon,
                'production_bags' => (int) $totalProductionBags,
                'sales_amount' => $totalSalesAmount,
                'customer_due' => $totalDue,
                'customer_advance' => $totalAdvance,
                'current_stock_ton' => $this->inventory->allMeshStock()->sum('stock_ton'),
            ],
            'net_profit_this_month' => $netProfitThisMonth,
            'cash_balance' => $this->ledger->totalBalances()['cash'],
            'bank_balance' => $this->ledger->totalBalances()['bank'],
            'stock_by_product' => $stockByProduct,
            'outstanding_customers' => $outstanding,
            'recent_sales' => Sale::with('customer')->orderByDesc('date')->orderByDesc('id')->take(6)->get(),
            'recent_imports' => RawMaterialImport::with('product')->orderByDesc('date')->orderByDesc('id')->take(6)->get(),
            'nothing_yet' => RawMaterialImport::count() === 0 && Sale::count() === 0,
        ]);
    }
}
