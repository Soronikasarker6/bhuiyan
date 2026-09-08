<?php

namespace Tests\Feature;

use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserManagementTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin, ['*']);

        return $admin;
    }

    public function test_admin_can_create_a_user_and_assign_a_role(): void
    {
        $this->actingAsAdmin();

        $response = $this->postJson('/api/users', [
            'name' => 'New Manager',
            'email' => 'manager@example.test',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'roles' => ['Manager'],
        ]);

        $response->assertCreated();
        $user = User::where('email', 'manager@example.test')->firstOrFail();
        $this->assertTrue($user->hasRole('Manager'));
        $this->assertTrue($user->is_active);
    }

    public function test_duplicate_email_is_rejected(): void
    {
        $this->actingAsAdmin();
        User::factory()->create(['email' => 'taken@example.test']);

        $this->postJson('/api/users', [
            'name' => 'Someone', 'email' => 'taken@example.test',
            'password' => 'password123', 'password_confirmation' => 'password123',
        ])->assertUnprocessable()->assertJsonValidationErrors('email');
    }

    public function test_deactivated_user_cannot_log_in(): void
    {
        User::factory()->create([
            'email' => 'inactive@example.test', 'password' => 'password123', 'is_active' => false,
        ]);

        $this->postJson('/api/login', [
            'email' => 'inactive@example.test', 'password' => 'password123',
        ])->assertUnprocessable();
    }

    public function test_toggling_active_status_round_trips(): void
    {
        $this->actingAsAdmin();
        $user = User::factory()->create(['is_active' => true]);

        $this->postJson("/api/users/{$user->id}/toggle-active")->assertOk();
        $this->assertFalse($user->fresh()->is_active);

        $this->postJson("/api/users/{$user->id}/toggle-active")->assertOk();
        $this->assertTrue($user->fresh()->is_active);
    }

    public function test_admin_cannot_deactivate_or_delete_their_own_account(): void
    {
        $admin = $this->actingAsAdmin();

        $this->postJson("/api/users/{$admin->id}/toggle-active")->assertUnprocessable();
        $this->deleteJson("/api/users/{$admin->id}")->assertUnprocessable();
    }

    public function test_admin_role_cannot_be_deleted(): void
    {
        $this->actingAsAdmin();
        $adminRole = \Spatie\Permission\Models\Role::where('name', 'Admin')->firstOrFail();

        $this->deleteJson("/api/roles/{$adminRole->id}")->assertUnprocessable();
    }
}
