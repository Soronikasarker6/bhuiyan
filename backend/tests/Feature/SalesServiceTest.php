<?php

namespace Tests\Feature;

use App\Exceptions\InsufficientStockException;
use App\Models\Account;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\Transaction;
use App\Services\CustomerLedgerService;
use App\Services\InventoryService;
use App\Services\SalesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SalesServiceTest extends TestCase
{
    use RefreshDatabase;

    private SalesService $sales;
    private CustomerLedgerService $ledger;
    private InventoryService $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        $this->sales = app(SalesService::class);
        $this->ledger = app(CustomerLedgerService::class);
        $this->inventory = app(InventoryService::class);
    }

    private function stockedProduct(int $bags = 1000): array
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        ProductionEntry::create(['date' => '2026-01-01', 'product_id' => $product->id, 'mesh_id' => $mesh->id, 'bags' => $bags]);

        return [$product, $mesh];
    }

    public function test_sale_due_then_payment_clears_it(): void
    {
        [$product, $mesh] = $this->stockedProduct();
        $customer = Customer::factory()->create();

        // 100,000 total: 500 bags * 50kg / 1000 = 25 ton * 4000/ton = 100,000
        $sale = $this->sales->createSale([
            'date' => '2026-02-01', 'customer_id' => $customer->id, 'paid_at_sale' => 60000,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 500, 'rate_per_ton' => 4000]],
        ]);

        $totals = $this->ledger->totals($customer->id);
        $this->assertEqualsWithDelta(100000.0, $totals['total_sales'], 0.01);
        $this->assertEqualsWithDelta(40000.0, $totals['total_due'], 0.01);

        $this->ledger->recordPayment(['customer_id' => $customer->id, 'date' => '2026-02-10', 'amount' => 20000]);

        $totals = $this->ledger->totals($customer->id);
        $this->assertEqualsWithDelta(20000.0, $totals['total_due'], 0.01);
    }

    public function test_actual_weight_overrides_billing_but_not_bag_based_stock_deduction(): void
    {
        [$product, $mesh] = $this->stockedProduct();
        $customer = Customer::factory()->create();

        $sale = $this->sales->createSale([
            'date' => '2026-02-01', 'customer_id' => $customer->id,
            'items' => [[
                'product_id' => $product->id, 'mesh_size_id' => $mesh->id,
                'bags' => 454, 'rate_per_ton' => 5000, 'actual_weight_ton' => 20.18,
            ]],
        ]);

        $item = $sale->items->first();
        $this->assertSame(454, $item->bags);
        $this->assertEqualsWithDelta(20.18, $item->billableWeightTon(), 0.0001);
        $this->assertEqualsWithDelta(100900.0, $item->amount(), 0.01);

        $this->assertSame(1000 - 454, $this->inventory->availableBags($product->id, $mesh->id));
    }

    public function test_advance_adjustment_fully_clears_a_sale(): void
    {
        [$product, $mesh] = $this->stockedProduct();
        $customer = Customer::factory()->create();

        $sale = $this->sales->createSale([
            'date' => '2026-02-01', 'customer_id' => $customer->id,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 350, 'rate_per_ton' => 2000]],
        ]);
        // 350 bags * 50kg / 1000 = 17.5 ton * 2000 = 35,000
        CustomerTransaction::create([
            'customer_id' => $customer->id, 'date' => '2026-02-02', 'type' => 'advance_adjustment',
            'reference' => 'ADJ-001', 'description' => 'Applied from advance', 'debit' => 0, 'credit' => 35000,
            'reference_sale_id' => $sale->id,
        ]);

        $totals = $this->ledger->totals($customer->id);
        $this->assertEqualsWithDelta(0.0, $totals['total_due'], 0.01);
    }

    public function test_sale_cannot_exceed_available_bags(): void
    {
        [$product, $mesh] = $this->stockedProduct(100);
        $customer = Customer::factory()->create();

        $this->expectException(InsufficientStockException::class);
        $this->sales->createSale([
            'date' => '2026-02-01', 'customer_id' => $customer->id,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 150, 'rate_per_ton' => 2000]],
        ]);
    }

    public function test_deleting_a_sale_cascades_its_ledger_rows(): void
    {
        [$product, $mesh] = $this->stockedProduct();
        $customer = Customer::factory()->create();

        $sale = $this->sales->createSale([
            'date' => '2026-02-01', 'customer_id' => $customer->id, 'paid_at_sale' => 10000,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 100, 'rate_per_ton' => 2000]],
        ]);

        $this->sales->deleteSale($sale->id);

        $this->assertSame(0, CustomerTransaction::where('reference_sale_id', $sale->id)->count());
        $this->assertSame(1000, $this->inventory->availableBags($product->id, $mesh->id));
    }

    public function test_paid_at_sale_posts_to_cash_and_bank_ledger_via_the_system_account(): void
    {
        $cash = Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        [$product, $mesh] = $this->stockedProduct();
        $customer = Customer::factory()->create();

        // 454 bags x 45kg configured, but billed on the weighbridge's 20.18 ton @ 5000/ton = 100,900.
        $mesh->update(['bag_kg' => 45]);
        $sale = $this->sales->createSale([
            'date' => '2026-02-01', 'customer_id' => $customer->id, 'paid_at_sale' => 40000,
            'items' => [[
                'product_id' => $product->id, 'mesh_size_id' => $mesh->id,
                'bags' => 454, 'rate_per_ton' => 5000, 'actual_weight_ton' => 20.18,
            ]],
        ]);

        // Exactly one customer-ledger payment row — no duplicate.
        $this->assertSame(
            1,
            CustomerTransaction::where('reference_sale_id', $sale->id)->where('type', 'payment')->count(),
        );
        $totals = $this->ledger->totals($customer->id);
        $this->assertEqualsWithDelta(100900.0, $totals['total_sales'], 0.01);
        $this->assertEqualsWithDelta(60900.0, $totals['total_due'], 0.01);

        // Exactly one linked Cash & Bank ledger row — no duplicate — landing in the system Cash account.
        $cashRows = Transaction::where('reference_sale_id', $sale->id)->get();
        $this->assertCount(1, $cashRows);
        $this->assertSame($cash->id, $cashRows->first()->account_id);
        $this->assertSame('in', $cashRows->first()->direction);
        $this->assertEqualsWithDelta(40000.0, $cashRows->first()->amount, 0.01);
        $this->assertSame('Payment at Sale', $cashRows->first()->category_name);
    }

    public function test_paid_at_sale_respects_an_explicitly_chosen_account(): void
    {
        Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        $bank = Account::create(['name' => 'UCB', 'kind' => 'bank', 'system' => false]);
        [$product, $mesh] = $this->stockedProduct();
        $customer = Customer::factory()->create();

        $sale = $this->sales->createSale([
            'date' => '2026-02-01', 'customer_id' => $customer->id,
            'paid_at_sale' => 15000, 'account_id' => $bank->id,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 200, 'rate_per_ton' => 2000]],
        ]);

        $row = Transaction::where('reference_sale_id', $sale->id)->sole();
        $this->assertSame($bank->id, $row->account_id);
    }

    public function test_paid_at_sale_with_no_account_configured_still_records_the_customer_payment(): void
    {
        // No Account at all — the ledger row is simply skipped, nothing throws.
        [$product, $mesh] = $this->stockedProduct();
        $customer = Customer::factory()->create();

        $sale = $this->sales->createSale([
            'date' => '2026-02-01', 'customer_id' => $customer->id, 'paid_at_sale' => 5000,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 100, 'rate_per_ton' => 1000]],
        ]);

        $this->assertSame(0, Transaction::count());
        $this->assertEqualsWithDelta(5000.0, $this->ledger->totals($customer->id)['total_paid'], 0.01);
    }

    public function test_deleting_a_sale_removes_its_linked_cash_ledger_row_too(): void
    {
        Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        [$product, $mesh] = $this->stockedProduct();
        $customer = Customer::factory()->create();

        $sale = $this->sales->createSale([
            'date' => '2026-02-01', 'customer_id' => $customer->id, 'paid_at_sale' => 10000,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 100, 'rate_per_ton' => 2000]],
        ]);
        $this->assertSame(1, Transaction::where('reference_sale_id', $sale->id)->count());

        $this->sales->deleteSale($sale->id);

        $this->assertSame(0, Transaction::where('reference_sale_id', $sale->id)->count());
    }

    public function test_next_invoice_no_is_sequential_per_year(): void
    {
        [$product, $mesh] = $this->stockedProduct();
        $customer = Customer::factory()->create();

        $sale1 = $this->sales->createSale([
            'date' => '2026-01-05', 'customer_id' => $customer->id,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 10, 'rate_per_ton' => 1000]],
        ]);
        $sale2 = $this->sales->createSale([
            'date' => '2026-01-06', 'customer_id' => $customer->id,
            'items' => [['product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 10, 'rate_per_ton' => 1000]],
        ]);

        $this->assertSame('INV-2026-001', $sale1->invoice_no);
        $this->assertSame('INV-2026-002', $sale2->invoice_no);
        $this->assertSame('INV-2027-001', $this->sales->nextInvoiceNo(2027));
    }
}
