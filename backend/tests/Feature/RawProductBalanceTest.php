<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Customer;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\User;
use App\Models\WastageEntry;
use App\Services\InventoryService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Raw Product Balance = Imported − Finished Sold (billable TON) − Direct Raw Sold (net TON) − Wastage.
 *
 * Production is not subtracted — it converts raw material into bags, it sells
 * nothing — so the balance covers loose raw stock plus unsold finished bags.
 * The physical yard figure (current_raw_stock_ton) is kept alongside and still
 * guards every entry.
 */
class RawProductBalanceTest extends TestCase
{
    use RefreshDatabase;

    private Product $white;

    private Product $red;

    private MeshSize $mesh;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        $this->white = Product::factory()->create(['name' => 'Vietnam White Limestone']);
        $this->red = Product::factory()->create(['name' => 'Oman Red Limestone']);
        $this->mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->customer = Customer::factory()->create();

        foreach ([[$this->white, 1_000_000], [$this->red, 50_000]] as [$product, $kg]) {
            $this->inventory()->receiveStock([
                'date' => '2026-01-01', 'product_id' => $product->id, 'gross_weight_kg' => $kg, 'tare_weight_kg' => 0,
            ]);
        }

        $user = User::factory()->create();
        $user->assignRole('Admin');
        Sanctum::actingAs($user, ['*']);
    }

    private function inventory(): InventoryService
    {
        return app(InventoryService::class);
    }

    private function produce(int $bags, string $date = '2026-01-10'): void
    {
        $this->postJson('/api/production-entries', [
            'date' => $date, 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => $bags,
        ])->assertCreated();
    }

    private function finishedSale(int $bags, ?float $actualTon = null, string $date = '2026-02-01'): int
    {
        return $this->postJson('/api/sales', $this->finishedPayload($bags, $actualTon, $date))->assertCreated()->json('id');
    }

    private function finishedPayload(int $bags, ?float $actualTon, string $date = '2026-02-01'): array
    {
        return [
            'date' => $date, 'customer_id' => $this->customer->id,
            'items' => [array_filter([
                'product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id,
                'bags' => $bags, 'rate_per_ton' => 2_000, 'actual_weight_ton' => $actualTon,
            ], fn ($v) => $v !== null)],
        ];
    }

    private function rawSale(float $netKg, string $date = '2026-02-05'): void
    {
        $this->postJson('/api/sales', [
            'sale_type' => 'raw_material', 'date' => $date, 'customer_id' => $this->customer->id,
            'product_id' => $this->white->id, 'net_weight_kg' => $netKg, 'rate_per_ton' => 3_000,
        ])->assertCreated();
    }

    private function stock(): array
    {
        return collect($this->getJson('/api/raw-materials')->assertOk()->json())->firstWhere('product_id', $this->white->id);
    }

    public function test_production_does_not_reduce_the_balance_but_does_reduce_loose_yard_stock(): void
    {
        $this->produce(2_000); // 100 Ton bagged

        $stock = $this->stock();
        $this->assertEqualsWithDelta(1_000, $stock['raw_product_balance_ton'], 1e-9);
        $this->assertEqualsWithDelta(900, $stock['current_raw_stock_ton'], 1e-9, 'loose yard stock');
        $this->assertEqualsWithDelta(100, $stock['produced_ton'], 1e-9, 'production still tracked');
    }

    public function test_finished_sale_deducts_its_calculated_billable_ton(): void
    {
        $this->produce(2_000);
        $this->finishedSale(500); // 500 × 50 kg = 25 Ton

        $stock = $this->stock();
        $this->assertEqualsWithDelta(25, $stock['finished_sale_ton'], 1e-9);
        $this->assertEqualsWithDelta(975, $stock['raw_product_balance_ton'], 1e-9);
        $this->assertEqualsWithDelta(900, $stock['current_raw_stock_ton'], 1e-9, 'a bagged sale never touches loose stock');
    }

    public function test_finished_sale_deducts_the_edited_actual_ton_not_the_bag_calculation(): void
    {
        $this->produce(2_000);
        $saleId = $this->finishedSale(200, 10.35); // 200 bags = 10 Ton calculated, billed 10.35

        $this->getJson("/api/sales/{$saleId}")->assertOk()->assertJsonPath('total_weight_ton', 10.35);
        $stock = $this->stock();
        $this->assertEqualsWithDelta(10.35, $stock['finished_sale_ton'], 1e-9);
        $this->assertEqualsWithDelta(989.65, $stock['raw_product_balance_ton'], 1e-9);
    }

    public function test_editing_or_deleting_a_finished_sale_replaces_its_deduction_never_adds_to_it(): void
    {
        $this->produce(2_000);
        $saleId = $this->finishedSale(200);
        $this->assertEqualsWithDelta(990, $this->stock()['raw_product_balance_ton'], 1e-9);

        $this->putJson("/api/sales/{$saleId}", $this->finishedPayload(200, 10.7))->assertOk();
        $this->assertEqualsWithDelta(989.3, $this->stock()['raw_product_balance_ton'], 1e-9);

        $this->deleteJson("/api/sales/{$saleId}")->assertNoContent();
        $this->assertEqualsWithDelta(1_000, $this->stock()['raw_product_balance_ton'], 1e-9);
    }

    public function test_direct_raw_sale_and_wastage_are_each_deducted_once(): void
    {
        $this->produce(2_000);
        $this->finishedSale(500);              // 25 Ton billable
        $this->rawSale(20_000.5);              // 20.0005 Ton net
        WastageEntry::create(['date' => '2026-02-06', 'product_id' => $this->white->id, 'quantity_kg' => 150]);

        $stock = $this->stock();
        // 1,000 − 25 − 20.0005 − 0.15
        $this->assertEqualsWithDelta(954.8495, $stock['raw_product_balance_ton'], 1e-9);
        // 1,000 − 100 (production) − 20.0005 − 0.15
        $this->assertEqualsWithDelta(879.8495, $stock['current_raw_stock_ton'], 1e-9);
    }

    public function test_materials_stay_separate(): void
    {
        $this->produce(2_000);
        $this->finishedSale(500);

        $red = collect($this->getJson('/api/raw-materials')->json())->firstWhere('product_id', $this->red->id);
        $this->assertEqualsWithDelta(50, $red['raw_product_balance_ton'], 1e-9);
        $this->assertEqualsWithDelta(0, $red['finished_sale_ton'], 1e-9);
    }

    public function test_date_window_carries_the_opening_balance_in(): void
    {
        $this->produce(2_000);
        $this->finishedSale(200, null, '2026-01-20'); // 10 Ton in January
        $this->finishedSale(100, null, '2026-02-10'); // 5 Ton in February
        $this->rawSale(20_000, '2026-02-12');

        $row = collect($this->getJson('/api/raw-materials/report?from=2026-02-01&to=2026-02-28')->assertOk()->json())
            ->firstWhere('product_id', $this->white->id);

        $this->assertEqualsWithDelta(990, $row['opening_balance_ton'], 1e-9);
        $this->assertEqualsWithDelta(5, $row['finished_sale_ton'], 1e-9);
        $this->assertEqualsWithDelta(20, $row['raw_sale_ton'], 1e-9);
        $this->assertEqualsWithDelta(965, $row['raw_product_balance_ton'], 1e-9);
        // The physical figures in the same window are unchanged in meaning.
        $this->assertEqualsWithDelta(900, $row['opening_ton'], 1e-9);
        $this->assertEqualsWithDelta(880, $row['current_raw_stock_ton'], 1e-9);

        $this->assertEqualsWithDelta(965, $this->inventory()->rawProductBalance($this->white->id), 1e-9);
    }

    public function test_entries_are_still_guarded_by_loose_yard_stock_not_the_balance(): void
    {
        $this->produce(19_000); // 950 Ton bagged → 50 Ton loose, balance still 1,000

        $this->assertEqualsWithDelta(1_000, $this->stock()['raw_product_balance_ton'], 1e-9);

        // 60 Ton more would fit the balance but not the yard.
        $this->postJson('/api/production-entries', [
            'date' => '2026-01-11', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 1_200,
        ])->assertUnprocessable();
    }
}
