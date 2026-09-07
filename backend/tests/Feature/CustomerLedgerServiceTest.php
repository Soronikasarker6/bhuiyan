<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Services\CustomerLedgerService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CustomerLedgerServiceTest extends TestCase
{
    use RefreshDatabase;

    private CustomerLedgerService $ledger;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ledger = app(CustomerLedgerService::class);
    }

    public function test_balance_is_running_debit_minus_credit(): void
    {
        $customer = Customer::factory()->create();

        CustomerTransaction::create([
            'customer_id' => $customer->id, 'date' => '2026-01-01', 'type' => 'sale',
            'reference' => 'INV-1', 'debit' => 50000, 'credit' => 0,
        ]);
        CustomerTransaction::create([
            'customer_id' => $customer->id, 'date' => '2026-01-05', 'type' => 'payment',
            'reference' => 'PAY-1', 'debit' => 0, 'credit' => 20000,
        ]);

        $rows = $this->ledger->ledgerRows($customer->id);
        // Newest first: payment row shows balance 30,000, sale row (older) shows 50,000.
        $this->assertEqualsWithDelta(30000.0, $rows->first()['balance'], 0.01);
        $this->assertEqualsWithDelta(50000.0, $rows->last()['balance'], 0.01);

        $totals = $this->ledger->totals($customer->id);
        $this->assertEqualsWithDelta(30000.0, $totals['total_due'], 0.01);
        $this->assertEqualsWithDelta(0.0, $totals['available_advance'], 0.01);
    }

    public function test_overpayment_becomes_advance_with_no_cap(): void
    {
        $customer = Customer::factory()->create();

        CustomerTransaction::create([
            'customer_id' => $customer->id, 'date' => '2026-01-01', 'type' => 'sale',
            'reference' => 'INV-1', 'debit' => 10000, 'credit' => 0,
        ]);

        $this->ledger->recordPayment(['customer_id' => $customer->id, 'date' => '2026-01-02', 'amount' => 15000]);

        $totals = $this->ledger->totals($customer->id);
        $this->assertEqualsWithDelta(0.0, $totals['total_due'], 0.01);
        $this->assertEqualsWithDelta(5000.0, $totals['available_advance'], 0.01);
    }

    public function test_reference_numbers_are_sequential_by_scanning_existing_rows(): void
    {
        $customer = Customer::factory()->create();

        $first = $this->ledger->recordPayment(['customer_id' => $customer->id, 'date' => '2026-01-01', 'amount' => 100]);
        $second = $this->ledger->recordPayment(['customer_id' => $customer->id, 'date' => '2026-01-02', 'amount' => 100]);

        $this->assertSame('PAY-001', $first->reference);
        $this->assertSame('PAY-002', $second->reference);
    }
}
