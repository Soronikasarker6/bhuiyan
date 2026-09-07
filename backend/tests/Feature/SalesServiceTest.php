<?php

namespace Tests\Feature;

use App\Exceptions\InsufficientStockException;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
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
