<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Customer;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\Sale;
use App\Models\User;
use App\Services\SalesService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Gross/tare weighbridge figures on a sale — stored, validated, and kept apart from the billable weight. */
class SaleWeighbridgeTest extends TestCase
{
    use RefreshDatabase;

    private Product $product;

    private MeshSize $mesh;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        $this->product = Product::factory()->create();
        $this->mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->customer = Customer::factory()->create();
        ProductionEntry::create(['date' => '2026-01-01', 'product_id' => $this->product->id, 'mesh_id' => $this->mesh->id, 'bags' => 500]);

        $user = User::factory()->create();
        $user->assignRole('Admin');
        Sanctum::actingAs($user, ['*']);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'date' => '2026-02-02', 'customer_id' => $this->customer->id, 'truck_no' => 'DMT-1',
            'items' => [['product_id' => $this->product->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 100, 'rate_per_ton' => 2000]],
        ], $overrides);
    }

    public function test_stores_gross_and_tare_and_derives_net(): void
    {
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => 18250, 'tare_weight_kg' => 13100]))
            ->assertCreated()
            ->assertJsonPath('gross_weight_kg', 18250)
            ->assertJsonPath('tare_weight_kg', 13100)
            ->assertJsonPath('net_weight_kg', 5150);
    }

    public function test_net_weight_never_replaces_the_billable_weight(): void
    {
        // 100 bags × 50kg = 5 ton billed; the slip says 5.15 ton net. Billing stays on 5 ton.
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => 18250, 'tare_weight_kg' => 13100]))
            ->assertCreated()
            ->assertJsonPath('total_weight_ton', 5)
            ->assertJsonPath('total_amount', 10000);
    }

    public function test_weights_are_optional_and_old_sales_stay_blank(): void
    {
        $sale = app(SalesService::class)->createSale($this->payload());

        $this->getJson("/api/sales/{$sale->id}")
            ->assertOk()
            ->assertJsonPath('gross_weight_kg', null)
            ->assertJsonPath('tare_weight_kg', null)
            ->assertJsonPath('net_weight_kg', null);
    }

    public function test_net_is_null_when_only_one_weight_is_recorded(): void
    {
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => 18000]))
            ->assertCreated()
            ->assertJsonPath('net_weight_kg', null);
    }

    public function test_rejects_negative_weights(): void
    {
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => -1, 'tare_weight_kg' => -5]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['gross_weight_kg', 'tare_weight_kg']);
    }

    public function test_rejects_gross_not_greater_than_tare(): void
    {
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => 13000, 'tare_weight_kg' => 13000]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['gross_weight_kg']);

        $this->assertSame(0, Sale::count());
    }

    public function test_editing_a_sale_can_add_and_clear_weights(): void
    {
        $sale = app(SalesService::class)->createSale($this->payload());

        $this->putJson("/api/sales/{$sale->id}", $this->payload(['gross_weight_kg' => 20000, 'tare_weight_kg' => 14000]))
            ->assertOk()
            ->assertJsonPath('net_weight_kg', 6000);

        $this->putJson("/api/sales/{$sale->id}", $this->payload())
            ->assertOk()
            ->assertJsonPath('gross_weight_kg', null)
            ->assertJsonPath('net_weight_kg', null);
    }
}
