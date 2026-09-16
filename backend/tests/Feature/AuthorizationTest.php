<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Customer;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Transaction;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Backend authorization must be real, not just the frontend hiding a button —
 * these hit the actual routes/middleware, the same way a direct API call
 * (bypassing the UI entirely) would.
 */
class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);
    }

    public function test_user_without_sales_delete_gets_403_but_admin_succeeds(): void
    {
        $customer = Customer::factory()->create();
        $sale = Sale::create([
            'invoice_no' => 'INV-2026-001', 'date' => '2026-01-01', 'customer_id' => $customer->id,
        ]);

        $staff = User::factory()->create();
        $staff->assignRole('Staff');
        Sanctum::actingAs($staff, ['*']);

        $this->deleteJson("/api/sales/{$sale->id}")->assertForbidden();
        $this->assertDatabaseHas('sales', ['id' => $sale->id]);

        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin, ['*']);

        $this->deleteJson("/api/sales/{$sale->id}")->assertNoContent();
        $this->assertDatabaseMissing('sales', ['id' => $sale->id]);
    }

    public function test_role_assignment_requires_its_own_permission_not_just_users_edit(): void
    {
        // A role with USERS_EDIT but deliberately NOT USERS_ROLE_ASSIGNMENT_EDIT.
        $limitedRole = \Spatie\Permission\Models\Role::create(['name' => 'UserEditorOnly', 'guard_name' => 'api']);
        $limitedRole->givePermissionTo(\App\Support\Permissions::USERS_EDIT);

        $actor = User::factory()->create();
        $actor->assignRole('UserEditorOnly');

        $target = User::factory()->create();
        $target->assignRole('Staff');

        Sanctum::actingAs($actor, ['*']);

        $this->putJson("/api/users/{$target->id}", [
            'name' => $target->name,
            'email' => $target->email,
            'roles' => ['Admin'],
        ])->assertOk();

        $this->assertTrue($target->fresh()->hasRole('Staff'));
        $this->assertFalse($target->fresh()->hasRole('Admin'));
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $this->getJson('/api/sales')->assertUnauthorized();
    }

    public function test_rate_per_ton_is_hidden_from_staff_but_visible_to_admin_and_manager(): void
    {
        $customer = Customer::factory()->create();
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $sale = Sale::create([
            'invoice_no' => 'INV-2026-002', 'date' => '2026-01-01', 'customer_id' => $customer->id,
        ]);
        SaleItem::create([
            'sale_id' => $sale->id, 'product_id' => $product->id, 'mesh_size_id' => $mesh->id,
            'bags' => 10, 'rate_per_ton' => 5000,
        ]);

        $staff = User::factory()->create();
        $staff->assignRole('Staff');
        Sanctum::actingAs($staff, ['*']);

        $staffItem = collect($this->getJson('/api/app-data')->assertOk()->json('saleItems'))->first();
        $this->assertArrayNotHasKey('rate_per_ton', $staffItem);
        $this->assertEquals(2500.0, $staffItem['amount']);

        foreach (['Admin', 'Manager'] as $roleName) {
            $user = User::factory()->create();
            $user->assignRole($roleName);
            Sanctum::actingAs($user, ['*']);

            $item = collect($this->getJson('/api/app-data')->assertOk()->json('saleItems'))->first();
            $this->assertEquals(5000, $item['rate_per_ton'], "rate_per_ton should be visible to {$roleName}");
            $this->assertEquals(2500.0, $item['amount']);
        }
    }

    public function test_user_without_raw_material_edit_gets_403_but_admin_succeeds(): void
    {
        $product = Product::factory()->create();
        $shipment = app(\App\Services\InventoryService::class)->receiveStock([
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 10_000, 'tare_weight_kg' => 0,
        ]);

        $staff = User::factory()->create();
        $staff->assignRole('Staff');
        Sanctum::actingAs($staff, ['*']);

        $this->putJson("/api/shipments/{$shipment->id}", [
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 9_000, 'tare_weight_kg' => 0,
        ])->assertForbidden();

        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin, ['*']);

        $this->putJson("/api/shipments/{$shipment->id}", [
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 9_000, 'tare_weight_kg' => 0,
        ])->assertOk();
    }

    public function test_staff_can_view_profit_but_not_curate_company_costs(): void
    {
        $cash = Account::factory()->create(['kind' => 'cash']);
        $transaction = Transaction::create([
            'date' => '2026-01-01', 'account_id' => $cash->id, 'direction' => 'out',
            'amount' => 1000, 'is_company_cost' => false,
        ]);

        // Staff has PROFIT_VIEW (it's a plain _VIEW permission) but must not
        // also get the narrower PROFIT_EDIT that lets a reviewer curate which
        // Cash Out rows count as a Company Cost.
        $staff = User::factory()->create();
        $staff->assignRole('Staff');
        Sanctum::actingAs($staff, ['*']);

        $this->patchJson("/api/transactions/{$transaction->id}/company-cost", ['is_company_cost' => true])
            ->assertForbidden();
        $this->assertFalse($transaction->fresh()->is_company_cost);

        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin, ['*']);

        $this->patchJson("/api/transactions/{$transaction->id}/company-cost", ['is_company_cost' => true])
            ->assertOk();
        $this->assertTrue($transaction->fresh()->is_company_cost);
    }
}
