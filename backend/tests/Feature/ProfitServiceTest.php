<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Category;
use App\Models\CompanyCostSelection;
use App\Models\Customer;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\Transaction;
use App\Services\LedgerService;
use App\Services\ProfitService;
use App\Services\SalesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfitServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_monthly_profit_uses_tons_actually_sold_not_tons_imported(): void
    {
        $inventory = app(\App\Services\InventoryService::class);
        $sales = app(SalesService::class);
        $profit = app(ProfitService::class);

        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $customer = Customer::factory()->create();
        $cash = Account::factory()->create(['kind' => 'cash']);

        // Import 10 ton priced at 1,000/ton, but only sell 3 ton of it this month.
        $inventory->receiveStock(['date' => '2026-03-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000, 'tare_weight_kg' => 0, 'price_per_ton' => 1000]);
        ProductionEntry::create(['date' => '2026-03-02', 'product_id' => $product->id, 'mesh_id' => $mesh->id, 'bags' => 200]); // 10 ton bagged

        $sales->createSale([
            'date' => '2026-03-10', 'customer_id' => $customer->id,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 60, 'rate_per_ton' => 5000]], // 3 ton sold
        ]);

        $selectedCategory = Category::factory()->create(['direction' => 'out', 'expense_type' => 'company_expense']);
        $unselectedCategory = Category::factory()->create(['direction' => 'out', 'expense_type' => 'company_expense']);

        // Category selected as a company cost for this month — counted.
        Transaction::create([
            'date' => '2026-03-15', 'account_id' => $cash->id, 'direction' => 'out',
            'category_id' => $selectedCategory->id, 'amount' => 1500,
        ]);
        // Cash Out in an eligible category, but not selected this month — must NOT be counted.
        Transaction::create([
            'date' => '2026-03-16', 'account_id' => $cash->id, 'direction' => 'out',
            'category_id' => $unselectedCategory->id, 'amount' => 9000,
        ]);
        CompanyCostSelection::create(['month_key' => '2026-03', 'category_id' => $selectedCategory->id]);

        $result = $profit->monthlyProfit(2026, 2); // March = index 2

        $this->assertEqualsWithDelta(15000.0, $result['total_sales'], 0.01); // 3 ton * 5000
        $this->assertEqualsWithDelta(3000.0, $result['cost_of_goods_sold'], 0.01); // 3 ton * 1000, not 10 ton
        $this->assertEqualsWithDelta(12000.0, $result['gross_profit'], 0.01);
        $this->assertEqualsWithDelta(1500.0, $result['total_expenses'], 0.01); // only the selected 1,500, not the unselected 9,000
        $this->assertEqualsWithDelta(10500.0, $result['net_profit'], 0.01);
    }

    public function test_company_costs_are_zero_when_nothing_is_selected(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash']);
        $category = Category::factory()->create(['direction' => 'out', 'expense_type' => 'company_expense']);
        $profit = app(ProfitService::class);

        Transaction::create([
            'date' => '2026-04-01', 'account_id' => $cash->id, 'direction' => 'out',
            'category_id' => $category->id, 'amount' => 5000,
        ]);

        $result = $profit->monthlyProfit(2026, 3); // April

        $this->assertEqualsWithDelta(0.0, $result['total_expenses'], 0.01);
        $this->assertEqualsWithDelta(0.0, $result['net_profit'], 0.01);
    }

    public function test_excluded_category_never_counts_even_when_selected(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash']);
        $category = Category::factory()->create(['direction' => 'out', 'expense_type' => 'excluded']);
        $ledger = app(LedgerService::class);

        Transaction::create([
            'date' => '2026-05-01', 'account_id' => $cash->id, 'direction' => 'out',
            'category_id' => $category->id, 'amount' => 4000,
        ]);
        // Stray selection row for an excluded category (shouldn't normally
        // exist — setCompanyCostSelection() rejects creating one — but a
        // category could be re-marked Excluded after being selected).
        CompanyCostSelection::create(['month_key' => '2026-05', 'category_id' => $category->id]);

        $this->assertSame(0.0, $ledger->companyCostsForMonth('2026-05'));
        $this->assertCount(0, $ledger->companyCostCategoryTotals('2026-05'));
    }

    public function test_multiple_transactions_in_one_category_are_summed(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash']);
        $category = Category::factory()->create(['direction' => 'out', 'expense_type' => 'company_expense', 'name' => 'Salary']);
        $ledger = app(LedgerService::class);

        Transaction::create(['date' => '2026-06-01', 'account_id' => $cash->id, 'direction' => 'out', 'category_id' => $category->id, 'amount' => 20000]);
        Transaction::create(['date' => '2026-06-10', 'account_id' => $cash->id, 'direction' => 'out', 'category_id' => $category->id, 'amount' => 15000]);
        Transaction::create(['date' => '2026-06-20', 'account_id' => $cash->id, 'direction' => 'out', 'category_id' => $category->id, 'amount' => 15000]);
        // Outside the month — must not be included.
        Transaction::create(['date' => '2026-07-01', 'account_id' => $cash->id, 'direction' => 'out', 'category_id' => $category->id, 'amount' => 999999]);

        $totals = $ledger->companyCostCategoryTotals('2026-06');
        $this->assertEqualsWithDelta(50000.0, $totals->firstWhere('category_id', $category->id)['amount'], 0.01);

        $ledger->setCompanyCostSelection('2026-06', $category->id, true);
        $this->assertEqualsWithDelta(50000.0, $ledger->companyCostsForMonth('2026-06'), 0.01);
    }

    public function test_bulk_selection_replaces_the_whole_set_in_one_call(): void
    {
        $ledger = app(LedgerService::class);
        $kept = Category::factory()->create(['direction' => 'out', 'expense_type' => 'company_expense']);
        $dropped = Category::factory()->create(['direction' => 'out', 'expense_type' => 'company_expense']);
        $added = Category::factory()->create(['direction' => 'out', 'expense_type' => 'company_expense']);

        CompanyCostSelection::create(['month_key' => '2026-08', 'category_id' => $kept->id]);
        CompanyCostSelection::create(['month_key' => '2026-08', 'category_id' => $dropped->id]);

        $ledger->setCompanyCostSelections('2026-08', [$kept->id, $added->id]);

        $selectedIds = CompanyCostSelection::where('month_key', '2026-08')->pluck('category_id')->all();
        $this->assertEqualsCanonicalizing([$kept->id, $added->id], $selectedIds);
    }

    public function test_bulk_selection_rejects_an_ineligible_category(): void
    {
        $ledger = app(LedgerService::class);
        $ineligible = Category::factory()->create(['direction' => 'in']);

        $this->expectException(\App\Exceptions\BusinessRuleException::class);
        $ledger->setCompanyCostSelections('2026-08', [$ineligible->id]);
    }
}
