<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Sale;
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
}
