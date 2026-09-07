<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Customer;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\Transaction;
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

        Transaction::create(['date' => '2026-03-15', 'account_id' => $cash->id, 'direction' => 'out', 'amount' => 1500]);

        $result = $profit->monthlyProfit(2026, 2); // March = index 2

        $this->assertEqualsWithDelta(15000.0, $result['total_sales'], 0.01); // 3 ton * 5000
        $this->assertEqualsWithDelta(3000.0, $result['cost_of_goods_sold'], 0.01); // 3 ton * 1000, not 10 ton
        $this->assertEqualsWithDelta(12000.0, $result['gross_profit'], 0.01);
        $this->assertEqualsWithDelta(1500.0, $result['total_expenses'], 0.01);
        $this->assertEqualsWithDelta(10500.0, $result['net_profit'], 0.01);
    }
}
