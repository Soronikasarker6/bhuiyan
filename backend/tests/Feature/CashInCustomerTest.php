<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Category;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\Transaction;
use App\Models\User;
use App\Services\CustomerLedgerService;
use App\Services\LedgerService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A Cash In recorded against a customer is one event with two ledger
 * consequences: the cash account goes up and the customer's due goes down. It
 * must therefore write exactly one receivables row and exactly one cash row,
 * linked — never two unrelated receipts, and never a cash row on its own.
 *
 * Attaching a customer stays optional: a general Cash In keeps behaving exactly
 * as it did before.
 */
class CashInCustomerTest extends TestCase
{
    use RefreshDatabase;

    private Account $cash;

    private Category $customerPayment;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        $this->cash = Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        $this->customerPayment = Category::create(['name' => 'Customer Payment', 'direction' => 'in']);

        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin, ['*']);
    }

    /** A customer who owes 75,000 — one sale-side debit, exactly as the brief's example starts. */
    private function customerOwing(float $amount): Customer
    {
        $customer = Customer::factory()->create(['name' => 'ABC Trading']);
        CustomerTransaction::create([
            'customer_id' => $customer->id,
            'date' => '2026-09-09',
            'type' => 'sale',
            'reference' => 'INV-2026-001',
            'description' => 'Sale INV-2026-001',
            'debit' => $amount,
            'credit' => 0,
        ]);

        return $customer;
    }

    private function totals(Customer $customer): array
    {
        return app(CustomerLedgerService::class)->totals($customer->id);
    }

    /** 75,000 due, 20,000 paid in, 55,000 left — and the cash account is 20,000 up. */
    public function test_cash_in_against_a_customer_reduces_their_due_and_raises_cash(): void
    {
        $customer = $this->customerOwing(75_000);

        $this->postJson('/api/transactions', [
            'date' => '2026-09-10',
            'account_id' => $this->cash->id,
            'direction' => 'in',
            'category_id' => $this->customerPayment->id,
            'amount' => 20_000,
            'customer_id' => $customer->id,
        ])->assertCreated();

        $this->assertEqualsWithDelta(55_000.0, $this->totals($customer)['total_due'], 0.001);
        $this->assertEqualsWithDelta(
            20_000.0,
            app(LedgerService::class)->accountBalances()->firstWhere('account_id', $this->cash->id)['balance'],
            0.001,
        );
    }

    /** One payment, one receivables row, one cash row — the pair pointing at each other. */
    public function test_cash_in_against_a_customer_writes_no_duplicate_rows(): void
    {
        $customer = $this->customerOwing(75_000);

        $this->postJson('/api/transactions', [
            'date' => '2026-09-10',
            'account_id' => $this->cash->id,
            'direction' => 'in',
            'category_id' => $this->customerPayment->id,
            'amount' => 20_000,
            'customer_id' => $customer->id,
        ])->assertCreated();

        $payments = CustomerTransaction::where('customer_id', $customer->id)->where('type', 'payment')->get();
        $this->assertCount(1, $payments);

        $cashRows = Transaction::all();
        $this->assertCount(1, $cashRows);
        $this->assertSame($payments->first()->id, $cashRows->first()->customer_transaction_id);
        $this->assertSame($customer->id, $cashRows->first()->customer_id);
        $this->assertSame($this->cash->id, $payments->first()->linked_account_id);
    }

    /** Deleting the receipt has to put the due back — otherwise the customer is credited for money nothing records. */
    public function test_deleting_the_cash_row_removes_the_customer_credit_too(): void
    {
        $customer = $this->customerOwing(75_000);

        $this->postJson('/api/transactions', [
            'date' => '2026-09-10',
            'account_id' => $this->cash->id,
            'direction' => 'in',
            'category_id' => $this->customerPayment->id,
            'amount' => 20_000,
            'customer_id' => $customer->id,
        ])->assertCreated();

        $cashRow = Transaction::firstOrFail();
        $this->deleteJson("/api/transactions/{$cashRow->id}")->assertNoContent();

        $this->assertEqualsWithDelta(75_000.0, $this->totals($customer)['total_due'], 0.001);
        $this->assertSame(0, CustomerTransaction::where('type', 'payment')->count());
        $this->assertSame(0, Transaction::count());
    }

    /** The mirror case: removing the receivables row takes its cash row with it. */
    public function test_deleting_the_customer_payment_removes_the_cash_row_too(): void
    {
        $customer = $this->customerOwing(75_000);

        app(CustomerLedgerService::class)->recordPayment([
            'customer_id' => $customer->id,
            'date' => '2026-09-10',
            'amount' => 20_000,
            'account_id' => $this->cash->id,
        ]);

        CustomerTransaction::where('type', 'payment')->firstOrFail()->delete();

        $this->assertSame(0, Transaction::count());
        $this->assertEqualsWithDelta(75_000.0, $this->totals($customer)['total_due'], 0.001);
    }

    /** No customer chosen — still a plain, standalone cash receipt, touching no receivables ledger. */
    public function test_general_cash_in_without_a_customer_is_unchanged(): void
    {
        $this->postJson('/api/transactions', [
            'date' => '2026-09-10',
            'details' => 'Scrap sale',
            'account_id' => $this->cash->id,
            'direction' => 'in',
            'category_id' => $this->customerPayment->id,
            'amount' => 5_000,
        ])->assertCreated();

        $row = Transaction::firstOrFail();
        $this->assertNull($row->customer_id);
        $this->assertNull($row->customer_transaction_id);
        $this->assertSame(0, CustomerTransaction::count());
    }

    public function test_a_customer_cannot_be_attached_to_money_going_out(): void
    {
        $customer = $this->customerOwing(75_000);
        $expense = Category::create(['name' => 'Office Cost', 'direction' => 'out']);

        $this->postJson('/api/transactions', [
            'date' => '2026-09-10',
            'account_id' => $this->cash->id,
            'direction' => 'out',
            'category_id' => $expense->id,
            'amount' => 1_000,
            'customer_id' => $customer->id,
        ])->assertStatus(422);

        $this->assertSame(0, Transaction::count());
    }

    /** Paying more than is owed is allowed and becomes advance, as the existing Cash In screen already does. */
    public function test_overpayment_becomes_advance_rather_than_being_refused(): void
    {
        $customer = $this->customerOwing(75_000);

        $this->postJson('/api/transactions', [
            'date' => '2026-09-10',
            'account_id' => $this->cash->id,
            'direction' => 'in',
            'category_id' => $this->customerPayment->id,
            'amount' => 100_000,
            'customer_id' => $customer->id,
        ])->assertCreated();

        $totals = $this->totals($customer);
        $this->assertEqualsWithDelta(0.0, $totals['total_due'], 0.001);
        $this->assertEqualsWithDelta(25_000.0, $totals['available_advance'], 0.001);
    }

    /** The payment shows up in the customer's own ledger without anything else being recorded. */
    public function test_the_payment_appears_in_the_customer_ledger(): void
    {
        $customer = $this->customerOwing(100_900);

        $this->postJson('/api/transactions', [
            'date' => '2026-09-10',
            'account_id' => $this->cash->id,
            'direction' => 'in',
            'category_id' => $this->customerPayment->id,
            'amount' => 40_000,
            'customer_id' => $customer->id,
        ])->assertCreated();

        $ledger = $this->getJson("/api/customers/{$customer->id}/ledger")->assertOk()->json();

        $this->assertCount(2, $ledger['rows']);
        // Newest first: the payment, then the sale it was collected against.
        $this->assertSame('payment', $ledger['rows'][0]['type']);
        $this->assertEqualsWithDelta(40_000.0, $ledger['rows'][0]['credit'], 0.001);
        $this->assertEqualsWithDelta(60_900.0, $ledger['rows'][0]['balance'], 0.001);
        $this->assertEqualsWithDelta(60_900.0, $ledger['totals']['total_due'], 0.001);
    }
}
