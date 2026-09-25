<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use App\Support\Permissions;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

/**
 * The hard rule: only Admin can read the audit trail.
 *
 * These hit the real routes with real tokens, the way a Manager bypassing the
 * UI entirely would — curl, Postman, the browser's address bar. Hiding the
 * menu item is not what enforces this and these tests never touch the UI.
 */
class AuditAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> every audit route a non-admin might try. */
    private const AUDIT_ROUTES = [
        '/api/audit-logs',
        '/api/audit-logs/filters',
        '/api/audit-logs/export',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);
    }

    private function userWithRole(string $role, string $name): User
    {
        $user = User::factory()->create(['name' => $name]);
        $user->assignRole($role);

        return $user;
    }

    private function log(): AuditLog
    {
        return AuditLog::create([
            'entity_type' => AuditEntity::CASH_TRANSACTION,
            'entity_id' => '1',
            'action' => AuditAction::UPDATE,
            'module' => 'Cash & Bank Ledger',
            'record_label' => 'TX-000001',
            'summary' => 'Changed amount',
            'performed_by_user_id' => null,
            'performed_by_user_name' => 'Manager B',
            'performed_at' => now(),
            'before_data' => ['amount' => 7000.0],
            'after_data' => ['amount' => 8000.0],
        ]);
    }

    public function test_admin_can_read_the_audit_trail(): void
    {
        $log = $this->log();
        Sanctum::actingAs($this->userWithRole('Admin', 'Owner'), ['*']);

        $this->getJson('/api/audit-logs')->assertOk()->assertJsonPath('data.0.record', 'TX-000001');
        $this->getJson('/api/audit-logs/filters')->assertOk();
        $this->getJson('/api/audit-logs/export')->assertOk();

        $this->getJson("/api/audit-logs/{$log->id}")
            ->assertOk()
            // A whole-number float survives the JSON round trip as an int.
            ->assertJsonPath('before.amount', fn ($value) => (float) $value === 7000.0)
            ->assertJsonPath('after.amount', fn ($value) => (float) $value === 8000.0)
            ->assertJsonPath('changedFields.0', 'amount');
    }

    public function test_manager_is_refused_every_audit_route(): void
    {
        $log = $this->log();
        Sanctum::actingAs($this->userWithRole('Manager', 'Manager B'), ['*']);

        foreach (self::AUDIT_ROUTES as $route) {
            $this->getJson($route)->assertForbidden();
        }

        $this->getJson("/api/audit-logs/{$log->id}")->assertForbidden();
    }

    public function test_staff_is_refused_every_audit_route(): void
    {
        $log = $this->log();
        Sanctum::actingAs($this->userWithRole('Staff', 'Yard Clerk'), ['*']);

        foreach (self::AUDIT_ROUTES as $route) {
            $this->getJson($route)->assertForbidden();
        }

        $this->getJson("/api/audit-logs/{$log->id}")->assertForbidden();
    }

    public function test_an_unauthenticated_request_never_reaches_the_audit_trail(): void
    {
        $this->log();

        foreach (self::AUDIT_ROUTES as $route) {
            $this->getJson($route)->assertUnauthorized();
        }
    }

    /**
     * The seeded roles must not drift: AUDIT_VIEW is Admin's alone. A future
     * change that widened Manager's permission filter would fail here rather
     * than quietly opening the whole system's before/after history.
     */
    public function test_only_the_admin_role_is_seeded_with_audit_view(): void
    {
        $this->assertTrue($this->userWithRole('Admin', 'A')->can(Permissions::AUDIT_VIEW));
        $this->assertFalse($this->userWithRole('Manager', 'B')->can(Permissions::AUDIT_VIEW));
        $this->assertFalse($this->userWithRole('Staff', 'C')->can(Permissions::AUDIT_VIEW));
    }

    /** No route, for any role, writes to the audit trail. */
    public function test_there_is_no_write_route_on_the_audit_api(): void
    {
        $log = $this->log();
        Sanctum::actingAs($this->userWithRole('Admin', 'Owner'), ['*']);

        $this->postJson('/api/audit-logs', ['action' => 'CREATE'])->assertStatus(405);
        $this->putJson("/api/audit-logs/{$log->id}", ['summary' => 'tampered'])->assertStatus(405);
        $this->deleteJson("/api/audit-logs/{$log->id}")->assertStatus(405);

        $this->assertSame('Changed amount', $log->fresh()->summary);
    }

    /** And the model itself refuses, so no future code path can either (§9). */
    public function test_an_audit_record_cannot_be_edited_or_deleted_at_all(): void
    {
        $log = $this->log();

        $this->expectException(RuntimeException::class);
        $log->update(['summary' => 'tampered']);
    }

    public function test_an_audit_record_cannot_be_deleted_at_all(): void
    {
        $log = $this->log();

        $this->expectException(RuntimeException::class);
        $log->delete();
    }
}
