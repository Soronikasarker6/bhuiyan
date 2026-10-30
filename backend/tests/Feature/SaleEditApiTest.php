<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\User;
use App\Services\SalesService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** PUT /sales/{id} over HTTP — permissions, validation, the response shape and the audit record. */
class SaleEditApiTest extends TestCase
{
    use RefreshDatabase;

    private Product $product;
    private MeshSize $mesh;
    private Customer $customer;
    private int $saleId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        $this->product = Product::factory()->create();
        $this->mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->customer = Customer::factory()->create();
        ProductionEntry::create(['date' => '2026-01-01', 'product_id' => $this->product->id, 'mesh_id' => $this->mesh->id, 'bags' => 300]);

        $this->saleId = app(SalesService::class)->createSale([
            'date' => '2026-02-01', 'customer_id' => $this->customer->id, 'paid_at_sale' => 1000,
            'items' => [['product_id' => $this->product->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 100, 'rate_per_ton' => 2000]],
        ])->id;
    }

    private function actingAsRole(string $role): void
    {
        $user = User::factory()->create();
        $user->assignRole($role);
        Sanctum::actingAs($user, ['*']);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'date' => '2026-02-02', 'customer_id' => $this->customer->id, 'truck_no' => 'DHA-1', 'paid_at_sale' => 3000,
            'items' => [['product_id' => $this->product->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 120, 'rate_per_ton' => 2500]],
        ], $overrides);
    }

    public function test_admin_can_edit_a_sale(): void
    {
        $this->actingAsRole('Admin');

        // 120 bags * 50kg = 6 ton * 2500 = 15,000; 3,000 paid.
        $this->putJson("/api/sales/{$this->saleId}", $this->payload())
            ->assertOk()
            ->assertJsonPath('truck_no', 'DHA-1')
            ->assertJsonPath('total_amount', 15000)
            ->assertJsonPath('amount_paid', 3000)
            ->assertJsonPath('amount_due', 12000);

        $this->getJson('/api/sales')->assertOk()->assertJsonCount(1);
        $this->assertTrue(AuditLog::where('entity_id', $this->saleId)->where('action', 'UPDATE')->exists());
    }

    public function test_manager_can_edit_but_staff_cannot(): void
    {
        $this->actingAsRole('Manager');
        $this->putJson("/api/sales/{$this->saleId}", $this->payload())->assertOk();

        $this->actingAsRole('Staff');
        $this->putJson("/api/sales/{$this->saleId}", $this->payload())->assertForbidden();
    }

    public function test_edit_over_stock_is_refused_with_a_message(): void
    {
        $this->actingAsRole('Admin');

        $items = [['product_id' => $this->product->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 301, 'rate_per_ton' => 2500]];
        $this->putJson("/api/sales/{$this->saleId}", $this->payload(['items' => $items]))
            ->assertStatus(422)
            ->assertJsonFragment(['message' => "Insufficient stock. Only 300 bags are currently available for Mesh {$this->mesh->name}."]);
    }

    public function test_paid_cannot_exceed_the_edited_total(): void
    {
        $this->actingAsRole('Admin');

        $this->putJson("/api/sales/{$this->saleId}", $this->payload(['paid_at_sale' => 999999]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('paid_at_sale');
    }
}
