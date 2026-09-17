<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CategoryControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin, ['*']);
    }

    public function test_creating_an_out_category_without_expense_type_defaults_to_company_expense(): void
    {
        $response = $this->postJson('/api/categories', ['name' => 'Freight', 'direction' => 'out']);

        $response->assertCreated();
        $this->assertSame('company_expense', $response->json('expense_type'));
    }

    public function test_a_cash_in_category_never_gets_an_expense_type(): void
    {
        $response = $this->postJson('/api/categories', [
            'name' => 'Customer Payment', 'direction' => 'in', 'expense_type' => 'company_expense',
        ]);

        $response->assertCreated();
        $this->assertNull($response->json('expense_type'));
    }

    public function test_updating_a_category_without_sending_expense_type_keeps_its_current_value(): void
    {
        $category = Category::factory()->create([
            'direction' => 'out', 'expense_type' => 'excluded', 'name' => 'Bank Loan Repayment',
        ]);

        // Renaming the category without resending expense_type must not
        // silently un-exclude it back to the 'company_expense' default.
        $response = $this->putJson("/api/categories/{$category->id}", [
            'name' => 'Bank Loan Repayment (Renamed)', 'direction' => 'out',
        ]);

        $response->assertOk();
        $this->assertSame('excluded', $response->json('expense_type'));
        $this->assertSame('excluded', $category->fresh()->expense_type);
    }

    public function test_updating_a_category_can_still_explicitly_change_its_expense_type(): void
    {
        $category = Category::factory()->create(['direction' => 'out', 'expense_type' => 'excluded']);

        $response = $this->putJson("/api/categories/{$category->id}", [
            'name' => $category->name, 'direction' => 'out', 'expense_type' => 'company_expense',
        ]);

        $response->assertOk();
        $this->assertSame('company_expense', $category->fresh()->expense_type);
    }
}
