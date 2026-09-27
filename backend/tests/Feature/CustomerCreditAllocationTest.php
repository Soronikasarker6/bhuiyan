<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\User;
use App\Services\CustomerLedgerService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Credit allocation, and the invoice status that rests on it.
 *
 * Payments here are recorded against the *customer*: only a paid-at-sale
 * amount carries a `reference_sale_id`. Both this side and
 * src/utils/customerLedger.ts used to read an invoice's position from that
 * column alone, which reported every ordinary Cash In as if it had never
 * happened — a customer who had paid in full still showed a page of Due
 * invoices. These are the cases the business stated, checked against the API
 * and the report, not just the service.
 *
 * The mirror of these cases lives in src/test/customerCredit.test.ts; the two
 * implementations have to agree, so the numbers here are deliberately
 * identical.
 */
class CustomerCreditAllocationTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;

    private Product $product;

    private MeshSize $mesh;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        $this->customer = Customer::factory()->create(['name' => 'Rahim Shaheb']);
        $this->product = Product::factory()->create();
        $this->mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        Account::factory()->create(['kind' => 'cash', 'system' => true]);
    }

    private function ledger(): CustomerLedgerService
    {
        return app(CustomerLedgerService::class);
    }

    /** A sale of exactly `$amount`, with its receivables debit — the shape SalesService writes. */
    private function sale(string $date, float $amount, int $bags = 10): Sale
    {
        $sale = Sale::create([
            'invoice_no' => 'INV-'.str_pad((string) (Sale::count() + 1), 4, '0', STR_PAD_LEFT),
            'date' => $date,
            'customer_id' => $this->customer->id,
        ]);

        SaleItem::create([
            'sale_id' => $sale->id,
            'product_id' => $this->product->id,
            'mesh_size_id' => $this->mesh->id,
            'bags' => $bags,
            // bags * 50kg / 1000 = tons; rate makes the line total `$amount`.
            'rate_per_ton' => $amount / (($bags * 50) / 1000),
        ]);

        CustomerTransaction::create([
            'customer_id' => $this->customer->id,
            'date' => $date,
            'type' => 'sale',
            'reference' => $sale->invoice_no,
            'description' => 'Sale',
            'debit' => $amount,
            'credit' => 0,
            'reference_sale_id' => $sale->id,
        ]);

        return $sale;
    }

    /** A plain Cash In — against the account, naming no invoice. The normal case. */
    private function payment(string $date, float $amount): CustomerTransaction
    {
        return CustomerTransaction::create([
            'customer_id' => $this->customer->id,
            'date' => $date,
            'type' => 'payment',
            'reference' => $this->ledger()->nextReference('payment'),
            'description' => 'Cash In',
            'debit' => 0,
            'credit' => $amount,
        ]);
    }

    /** @return array{paid: float, covered_by_advance: float} */
    private function settled(Sale $sale): array
    {
        return $this->ledger()->saleSettlement($this->customer->id, $sale->id);
    }

    private function statusOf(Sale $sale, float $total): string
    {
        $settled = $this->settled($sale);

        return CustomerLedgerService::statusFor($total, min($total, $settled['paid']), $settled['covered_by_advance']);
    }

    // ------------------------------------------------------------ invariant

    public function test_allocating_the_balance_never_changes_it(): void
    {
        $this->sale('2026-09-01', 40_000);
        $this->sale('2026-09-02', 60_000);
        $this->payment('2026-09-03', 75_000);

        $this->assertEqualsWithDelta(
            $this->ledger()->totals($this->customer->id)['balance'],
            $this->ledger()->settlement($this->customer->id)['balance'],
            0.001,
            'allocation decides how money is attributed, never how much there is',
        );
    }

    // ---------------------------------------------------------- the 7 cases

    public function test_1_fully_paid(): void
    {
        $sale = $this->sale('2026-09-01', 100_000);
        $this->payment('2026-09-02', 100_000);

        $this->assertEqualsWithDelta(100_000, $this->settled($sale)['paid'], 0.001);
        $this->assertSame('paid', $this->statusOf($sale, 100_000));
        $this->assertEqualsWithDelta(0, $this->ledger()->totals($this->customer->id)['balance'], 0.001);
    }

    public function test_2_partly_paid_leaves_the_remainder_due(): void
    {
        $sale = $this->sale('2026-09-01', 100_000);
        $this->payment('2026-09-02', 60_000);

        $this->assertEqualsWithDelta(60_000, $this->settled($sale)['paid'], 0.001);
        $this->assertSame('partial', $this->statusOf($sale, 100_000));
        $this->assertEqualsWithDelta(40_000, $this->ledger()->totals($this->customer->id)['balance'], 0.001);
    }

    public function test_3_overpayment_settles_the_invoice_and_carries_an_advance(): void
    {
        $sale = $this->sale('2026-09-01', 100_000);
        $this->payment('2026-09-02', 120_000);

        $totals = $this->ledger()->totals($this->customer->id);

        $this->assertEqualsWithDelta(100_000, $this->settled($sale)['paid'], 0.001);
        $this->assertSame('paid', $this->statusOf($sale, 100_000));
        $this->assertEqualsWithDelta(-20_000, $totals['balance'], 0.001);
        $this->assertEqualsWithDelta(0, $totals['total_due'], 0.001);
        $this->assertEqualsWithDelta(20_000, $totals['available_advance'], 0.001);
    }

    /** The reported bug: an advance already on the account must cover the next sale. */
    public function test_4_an_existing_advance_covers_a_new_sale(): void
    {
        $this->payment('2026-09-01', 50_000);
        $sale = $this->sale('2026-09-02', 30_000);

        $settled = $this->settled($sale);

        $this->assertEqualsWithDelta(30_000, $settled['paid'], 0.001);
        $this->assertEqualsWithDelta(30_000, $settled['covered_by_advance'], 0.001);
        $this->assertSame('advance', $this->statusOf($sale, 30_000));
        $this->assertEqualsWithDelta(-20_000, $this->ledger()->totals($this->customer->id)['balance'], 0.001);
    }

    public function test_5_an_existing_advance_partly_covers_a_new_sale(): void
    {
        $this->payment('2026-09-01', 20_000);
        $sale = $this->sale('2026-09-02', 50_000);

        $this->assertEqualsWithDelta(20_000, $this->settled($sale)['paid'], 0.001);
        $this->assertSame('partial', $this->statusOf($sale, 50_000));
        $this->assertEqualsWithDelta(30_000, $this->ledger()->totals($this->customer->id)['balance'], 0.001);
    }

    public function test_6_editing_a_payment_turns_an_advance_back_into_a_due(): void
    {
        $sale = $this->sale('2026-09-01', 100_000);
        $payment = $this->payment('2026-09-02', 120_000);

        $this->assertEqualsWithDelta(-20_000, $this->ledger()->totals($this->customer->id)['balance'], 0.001);

        $this->ledger()->updatePayment($payment, [
            'date' => '2026-09-02',
            'amount' => 80_000,
        ], 'Corrected the amount');

        $totals = $this->ledger()->totals($this->customer->id);

        $this->assertEqualsWithDelta(80_000, $this->settled($sale)['paid'], 0.001);
        $this->assertSame('partial', $this->statusOf($sale, 100_000));
        $this->assertEqualsWithDelta(20_000, $totals['balance'], 0.001);
        $this->assertEqualsWithDelta(20_000, $totals['total_due'], 0.001);

        // Corrected in place — never a second payment row.
        $this->assertSame(1, CustomerTransaction::where('type', 'payment')->count());
        $this->assertSame($payment->id, CustomerTransaction::where('type', 'payment')->firstOrFail()->id);
    }

    public function test_7_a_date_filtered_ledger_carries_the_balance_forward(): void
    {
        $this->payment('2026-09-01', 20_000);
        $this->sale('2026-09-10', 50_000);
        $this->payment('2026-09-11', 10_000);

        $rows = $this->ledger()->ledgerRows($this->customer->id);
        $before = $rows->filter(fn ($r) => $r['date'] < '2026-09-10');
        $inside = $rows->filter(fn ($r) => $r['date'] >= '2026-09-10');

        $opening = $before->sum(fn ($r) => (float) $r['debit'] - (float) $r['credit']);
        $movement = $inside->sum(fn ($r) => (float) $r['debit'] - (float) $r['credit']);

        $this->assertEqualsWithDelta(-20_000, $opening, 0.001);
        // -20,000 + 50,000 - 10,000 = +20,000 due, never +40,000 from zero.
        $this->assertEqualsWithDelta(20_000, $opening + $movement, 0.001);
        $this->assertEqualsWithDelta(20_000, $this->ledger()->totals($this->customer->id)['balance'], 0.001);
    }

    // -------------------------------------------------------------- ordering

    public function test_credit_settles_the_oldest_invoice_first(): void
    {
        $first = $this->sale('2026-09-01', 40_000);
        $second = $this->sale('2026-09-02', 60_000);
        $this->payment('2026-09-03', 75_000);

        $this->assertEqualsWithDelta(40_000, $this->settled($first)['paid'], 0.001);
        $this->assertEqualsWithDelta(35_000, $this->settled($second)['paid'], 0.001);
    }

    public function test_an_invoice_is_never_reported_as_more_than_paid(): void
    {
        $sale = $this->sale('2026-09-01', 40_000);
        $this->payment('2026-09-02', 100_000);

        $this->assertEqualsWithDelta(40_000, $this->settled($sale)['paid'], 0.001);
    }

    // ------------------------------------------------------- through the API

    /** The screen and the report must both stop saying Due once the account is settled. */
    public function test_the_sales_api_and_the_sales_report_agree_and_no_longer_show_a_false_due(): void
    {
        $this->sale('2026-09-01', 100_000);
        $this->payment('2026-09-02', 120_000);

        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin, ['*']);

        $fromApi = $this->getJson('/api/sales')->assertOk()->json('0');
        $this->assertSame('paid', $fromApi['status']);
        $this->assertEqualsWithDelta(100_000, $fromApi['amount_paid'], 0.001);
        $this->assertEqualsWithDelta(0, $fromApi['amount_due'], 0.001);

        $fromReport = $this->getJson('/api/reports/sales')->assertOk()->json('rows.0');
        $this->assertSame('paid', $fromReport['status']);
        $this->assertEqualsWithDelta(0, $fromReport['due'], 0.001);
    }

    public function test_the_sales_api_reports_a_sale_covered_by_an_existing_advance(): void
    {
        $this->payment('2026-09-01', 50_000);
        $this->sale('2026-09-02', 30_000);

        $admin = User::factory()->create();
        $admin->assignRole('Admin');
        Sanctum::actingAs($admin, ['*']);

        $row = $this->getJson('/api/sales')->assertOk()->json('0');

        $this->assertSame('advance', $row['status']);
        $this->assertEqualsWithDelta(0, $row['amount_due'], 0.001);
        $this->assertEqualsWithDelta(30_000, $row['covered_by_advance'], 0.001);
    }
}
