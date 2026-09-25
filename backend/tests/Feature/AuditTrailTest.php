<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AuditLog;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\Transaction;
use App\Models\User;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use App\Support\StaleWrite;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * What actually gets recorded, and who it says did it.
 *
 * The scenario throughout is the brief's own: Manager B edits TX-000123 from
 * ৳7,000 to ৳8,000, Manager C voids it, and the Admin — and only the Admin —
 * can read the whole story afterwards.
 */
class AuditTrailTest extends TestCase
{
    use RefreshDatabase;

    private Account $cash;

    private Account $bank;

    private Category $salary;

    private Category $customerPayment;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        $this->cash = Account::factory()->create(['kind' => 'cash', 'name' => 'Cash']);
        $this->bank = Account::factory()->create(['kind' => 'bank', 'name' => 'Janata Bank PLC']);
        $this->salary = Category::factory()->create(['name' => 'Salary', 'direction' => 'out']);
        $this->customerPayment = Category::factory()->create(['name' => 'Customer Payment', 'direction' => 'in']);
    }

    private function actAs(string $role, string $name): User
    {
        $user = User::factory()->create(['name' => $name]);
        $user->assignRole($role);
        Sanctum::actingAs($user, ['*']);

        return $user;
    }

    /** @return array{0: Transaction, 1: User} the created entry and the manager who created it */
    private function salaryPayment(float $amount = 7000): array
    {
        $manager = $this->actAs('Manager', 'Manager A');

        $this->postJson('/api/transactions', [
            'date' => '2026-09-24',
            'details' => 'September salary',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $this->salary->id,
            'amount' => $amount,
        ])->assertCreated();

        return [Transaction::firstOrFail(), $manager];
    }

    // ------------------------------------------------------------ recording

    public function test_creating_a_ledger_entry_is_recorded_against_the_authenticated_user(): void
    {
        [$transaction, $manager] = $this->salaryPayment();

        $log = AuditLog::forEntity(AuditEntity::CASH_TRANSACTION, $transaction->id)->firstOrFail();

        $this->assertSame(AuditAction::CREATE, $log->action);
        $this->assertSame('Cash & Bank Ledger', $log->module);
        $this->assertSame('TX-'.str_pad((string) $transaction->id, 6, '0', STR_PAD_LEFT), $log->record_label);
        $this->assertSame($manager->id, $log->performed_by_user_id);
        $this->assertSame('Manager A', $log->performed_by_user_name);
        $this->assertEqualsWithDelta(7000.0, (float) $log->after_data['amount'], 0.001);
        $this->assertNotNull($log->performed_at);
    }

    /**
     * The brief's §13 scenario, end to end: the amount changes, the entry does
     * not move, and the trail says who changed it from what to what.
     */
    public function test_editing_an_entry_updates_it_in_place_and_records_before_and_after(): void
    {
        [$transaction] = $this->salaryPayment(7000);
        $reference = $transaction->reference;

        $this->actAs('Manager', 'Manager B');

        $this->putJson("/api/transactions/{$transaction->id}", [
            'date' => '2026-09-24',
            'details' => 'September salary',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $this->salary->id,
            'amount' => 8000,
            'reason' => 'Corrected wrong amount',
        ])->assertOk();

        $transaction->refresh();
        $this->assertEqualsWithDelta(8000.0, $transaction->amount, 0.001);
        // Same row, same reference — never deleted and re-created.
        $this->assertSame($reference, $transaction->reference);
        $this->assertSame(1, Transaction::count());

        $log = AuditLog::forEntity(AuditEntity::CASH_TRANSACTION, $transaction->id)
            ->where('action', AuditAction::UPDATE)->firstOrFail();

        $this->assertSame('Manager B', $log->performed_by_user_name);
        $this->assertEqualsWithDelta(7000.0, (float) $log->before_data['amount'], 0.001);
        $this->assertEqualsWithDelta(8000.0, (float) $log->after_data['amount'], 0.001);
        $this->assertSame('Corrected wrong amount', $log->reason);
    }

    /** §14 — the entry leaves the active ledger; the original stays behind the audit event. */
    public function test_deleting_an_entry_voids_it_and_records_the_original(): void
    {
        [$transaction] = $this->salaryPayment(8000);

        $this->actAs('Manager', 'Manager C');

        $this->deleteJson("/api/transactions/{$transaction->id}", ['reason' => 'Wrong entry'])
            ->assertNoContent();

        $this->assertSame(0, Transaction::count());
        $this->assertSame(1, Transaction::onlyTrashed()->count());

        $log = AuditLog::forEntity(AuditEntity::CASH_TRANSACTION, $transaction->id)
            ->where('action', AuditAction::VOID)->firstOrFail();

        $this->assertSame('Manager C', $log->performed_by_user_name);
        $this->assertSame('Wrong entry', $log->reason);
        $this->assertEqualsWithDelta(8000.0, (float) $log->before_data['amount'], 0.001);
    }

    public function test_a_voided_entry_can_be_restored_as_its_own_event(): void
    {
        [$transaction] = $this->salaryPayment();
        $this->actAs('Manager', 'Manager C');
        $this->deleteJson("/api/transactions/{$transaction->id}", ['reason' => 'Mistake'])->assertNoContent();

        $this->actAs('Admin', 'Owner');
        $this->postJson("/api/transactions/{$transaction->id}/restore", ['reason' => 'Void was wrong'])->assertOk();

        $this->assertSame(1, Transaction::count());
        $this->assertNull(Transaction::firstOrFail()->void_reason);

        $this->assertSame(1, AuditLog::forEntity(AuditEntity::CASH_TRANSACTION, $transaction->id)
            ->where('action', AuditAction::RESTORE)->count());
    }

    /** §17 — a transfer is one operation with one audit event, never two loose rows. */
    public function test_a_transfer_is_audited_as_one_operation(): void
    {
        $this->actAs('Manager', 'Manager A');

        $this->postJson('/api/transactions/transfer', [
            'date' => '2026-09-24',
            'from_account_id' => $this->cash->id,
            'to_account_id' => $this->bank->id,
            'amount' => 50_000,
        ])->assertCreated();

        $log = AuditLog::where('entity_type', AuditEntity::TRANSFER)->firstOrFail();

        $this->assertSame(AuditAction::TRANSFER, $log->action);
        $this->assertSame('Manager A', $log->performed_by_user_name);
        $this->assertSame('Cash', $log->after_data['from_account']);
        $this->assertSame('Janata Bank PLC', $log->after_data['to_account']);
        $this->assertEqualsWithDelta(50_000.0, (float) $log->after_data['amount'], 0.001);
        $this->assertSame(1, AuditLog::where('entity_type', AuditEntity::TRANSFER)->count());
    }

    public function test_editing_a_transfer_moves_both_legs_and_audits_once(): void
    {
        $this->actAs('Manager', 'Manager A');
        $this->postJson('/api/transactions/transfer', [
            'date' => '2026-09-24',
            'from_account_id' => $this->cash->id,
            'to_account_id' => $this->bank->id,
            'amount' => 50_000,
        ])->assertCreated();

        $leg = Transaction::where('direction', 'out')->firstOrFail();

        $this->actAs('Manager', 'Manager B');
        $this->putJson("/api/transactions/{$leg->id}", [
            'date' => '2026-09-24',
            'from_account_id' => $this->cash->id,
            'to_account_id' => $this->bank->id,
            'amount' => 60_000,
            'reason' => 'Wrong figure',
        ])->assertOk();

        // Both sides moved — neither account can be left disagreeing.
        foreach (Transaction::all() as $row) {
            $this->assertEqualsWithDelta(60_000.0, (float) $row->amount, 0.001);
        }

        $log = AuditLog::where('entity_type', AuditEntity::TRANSFER)
            ->where('action', AuditAction::UPDATE)->firstOrFail();

        $this->assertEqualsWithDelta(50_000.0, (float) $log->before_data['amount'], 0.001);
        $this->assertEqualsWithDelta(60_000.0, (float) $log->after_data['amount'], 0.001);
    }

    /** §16 — a payment edit moves both ledgers and is recorded once, with before/after. */
    public function test_customer_payment_create_edit_and_void_are_all_audited(): void
    {
        $customer = Customer::factory()->create(['name' => 'Dipali Madam']);

        $this->actAs('Manager', 'Manager A');
        $this->postJson("/api/customers/{$customer->id}/payments", [
            'date' => '2026-09-24', 'amount' => 70_000, 'account_id' => $this->cash->id,
        ])->assertCreated();

        $payment = CustomerTransaction::where('type', 'payment')->firstOrFail();
        $this->assertSame('PAY-001', $payment->reference);

        $created = AuditLog::forEntity(AuditEntity::CUSTOMER_PAYMENT, $payment->id)
            ->where('action', AuditAction::CREATE)->firstOrFail();
        $this->assertSame('Manager A', $created->performed_by_user_name);
        $this->assertSame('PAY-001', $created->record_label);

        $this->actAs('Manager', 'Manager B');
        $this->putJson("/api/customers/{$customer->id}/payments/{$payment->id}", [
            'date' => '2026-09-24', 'amount' => 65_000, 'account_id' => $this->cash->id,
            'reason' => 'Overstated',
        ])->assertOk();

        $updated = AuditLog::forEntity(AuditEntity::CUSTOMER_PAYMENT, $payment->id)
            ->where('action', AuditAction::UPDATE)->firstOrFail();
        $this->assertSame('Manager B', $updated->performed_by_user_name);
        $this->assertEqualsWithDelta(70_000.0, (float) $updated->before_data['credit'], 0.001);
        $this->assertEqualsWithDelta(65_000.0, (float) $updated->after_data['credit'], 0.001);

        // Both ledgers recalculated together.
        $this->assertEqualsWithDelta(65_000.0, (float) Transaction::firstOrFail()->amount, 0.001);

        $this->actAs('Manager', 'Manager C');
        $this->deleteJson("/api/customers/{$customer->id}/payments/{$payment->id}", ['reason' => 'Duplicate'])
            ->assertNoContent();

        $voided = AuditLog::forEntity(AuditEntity::CUSTOMER_PAYMENT, $payment->id)
            ->where('action', AuditAction::VOID)->firstOrFail();
        $this->assertSame('Manager C', $voided->performed_by_user_name);
        $this->assertSame('Duplicate', $voided->reason);
        $this->assertSame(0, Transaction::count());
        $this->assertSame(0, CustomerTransaction::where('type', 'payment')->count());

        // The reference is not handed out again — the audit trail still names it.
        $this->actAs('Manager', 'Manager A');
        $this->postJson("/api/customers/{$customer->id}/payments", [
            'date' => '2026-09-25', 'amount' => 1_000,
        ])->assertCreated();
        $this->assertSame('PAY-002', CustomerTransaction::where('type', 'payment')->firstOrFail()->reference);
    }

    // ------------------------------------------------------- server identity

    /**
     * §5 — the one thing a client must never be able to say is who it is.
     * Every identity field is fed a lie in the payload; every one is ignored.
     */
    public function test_identity_fields_in_the_request_payload_are_ignored(): void
    {
        $admin = User::factory()->create(['name' => 'Owner']);
        $admin->assignRole('Admin');

        $manager = $this->actAs('Manager', 'Manager B');

        $this->postJson('/api/transactions', [
            'date' => '2026-09-24',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $this->salary->id,
            'amount' => 7000,
            // All of these are attempts to be someone else.
            'performed_by_user_id' => $admin->id,
            'performed_by_user_name' => 'Owner',
            'performedByUserId' => $admin->id,
            'created_by' => $admin->id,
            'updated_by' => $admin->id,
            'deleted_by' => $admin->id,
            'user_id' => $admin->id,
            'performed_at' => '2001-01-01 00:00:00',
        ])->assertCreated();

        $log = AuditLog::firstOrFail();

        $this->assertSame($manager->id, $log->performed_by_user_id);
        $this->assertSame('Manager B', $log->performed_by_user_name);
        $this->assertTrue($log->performed_at->isSameDay(now()), 'performed_at must come from the server clock');
    }

    /** A password never enters the history, even though the request carried one. */
    public function test_a_password_is_never_written_into_the_audit_trail(): void
    {
        $this->actAs('Admin', 'Owner');

        $this->postJson('/api/users', [
            'name' => 'Manager D',
            'email' => 'managerd@example.test',
            'password' => 'sup3r-s3cret-value',
            'password_confirmation' => 'sup3r-s3cret-value',
            'roles' => ['Manager'],
        ])->assertCreated();

        $log = AuditLog::where('entity_type', AuditEntity::USER)->firstOrFail();

        $this->assertStringNotContainsString('sup3r-s3cret-value', json_encode($log->toArray()));
    }

    /** §21 — a role change is recorded as a permission change, with before/after roles. */
    public function test_a_role_change_is_audited_as_a_permission_change(): void
    {
        $this->actAs('Admin', 'Owner');
        $target = User::factory()->create(['name' => 'Manager A']);
        $target->assignRole('Manager');

        $this->putJson("/api/users/{$target->id}", [
            'name' => 'Manager A',
            'email' => $target->email,
            'roles' => ['Admin'],
        ])->assertOk();

        $log = AuditLog::forEntity(AuditEntity::USER, $target->id)
            ->where('action', AuditAction::PERMISSION_CHANGE)->firstOrFail();

        $this->assertSame(['Manager'], $log->before_data['roles']);
        $this->assertSame(['Admin'], $log->after_data['roles']);
        $this->assertSame('Owner', $log->performed_by_user_name);
    }

    public function test_login_is_audited(): void
    {
        $user = User::factory()->create(['name' => 'Manager A', 'password' => 'secret-password']);
        $user->assignRole('Manager');

        $this->postJson('/api/login', [
            'email' => $user->email, 'password' => 'secret-password',
        ])->assertOk();

        $log = AuditLog::where('action', AuditAction::LOGIN)->firstOrFail();

        $this->assertSame('Manager A', $log->performed_by_user_name);
        $this->assertSame($user->id, $log->performed_by_user_id);
        $this->assertSame('Authentication', $log->module);
    }

    /**
     * Signed in with a real bearer token rather than through `/api/login` —
     * that endpoint also opens a session for the rest of the test, and
     * `currentAccessToken()` is then a transient one with nothing to revoke.
     */
    public function test_logout_is_audited(): void
    {
        $user = User::factory()->create(['name' => 'Manager A']);
        $user->assignRole('Manager');
        $token = $user->createToken('test')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/logout')->assertOk();

        $log = AuditLog::where('action', AuditAction::LOGOUT)->firstOrFail();

        $this->assertSame('Manager A', $log->performed_by_user_name);
    }

    /** §22 — a company profile edit shows old and new side by side. */
    public function test_company_profile_changes_are_audited(): void
    {
        $this->actAs('Admin', 'Owner');

        $this->postJson('/api/company-profile', [
            'name' => 'Bhuiyan Industry',
            'phone' => '01812345678',
        ])->assertOk();

        $log = AuditLog::where('entity_type', AuditEntity::COMPANY_PROFILE)->firstOrFail();

        $this->assertContains('phone', $log->after_data ? array_keys($log->after_data) : []);
        $this->assertSame('01812345678', $log->after_data['phone']);
    }

    // ------------------------------------------------------------ concurrency

    /** §28 — Manager A must not silently overwrite Manager B's newer edit. */
    public function test_a_stale_edit_is_refused_rather_than_overwriting_a_newer_one(): void
    {
        [$transaction] = $this->salaryPayment(7000);

        // What Manager A loaded before Manager B touched it.
        $staleStamp = $transaction->updated_at->toJSON();

        $this->actAs('Manager', 'Manager B');
        $this->travel(2)->seconds();
        $this->putJson("/api/transactions/{$transaction->id}", [
            'date' => '2026-09-24',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $this->salary->id,
            'amount' => 8000,
        ])->assertOk();

        $this->actAs('Manager', 'Manager A');
        $this->putJson("/api/transactions/{$transaction->id}", [
            'date' => '2026-09-24',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $this->salary->id,
            'amount' => 5000,
            'expected_updated_at' => $staleStamp,
        ])->assertStatus(409)->assertJsonPath('message', StaleWrite::MESSAGE);

        // Manager B's figure survived.
        $this->assertEqualsWithDelta(8000.0, (float) $transaction->fresh()->amount, 0.001);
    }

    public function test_an_edit_carrying_the_current_timestamp_goes_through(): void
    {
        [$transaction] = $this->salaryPayment(7000);

        $this->actAs('Manager', 'Manager B');
        $this->putJson("/api/transactions/{$transaction->id}", [
            'date' => '2026-09-24',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $this->salary->id,
            'amount' => 8000,
            'expected_updated_at' => $transaction->updated_at->toJSON(),
        ])->assertOk();

        $this->assertEqualsWithDelta(8000.0, (float) $transaction->fresh()->amount, 0.001);
    }

    // ------------------------------------------------------------- filtering

    public function test_the_admin_listing_filters_by_user_action_module_and_search(): void
    {
        [$transaction] = $this->salaryPayment(7000);
        $this->actAs('Manager', 'Manager B');
        $this->putJson("/api/transactions/{$transaction->id}", [
            'date' => '2026-09-24',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $this->salary->id,
            'amount' => 8000,
        ])->assertOk();

        $managerB = User::where('name', 'Manager B')->firstOrFail();
        $this->actAs('Admin', 'Owner');

        $this->getJson('/api/audit-logs?action='.AuditAction::UPDATE)
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.performedByUserName', 'Manager B');

        $this->getJson("/api/audit-logs?user_id={$managerB->id}")
            ->assertOk()->assertJsonCount(1, 'data');

        $this->getJson('/api/audit-logs?module='.urlencode('Cash & Bank Ledger'))
            ->assertOk()->assertJsonCount(2, 'data');

        $this->getJson('/api/audit-logs?search='.$transaction->reference)
            ->assertOk()->assertJsonCount(2, 'data');

        $this->getJson('/api/audit-logs?entity_type='.AuditEntity::CASH_TRANSACTION.'&entity_id='.$transaction->id)
            ->assertOk()->assertJsonCount(2, 'data');

        $this->getJson('/api/audit-logs?from=2000-01-01&to=2000-01-02')
            ->assertOk()->assertJsonCount(0, 'data');
    }

    /** The listing must never quietly become "everything ever recorded" in one response. */
    public function test_the_listing_is_paginated(): void
    {
        $this->salaryPayment(1000);

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/transactions', [
                'date' => '2026-09-24',
                'account_id' => $this->cash->id,
                'direction' => 'out',
                'category_id' => $this->salary->id,
                'amount' => 100 + $i,
            ])->assertCreated();
        }

        $this->actAs('Admin', 'Owner');

        $this->getJson('/api/audit-logs?per_page=5')
            ->assertOk()
            ->assertJsonCount(5, 'data')
            ->assertJsonPath('meta.total', 5)
            ->assertJsonPath('meta.per_page', 5);
    }

    /** An edit that changes nothing is not an event. */
    public function test_a_no_op_edit_records_nothing(): void
    {
        [$transaction] = $this->salaryPayment(7000);
        $before = AuditLog::count();

        $this->actAs('Manager', 'Manager B');
        $this->putJson("/api/transactions/{$transaction->id}", [
            'date' => '2026-09-24',
            'details' => 'September salary',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $this->salary->id,
            'amount' => 7000,
        ])->assertOk();

        $this->assertSame($before, AuditLog::count());
    }

    /** §15 — audit detail lives in the audit trail, not smeared across the active ledger. */
    public function test_the_active_ledger_is_not_cluttered_with_audit_detail(): void
    {
        [$transaction] = $this->salaryPayment(7000);

        $this->actAs('Manager', 'Manager B');
        $this->putJson("/api/transactions/{$transaction->id}", [
            'date' => '2026-09-24',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $this->salary->id,
            'amount' => 8000,
        ])->assertOk();

        $row = $this->getJson('/api/transactions')->assertOk()->json('0');

        $this->assertArrayNotHasKey('before_data', $row);
        $this->assertArrayNotHasKey('performed_by_user_name', $row);
        $this->assertEqualsWithDelta(8000.0, (float) $row['amount'], 0.001);
    }
}
