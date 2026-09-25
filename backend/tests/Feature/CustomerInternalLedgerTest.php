<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\CustomerInternalLedgerEntry;
use App\Models\CustomerTransaction;
use App\Models\Transaction;
use App\Models\User;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use App\Support\Permissions;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The owner's private bookkeeping ledger.
 *
 * Two things these guard above all: that the arithmetic is right (the running
 * balance carries forward, including across a date filter), and that the
 * ledger is genuinely sealed off — Admin-only to read or write, and unable to
 * move a customer's real due, the cash ledger or anything else operational.
 */
class CustomerInternalLedgerTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = '/api/customer-internal-ledger';

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        $this->customer = Customer::factory()->create(['name' => 'ABC Trading']);
    }

    private function actAs(string $role, string $name = 'Owner'): User
    {
        $user = User::factory()->create(['name' => $name]);
        $user->assignRole($role);
        Sanctum::actingAs($user, ['*']);

        return $user;
    }

    private function entry(array $overrides = []): int
    {
        return $this->postJson(self::BASE, array_merge([
            'customer_id' => $this->customer->id,
            'date' => '2026-09-05',
            'details' => 'Goods supplied',
            'debit' => 20_000,
        ], $overrides))->assertCreated()->json('id');
    }

    private function summary(array $query = []): array
    {
        return $this->getJson(self::BASE.'?'.http_build_query(array_merge(
            ['customer_id' => $this->customer->id],
            $query,
        )))->assertOk()->json('summary');
    }

    // --------------------------------------------------------- the arithmetic

    /**
     * The brief's own worked example (§24), start to finish.
     *
     * Opening ৳50,000, then Debit ৳20,000, Credit ৳10,000, Debit ৳30,000 →
     * closing ৳90,000. Edit the first to ৳25,000 → ৳95,000. Delete the credit
     * → ৳1,05,000.
     */
    public function test_the_running_balance_follows_the_brief_worked_example(): void
    {
        $this->actAs('Admin');

        $this->putJson(self::BASE."/openings/{$this->customer->id}", [
            'opening_balance' => 50_000, 'as_of' => '2026-09-01',
        ])->assertOk();

        $first = $this->entry(['date' => '2026-09-05', 'debit' => 20_000]);
        $second = $this->entry(['date' => '2026-09-10', 'details' => 'Payment', 'debit' => null, 'credit' => 10_000]);
        $this->entry(['date' => '2026-09-20', 'details' => 'Goods supplied', 'debit' => 30_000]);

        $summary = $this->summary();
        $this->assertEqualsWithDelta(50_000, $summary['opening_balance'], 0.001);
        $this->assertEqualsWithDelta(50_000, $summary['total_debit'], 0.001);
        $this->assertEqualsWithDelta(10_000, $summary['total_credit'], 0.001);
        $this->assertEqualsWithDelta(90_000, $summary['closing_balance'], 0.001);

        // Edit: 20,000 -> 25,000.
        $this->putJson(self::BASE."/entries/{$first}", [
            'customer_id' => $this->customer->id,
            'date' => '2026-09-05',
            'details' => 'Goods supplied',
            'debit' => 25_000,
        ])->assertOk();

        $this->assertEqualsWithDelta(95_000, $this->summary()['closing_balance'], 0.001);

        // Delete the ৳10,000 credit.
        $this->deleteJson(self::BASE."/entries/{$second}")->assertNoContent();

        $this->assertEqualsWithDelta(105_000, $this->summary()['closing_balance'], 0.001);
        $this->assertEqualsWithDelta(0, $this->summary()['total_credit'], 0.001);
    }

    /**
     * §12 — the one thing a filtered ledger must not do. Filtering 10–20 Sep
     * must carry the balance forward from before the 10th, not restart at zero.
     */
    public function test_a_date_filter_carries_the_balance_forward_instead_of_restarting_at_zero(): void
    {
        $this->actAs('Admin');

        $this->putJson(self::BASE."/openings/{$this->customer->id}", ['opening_balance' => 50_000])->assertOk();
        $this->entry(['date' => '2026-09-05', 'debit' => 20_000]);
        $this->entry(['date' => '2026-09-10', 'debit' => null, 'credit' => 10_000]);
        $this->entry(['date' => '2026-09-20', 'debit' => 30_000]);

        $summary = $this->summary(['from' => '2026-09-10', 'to' => '2026-09-20']);

        // 50,000 opening + 20,000 on the 5th = 70,000 carried into the window.
        $this->assertEqualsWithDelta(70_000, $summary['opening_balance'], 0.001);
        $this->assertEqualsWithDelta(30_000, $summary['total_debit'], 0.001);
        $this->assertEqualsWithDelta(10_000, $summary['total_credit'], 0.001);
        $this->assertEqualsWithDelta(90_000, $summary['closing_balance'], 0.001);
    }

    /** Each row carries the book's true balance after it — never one restarted inside the window. */
    public function test_rows_inside_a_filtered_window_keep_their_true_running_balance(): void
    {
        $this->actAs('Admin');

        $this->putJson(self::BASE."/openings/{$this->customer->id}", ['opening_balance' => 50_000])->assertOk();
        $this->entry(['date' => '2026-09-05', 'debit' => 20_000]);
        $this->entry(['date' => '2026-09-10', 'debit' => null, 'credit' => 10_000]);
        $this->entry(['date' => '2026-09-20', 'debit' => 30_000]);

        $rows = $this->getJson(self::BASE.'?'.http_build_query([
            'customer_id' => $this->customer->id, 'from' => '2026-09-10', 'to' => '2026-09-20',
        ]))->assertOk()->json('rows');

        // Newest first, like every other register here.
        $this->assertCount(2, $rows);
        $this->assertEqualsWithDelta(90_000, $rows[0]['balance'], 0.001);
        $this->assertEqualsWithDelta(60_000, $rows[1]['balance'], 0.001);
    }

    /**
     * A Type or Search filter narrows what is listed, not what the period
     * contains — a closing balance that moved because someone typed in a
     * search box would not be a closing balance.
     */
    public function test_type_and_search_filters_narrow_the_rows_without_moving_the_period_totals(): void
    {
        $this->actAs('Admin');

        $this->entry(['date' => '2026-09-05', 'details' => 'Goods supplied', 'debit' => 20_000]);
        $this->entry(['date' => '2026-09-10', 'details' => 'Payment received', 'debit' => null, 'credit' => 10_000]);

        $response = $this->getJson(self::BASE.'?'.http_build_query([
            'customer_id' => $this->customer->id, 'type' => 'debit',
        ]))->assertOk();

        $this->assertCount(1, $response->json('rows'));
        $this->assertTrue($response->json('narrowed'));
        $this->assertEqualsWithDelta(20_000, $response->json('summary.total_debit'), 0.001);
        $this->assertEqualsWithDelta(10_000, $response->json('summary.total_credit'), 0.001);
        $this->assertEqualsWithDelta(10_000, $response->json('summary.closing_balance'), 0.001);

        $search = $this->getJson(self::BASE.'?'.http_build_query([
            'customer_id' => $this->customer->id, 'search' => 'Payment',
        ]))->assertOk();
        $this->assertCount(1, $search->json('rows'));
        $this->assertSame('Payment received', $search->json('rows.0.details'));
    }

    public function test_an_all_parties_view_combines_every_book(): void
    {
        $this->actAs('Admin');
        $other = Customer::factory()->create(['name' => 'Dipali Madam']);

        $this->putJson(self::BASE."/openings/{$this->customer->id}", ['opening_balance' => 50_000])->assertOk();
        $this->putJson(self::BASE."/openings/{$other->id}", ['opening_balance' => 10_000])->assertOk();
        $this->entry(['debit' => 20_000]);
        $this->entry(['customer_id' => $other->id, 'debit' => null, 'credit' => 5_000]);

        $response = $this->getJson(self::BASE)->assertOk();

        $this->assertCount(2, $response->json('rows'));
        $this->assertEqualsWithDelta(60_000, $response->json('summary.opening_balance'), 0.001);
        $this->assertEqualsWithDelta(75_000, $response->json('summary.closing_balance'), 0.001);
    }

    // ------------------------------------------------------------- validation

    public function test_an_entry_cannot_carry_both_a_debit_and_a_credit(): void
    {
        $this->actAs('Admin');

        $this->postJson(self::BASE, [
            'customer_id' => $this->customer->id,
            'date' => '2026-09-05',
            'details' => 'Both sides',
            'debit' => 1_000,
            'credit' => 1_000,
        ])->assertStatus(422);

        $this->assertSame(0, CustomerInternalLedgerEntry::count());
    }

    public function test_an_entry_cannot_be_blank_on_both_sides(): void
    {
        $this->actAs('Admin');

        $this->postJson(self::BASE, [
            'customer_id' => $this->customer->id,
            'date' => '2026-09-05',
            'details' => 'Nothing at all',
        ])->assertStatus(422);

        $this->postJson(self::BASE, [
            'customer_id' => $this->customer->id,
            'date' => '2026-09-05',
            'details' => 'Zero',
            'debit' => 0,
            'credit' => 0,
        ])->assertStatus(422);

        $this->assertSame(0, CustomerInternalLedgerEntry::count());
    }

    public function test_an_entry_must_name_a_real_customer(): void
    {
        $this->actAs('Admin');

        $this->postJson(self::BASE, [
            'customer_id' => 999_999,
            'date' => '2026-09-05',
            'details' => 'Ghost party',
            'debit' => 1_000,
        ])->assertStatus(422);
    }

    // -------------------------------------------------------------- isolation

    /**
     * §16 — the whole reason this ledger is separate. Writing in the owner's
     * private book must not move the customer's real due, the cash ledger, or
     * anything else operational.
     */
    public function test_the_private_ledger_never_touches_the_operational_one(): void
    {
        $this->actAs('Admin');

        $this->putJson(self::BASE."/openings/{$this->customer->id}", ['opening_balance' => 50_000])->assertOk();
        $id = $this->entry(['debit' => 20_000]);
        $this->entry(['debit' => null, 'credit' => 5_000]);
        $this->putJson(self::BASE."/entries/{$id}", [
            'customer_id' => $this->customer->id,
            'date' => '2026-09-05',
            'details' => 'Goods supplied',
            'debit' => 25_000,
        ])->assertOk();

        // Nothing written anywhere else.
        $this->assertSame(0, CustomerTransaction::count());
        $this->assertSame(0, Transaction::count());

        // And the customer's real position is untouched.
        $totals = $this->getJson("/api/customers/{$this->customer->id}")->assertOk()->json();
        $this->assertEqualsWithDelta(0.0, $totals['balance'], 0.001);
        $this->assertEqualsWithDelta(0.0, $totals['total_due'], 0.001);

        // The private book, meanwhile, says what it should.
        $this->assertEqualsWithDelta(70_000, $this->summary()['closing_balance'], 0.001);
    }

    /** The customer's own `opening_balance` belongs to the operational ledger and is left alone. */
    public function test_setting_a_private_opening_balance_does_not_change_the_customer_record(): void
    {
        $this->actAs('Admin');

        $this->putJson(self::BASE."/openings/{$this->customer->id}", ['opening_balance' => 50_000])->assertOk();

        $this->assertEqualsWithDelta(
            0.0,
            (float) $this->customer->fresh()->opening_balance,
            0.001,
            'the private ledger must not write to customers.opening_balance',
        );
        $this->assertSame(0, CustomerTransaction::count());
    }

    // ------------------------------------------------------------------ audit

    /** §15 — CRUD flows through the one central audit trail, not a second one. */
    public function test_create_update_and_delete_are_recorded_in_the_central_audit_trail(): void
    {
        $admin = $this->actAs('Admin', 'Office Admin');

        $id = $this->entry(['debit' => 50_000, 'details' => 'Goods supplied', 'reference' => 'INV-102']);

        $created = AuditLog::forEntity(AuditEntity::CUSTOMER_INTERNAL_LEDGER, $id)
            ->where('action', AuditAction::CREATE)->firstOrFail();
        $this->assertSame('Customer Internal Ledger', $created->module);
        $this->assertSame('Office Admin', $created->performed_by_user_name);
        $this->assertSame($admin->id, $created->performed_by_user_id);
        $this->assertSame('ABC Trading', $created->after_data['customer']);
        $this->assertEqualsWithDelta(50_000, (float) $created->after_data['debit'], 0.001);

        $this->putJson(self::BASE."/entries/{$id}", [
            'customer_id' => $this->customer->id,
            'date' => '2026-09-05',
            'details' => 'Goods supplied',
            'reference' => 'INV-102',
            'debit' => 55_000,
            'reason' => 'Corrected the invoice total',
        ])->assertOk();

        $updated = AuditLog::forEntity(AuditEntity::CUSTOMER_INTERNAL_LEDGER, $id)
            ->where('action', AuditAction::UPDATE)->firstOrFail();
        $this->assertEqualsWithDelta(50_000, (float) $updated->before_data['debit'], 0.001);
        $this->assertEqualsWithDelta(55_000, (float) $updated->after_data['debit'], 0.001);
        $this->assertSame('Corrected the invoice total', $updated->reason);

        $this->deleteJson(self::BASE."/entries/{$id}", ['reason' => 'Duplicate'])->assertNoContent();

        $deleted = AuditLog::forEntity(AuditEntity::CUSTOMER_INTERNAL_LEDGER, $id)
            ->where('action', AuditAction::DELETE)->firstOrFail();
        $this->assertEqualsWithDelta(55_000, (float) $deleted->before_data['debit'], 0.001);
        $this->assertSame('Duplicate', $deleted->reason);
    }

    public function test_the_opening_balance_is_audited_too(): void
    {
        $this->actAs('Admin');

        $this->putJson(self::BASE."/openings/{$this->customer->id}", ['opening_balance' => 50_000])->assertOk();
        $this->putJson(self::BASE."/openings/{$this->customer->id}", ['opening_balance' => 60_000])->assertOk();

        $logs = AuditLog::where('entity_type', AuditEntity::CUSTOMER_INTERNAL_LEDGER_OPENING)
            ->orderBy('id')->get();

        $this->assertCount(2, $logs);
        $this->assertSame(AuditAction::CREATE, $logs[0]->action);
        $this->assertSame(AuditAction::UPDATE, $logs[1]->action);
        $this->assertEqualsWithDelta(50_000, (float) $logs[1]->before_data['opening_balance'], 0.001);
        $this->assertEqualsWithDelta(60_000, (float) $logs[1]->after_data['opening_balance'], 0.001);
    }

    /** The acting user comes from the session — a payload claiming otherwise is ignored (§5 of the audit brief). */
    public function test_the_audit_actor_cannot_be_spoofed_from_the_payload(): void
    {
        $other = User::factory()->create(['name' => 'Manager B']);
        $admin = $this->actAs('Admin', 'Office Admin');

        $this->postJson(self::BASE, [
            'customer_id' => $this->customer->id,
            'date' => '2026-09-05',
            'details' => 'Goods supplied',
            'debit' => 1_000,
            'performed_by_user_id' => $other->id,
            'performed_by_user_name' => 'Manager B',
        ])->assertCreated();

        $log = AuditLog::where('entity_type', AuditEntity::CUSTOMER_INTERNAL_LEDGER)->firstOrFail();
        $this->assertSame('Office Admin', $log->performed_by_user_name);
        $this->assertSame($admin->id, $log->performed_by_user_id);
    }

    // --------------------------------------------------------------- security

    /** §25 — a Manager is refused every route, with no browser involved. */
    public function test_a_manager_is_refused_every_private_ledger_route(): void
    {
        $this->actAs('Admin');
        $id = $this->entry();

        $this->actAs('Manager', 'Manager B');

        $this->getJson(self::BASE)->assertForbidden();
        $this->postJson(self::BASE, [
            'customer_id' => $this->customer->id, 'date' => '2026-09-05',
            'details' => 'Sneaky', 'debit' => 1_000,
        ])->assertForbidden();
        $this->putJson(self::BASE."/entries/{$id}", [
            'customer_id' => $this->customer->id, 'date' => '2026-09-05',
            'details' => 'Sneaky', 'debit' => 1_000,
        ])->assertForbidden();
        $this->deleteJson(self::BASE."/entries/{$id}")->assertForbidden();
        $this->putJson(self::BASE."/openings/{$this->customer->id}", ['opening_balance' => 1])->assertForbidden();

        // Nothing got through.
        $this->assertSame(1, CustomerInternalLedgerEntry::count());
        $this->assertEqualsWithDelta(20_000, (float) CustomerInternalLedgerEntry::firstOrFail()->debit, 0.001);
    }

    public function test_staff_is_refused_too(): void
    {
        $this->actAs('Staff', 'Yard Clerk');

        $this->getJson(self::BASE)->assertForbidden();
    }

    public function test_an_unauthenticated_caller_never_reaches_the_private_ledger(): void
    {
        $this->getJson(self::BASE)->assertUnauthorized();
        $this->postJson(self::BASE, ['customer_id' => $this->customer->id])->assertUnauthorized();
    }

    /**
     * The seeded roles must not drift. A Manager keeps CUSTOMER_LEDGER_VIEW —
     * they need the operational receivables ledger — but never the private one.
     */
    public function test_only_admin_is_seeded_with_the_private_ledger_permission(): void
    {
        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        $manager = User::factory()->create();
        $manager->assignRole('Manager');
        $staff = User::factory()->create();
        $staff->assignRole('Staff');

        $this->assertTrue($admin->can(Permissions::CUSTOMER_INTERNAL_LEDGER_VIEW));
        $this->assertFalse($manager->can(Permissions::CUSTOMER_INTERNAL_LEDGER_VIEW));
        $this->assertFalse($staff->can(Permissions::CUSTOMER_INTERNAL_LEDGER_VIEW));

        // The operational ledger is untouched by any of this.
        $this->assertTrue($manager->can(Permissions::CUSTOMER_LEDGER_VIEW));
        $this->assertTrue($staff->can(Permissions::CUSTOMER_LEDGER_VIEW));
    }

    /** §28 of the audit brief — two admins editing the same line don't silently overwrite each other. */
    public function test_a_stale_edit_is_refused(): void
    {
        $this->actAs('Admin');
        $id = $this->entry(['debit' => 20_000]);
        $stale = CustomerInternalLedgerEntry::findOrFail($id)->updated_at->toJSON();

        $this->travel(2)->seconds();
        $this->putJson(self::BASE."/entries/{$id}", [
            'customer_id' => $this->customer->id, 'date' => '2026-09-05',
            'details' => 'Goods supplied', 'debit' => 25_000,
        ])->assertOk();

        $this->putJson(self::BASE."/entries/{$id}", [
            'customer_id' => $this->customer->id, 'date' => '2026-09-05',
            'details' => 'Goods supplied', 'debit' => 99_000,
            'expected_updated_at' => $stale,
        ])->assertStatus(409);

        $this->assertEqualsWithDelta(25_000, (float) CustomerInternalLedgerEntry::findOrFail($id)->debit, 0.001);
    }
}
