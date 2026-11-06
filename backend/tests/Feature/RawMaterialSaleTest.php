<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\CustomerTransaction;
use App\Models\InventoryTransaction;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\Sale;
use App\Models\Transaction;
use App\Models\User;
use App\Services\CustomerLedgerService;
use App\Services\InventoryService;
use App\Services\LedgerService;
use App\Services\SalesService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Raw limestone sold straight from the yard — billed and deducted by the
 * weighbridge net, on the same invoice/customer-ledger/cash rails as a
 * finished-product sale, and never mistaken for production.
 */
class RawMaterialSaleTest extends TestCase
{
    use RefreshDatabase;

    private Product $white;

    private Product $red;

    private MeshSize $mesh;

    private Customer $customer;

    private Account $cash;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        $this->cash = Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        $this->white = Product::factory()->create(['name' => 'Vietnam White Limestone']);
        $this->red = Product::factory()->create(['name' => 'Oman Red Limestone']);
        $this->mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->customer = Customer::factory()->create();

        // 175 Ton of white limestone in the yard — the brief's example.
        $this->inventory()->receiveStock([
            'date' => '2026-01-01', 'product_id' => $this->white->id,
            'gross_weight_kg' => 200_000, 'tare_weight_kg' => 25_000,
        ]);
        $this->inventory()->receiveStock([
            'date' => '2026-01-01', 'product_id' => $this->red->id,
            'gross_weight_kg' => 50_000, 'tare_weight_kg' => 0,
        ]);

        $this->actingAsRole('Admin');
    }

    private function inventory(): InventoryService
    {
        return app(InventoryService::class);
    }

    private function actingAsRole(string $role): void
    {
        $user = User::factory()->create();
        $user->assignRole($role);
        Sanctum::actingAs($user, ['*']);
    }

    /** 20 Ton net (20,000 kg, as entered at billing) of white limestone @ 3,000 = 60,000. */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'sale_type' => 'raw_material',
            'date' => '2026-02-01',
            'customer_id' => $this->customer->id,
            'product_id' => $this->white->id,
            'truck_no' => 'DMT-24-5398',
            'net_weight_kg' => 20_000,
            'rate_per_ton' => 3_000,
        ], $overrides);
    }

    private function stock(?Product $product = null): float
    {
        return $this->inventory()->currentRawStock(($product ?? $this->white)->id);
    }

    private function balance(): float
    {
        return app(CustomerLedgerService::class)->totals($this->customer->id)['balance'];
    }

    private function cashBalance(): float
    {
        return (float) app(LedgerService::class)->accountBalances()->firstWhere('account_id', $this->cash->id)['balance'];
    }

    // ------------------------------------------------------------ 1–4 create

    public function test_creates_a_raw_material_sale_billed_on_net_weight(): void
    {
        $response = $this->postJson('/api/sales', $this->payload())->assertCreated();

        $response->assertJsonPath('sale_type', 'raw_material')
            ->assertJsonPath('total_weight_ton', 20)
            ->assertJsonPath('total_amount', 60000)
            ->assertJsonPath('items.0.mesh_size_id', null)
            ->assertJsonPath('items.0.bags', 0)
            ->assertJsonPath('items.0.product_name', 'Vietnam White Limestone');
    }

    // ------------------------------------------------- optional weighbridge

    public function test_sale_with_gross_and_tare_stores_them_but_bills_the_edited_net(): void
    {
        // Gross − tare = 20,500 kg, edited down to 20,000 kg for billing.
        $saleId = $this->postJson('/api/sales', $this->payload([
            'gross_weight_kg' => 32_500, 'tare_weight_kg' => 12_000, 'net_weight_kg' => 20_000,
        ]))
            ->assertCreated()
            ->assertJsonPath('gross_weight_kg', 32500)
            ->assertJsonPath('tare_weight_kg', 12000)
            ->assertJsonPath('total_weight_ton', 20)
            ->assertJsonPath('total_amount', 60000)
            ->json('id');

        $this->assertEqualsWithDelta(155, $this->stock(), 0.0001, 'stock comes off the edited net, not gross − tare');
        $this->assertEqualsWithDelta(60_000, $this->balance(), 0.001, 'ledger uses the edited net');
        $this->assertEqualsWithDelta(20, Sale::find($saleId)->items()->sole()->actual_weight_ton, 0.00001);

        $this->getJson('/api/reports/sales?sale_type=raw_material')->assertOk()
            ->assertJsonPath('rows.0.total', 60000);
    }

    public function test_sale_with_only_net_weight_leaves_gross_and_tare_empty(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => null, 'tare_weight_kg' => '']))
            ->assertCreated()
            ->assertJsonPath('total_amount', 60000)
            ->json('id');

        $sale = Sale::find($saleId);
        $this->assertNull($sale->gross_weight_kg);
        $this->assertNull($sale->tare_weight_kg);
        $this->assertEqualsWithDelta(155, $this->stock(), 0.0001);
    }

    public function test_editing_can_add_and_clear_weighbridge_readings(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload())->json('id');

        $this->putJson("/api/sales/{$saleId}", $this->payload(['gross_weight_kg' => 30_000, 'tare_weight_kg' => 10_000]))
            ->assertOk()->assertJsonPath('gross_weight_kg', 30000)->assertJsonPath('total_amount', 60000);

        $this->putJson("/api/sales/{$saleId}", $this->payload())->assertOk()->assertJsonPath('gross_weight_kg', null);
    }

    public function test_rejects_invalid_weighbridge_readings(): void
    {
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => -1, 'tare_weight_kg' => 0]))
            ->assertUnprocessable()->assertJsonValidationErrors('gross_weight_kg');
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => 30_000, 'tare_weight_kg' => -5]))
            ->assertUnprocessable()->assertJsonValidationErrors('tare_weight_kg');
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => 10_000, 'tare_weight_kg' => 10_000]))
            ->assertUnprocessable()->assertJsonValidationErrors('gross_weight_kg');
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => 30_000]))
            ->assertUnprocessable()->assertJsonValidationErrors('tare_weight_kg');
        $this->postJson('/api/sales', $this->payload(['tare_weight_kg' => 10_000]))
            ->assertUnprocessable()->assertJsonValidationErrors('gross_weight_kg');
        $this->postJson('/api/sales', $this->payload(['gross_weight_kg' => 30_000, 'tare_weight_kg' => 10_000, 'net_weight_kg' => 0]))
            ->assertUnprocessable()->assertJsonValidationErrors('net_weight_kg');

        $this->assertSame(0, Sale::count());
    }

    public function test_finished_product_sales_never_store_gross_or_tare(): void
    {
        ProductionEntry::create(['date' => '2026-01-02', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 300]);

        $saleId = $this->postJson('/api/sales', [
            'sale_type' => 'finished_product', 'date' => '2026-02-01', 'customer_id' => $this->customer->id,
            'gross_weight_kg' => 30_000, 'tare_weight_kg' => 10_000,
            'items' => [['product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 100, 'rate_per_ton' => 2_000]],
        ])->assertCreated()->json('id');

        $this->assertNull(Sale::find($saleId)->gross_weight_kg);
        $this->assertNull(Sale::find($saleId)->tare_weight_kg);
    }

    public function test_an_older_sale_without_readings_still_edits_by_net_weight(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload())->json('id');
        Sale::whereKey($saleId)->update(['gross_weight_kg' => null, 'tare_weight_kg' => null]);

        $this->putJson("/api/sales/{$saleId}", $this->payload(['net_weight_kg' => 25_000]))
            ->assertOk()->assertJsonPath('gross_weight_kg', null)->assertJsonPath('total_amount', 75000);
        $this->assertEqualsWithDelta(150, $this->stock(), 0.0001);
    }

    public function test_ton_keeps_decimal_precision(): void
    {
        // 5,137.35 kg = 5.13735 Ton @ 2,000 = 10,274.70
        $response = $this->postJson('/api/sales', $this->payload(['net_weight_kg' => 5_137.35, 'rate_per_ton' => 2_000]))
            ->assertCreated()
            ->assertJsonPath('items.0.actual_weight_ton', 5.13735)
            ->assertJsonPath('total_weight_ton', 5.13735);

        // Amount is ton × rate, unrounded, exactly as for finished-product sales.
        $this->assertEqualsWithDelta(10_274.70, $response->json('total_amount'), 0.000001);
        // 175 − 5.13735 — the stock keeps every fractional ton, never rounded to 3 decimals.
        $this->assertEqualsWithDelta(169.86265, $this->stock(), 0.0000001);
        $this->assertEqualsWithDelta(169.86265, $this->inventory()->rawStockSummary($this->white->id)['current_raw_stock_ton'], 0.0000001);
        $this->assertEqualsWithDelta(169.86265, $this->inventory()->getCurrentStock($this->white->id)['current_raw_stock_ton'], 0.0000001);

        // The audit ledger row keeps the same precision as the sale line.
        $movement = InventoryTransaction::where('source_type', 'raw_material_sale')->sole();
        $this->assertEqualsWithDelta(5.13735, (float) $movement->quantity_ton, 0.0000001);
        $this->assertEqualsWithDelta(169.86265, (float) $movement->balance_after_ton, 0.0000001);
    }

    public function test_the_exact_fractional_remainder_can_be_sold(): void
    {
        // 175 − 5.13766 leaves 169.86234 Ton; selling exactly that must not be
        // refused against a stock figure rounded down to 169.862.
        $this->postJson('/api/sales', $this->payload(['net_weight_kg' => 5_137.66]))->assertCreated();
        $this->postJson('/api/sales', $this->payload(['net_weight_kg' => 169_862.34]))->assertCreated();

        $this->assertEqualsWithDelta(0, $this->stock(), 0.0000001);

        // …and not one kilogram more.
        $this->postJson('/api/sales', $this->payload(['net_weight_kg' => 0.01]))->assertUnprocessable();
    }

    public function test_deducts_raw_stock_and_files_a_raw_material_sale_movement(): void
    {
        $this->assertEqualsWithDelta(175, $this->stock(), 0.0001);

        $saleId = $this->postJson('/api/sales', $this->payload())->assertCreated()->json('id');

        $this->assertEqualsWithDelta(155, $this->stock(), 0.0001);
        $this->assertEqualsWithDelta(50, $this->stock($this->red), 0.0001, 'other materials untouched');

        $movement = InventoryTransaction::where('source_type', 'raw_material_sale')->sole();
        $this->assertSame($saleId, $movement->source_id);
        $this->assertSame($this->white->id, $movement->product_id);
        $this->assertSame('out', $movement->direction);
        $this->assertEqualsWithDelta(20, $movement->quantity_ton, 0.001);

        $summary = $this->inventory()->rawStockSummary($this->white->id);
        $this->assertEqualsWithDelta(20, $summary['raw_sale_ton'], 0.001);
        $this->assertEqualsWithDelta(155, $summary['current_raw_stock_ton'], 0.001);
    }

    public function test_never_counted_as_production_consumption(): void
    {
        $this->postJson('/api/sales', $this->payload())->assertCreated();

        $this->assertSame(0, InventoryTransaction::where('source_type', 'production')->count());

        $stock = $this->inventory()->getCurrentStock($this->white->id);
        $this->assertEqualsWithDelta(0, $stock['produced_ton'], 0.001);
        $this->assertEqualsWithDelta(20, $stock['raw_sale_ton'], 0.001);

        $cycle = $this->inventory()->shipmentCycles($this->white->id)->last();
        $this->assertEqualsWithDelta(0, $cycle['consumed_ton'], 0.001);
        $this->assertEqualsWithDelta(20, $cycle['raw_sale_ton'], 0.001);
        $this->assertEqualsWithDelta(155, $cycle['closing_ton'], 0.001);
    }

    // ------------------------------------------------------------ 5 validation

    public function test_rejects_a_sale_larger_than_raw_stock(): void
    {
        // 176 Ton against 175 in the yard.
        $this->postJson('/api/sales', $this->payload(['net_weight_kg' => 176_000]))
            ->assertUnprocessable()
            ->assertJsonPath('message', fn (string $m) => str_contains($m, 'raw stock negative'));

        $this->assertSame(0, Sale::count());
        $this->assertSame(0, CustomerTransaction::count());
        $this->assertEqualsWithDelta(175, $this->stock(), 0.0001);
    }

    public function test_rejects_invalid_weights(): void
    {
        $this->postJson('/api/sales', $this->payload(['net_weight_kg' => 0]))
            ->assertUnprocessable()->assertJsonValidationErrors(['net_weight_kg']);
        $this->postJson('/api/sales', $this->payload(['net_weight_kg' => -5]))
            ->assertUnprocessable()->assertJsonValidationErrors(['net_weight_kg']);
        $this->postJson('/api/sales', $this->payload(['net_weight_kg' => null]))
            ->assertUnprocessable()->assertJsonValidationErrors(['net_weight_kg']);
        // Gross/tare are not part of a sale any more — sending them changes nothing.
        $this->postJson('/api/sales', $this->payload(['net_weight_kg' => null, 'gross_weight_kg' => 30_000, 'tare_weight_kg' => 10_000]))
            ->assertUnprocessable()->assertJsonValidationErrors(['net_weight_kg']);
        $this->postJson('/api/sales', $this->payload(['product_id' => null, 'rate_per_ton' => 0]))
            ->assertUnprocessable()->assertJsonValidationErrors(['product_id', 'rate_per_ton']);

        $this->assertSame(0, Sale::count());
    }

    public function test_rejects_a_sale_dated_in_a_closed_shipment_cycle(): void
    {
        $shipmentId = $this->inventory()->shipmentCycles($this->white->id)->last()['shipment']->id;
        $this->inventory()->closeShipment($shipmentId);

        $this->postJson('/api/sales', $this->payload())->assertUnprocessable();
        $this->assertSame(0, Sale::count());
    }

    // ------------------------------------------------------------ 6–9 ledger & cash

    public function test_posts_the_receivable_to_the_existing_customer_ledger(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload())->json('id');

        $row = CustomerTransaction::where('reference_sale_id', $saleId)->where('type', 'sale')->sole();
        $this->assertEqualsWithDelta(60_000, $row->debit, 0.001);
        $this->assertEqualsWithDelta(60_000, $this->balance(), 0.001);
    }

    public function test_partial_payment_at_sale_leaves_the_rest_due_and_lands_in_cash(): void
    {
        $this->postJson('/api/sales', $this->payload(['paid_at_sale' => 25_000]))
            ->assertCreated()
            ->assertJsonPath('amount_paid', 25000)
            ->assertJsonPath('amount_due', 35000)
            ->assertJsonPath('status', 'partial');

        $this->assertEqualsWithDelta(35_000, $this->balance(), 0.001);
        $this->assertEqualsWithDelta(25_000, $this->cashBalance(), 0.001);
        $this->assertSame(1, CustomerTransaction::where('type', 'payment')->count());
        $this->assertSame(1, Transaction::count());
    }

    public function test_full_payment_at_sale_settles_it(): void
    {
        $this->postJson('/api/sales', $this->payload(['paid_at_sale' => 60_000]))
            ->assertCreated()
            ->assertJsonPath('status', 'paid')
            ->assertJsonPath('amount_due', 0);

        $this->assertEqualsWithDelta(0, $this->balance(), 0.001);
        $this->assertEqualsWithDelta(60_000, $this->cashBalance(), 0.001);
    }

    public function test_cannot_collect_more_than_the_raw_sale_total(): void
    {
        $this->postJson('/api/sales', $this->payload(['paid_at_sale' => 60_001]))
            ->assertUnprocessable()->assertJsonValidationErrors(['paid_at_sale']);
    }

    public function test_an_existing_advance_covers_a_raw_sale(): void
    {
        app(CustomerLedgerService::class)->recordPayment([
            'customer_id' => $this->customer->id, 'date' => '2026-01-15', 'amount' => 80_000,
        ]);

        $this->postJson('/api/sales', $this->payload())
            ->assertCreated()
            ->assertJsonPath('status', 'advance')
            ->assertJsonPath('covered_by_advance', 60000);

        $this->assertEqualsWithDelta(-20_000, $this->balance(), 0.001);
    }

    // ------------------------------------------------------------ 10 edit

    public function test_edit_reverses_and_reapplies_stock_atomically(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload(['paid_at_sale' => 10_000]))->json('id');
        $invoiceNo = Sale::find($saleId)->invoice_no;

        // 20 → 30 Ton, rate 3,000 → 2,500 = 75,000.
        $this->putJson("/api/sales/{$saleId}", $this->payload(['net_weight_kg' => 30_000, 'rate_per_ton' => 2_500, 'paid_at_sale' => 15_000]))
            ->assertOk()
            ->assertJsonPath('id', $saleId)
            ->assertJsonPath('invoice_no', $invoiceNo)
            ->assertJsonPath('total_amount', 75000);

        $this->assertEqualsWithDelta(145, $this->stock(), 0.0001);
        $this->assertSame(1, InventoryTransaction::where('source_type', 'raw_material_sale')->count());
        $this->assertEqualsWithDelta(30, InventoryTransaction::where('source_type', 'raw_material_sale')->sole()->quantity_ton, 0.001);

        $this->assertEqualsWithDelta(60_000, $this->balance(), 0.001);
        $this->assertEqualsWithDelta(15_000, $this->cashBalance(), 0.001);
        $this->assertSame(1, CustomerTransaction::where('type', 'payment')->count(), 'no duplicate payment');
        $this->assertSame(1, Transaction::count(), 'no duplicate cash row');
    }

    public function test_edit_can_move_the_sale_to_another_material(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload())->json('id');

        $this->putJson("/api/sales/{$saleId}", $this->payload(['product_id' => $this->red->id]))->assertOk();

        $this->assertEqualsWithDelta(175, $this->stock(), 0.0001);
        $this->assertEqualsWithDelta(30, $this->stock($this->red), 0.0001);
    }

    public function test_an_edit_over_stock_is_refused_and_nothing_changes(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload())->json('id');

        // The sale's own 20 Ton count as available again: 175 is the ceiling, 176 is not.
        $this->putJson("/api/sales/{$saleId}", $this->payload(['net_weight_kg' => 175_000]))->assertOk();
        $this->putJson("/api/sales/{$saleId}", $this->payload(['net_weight_kg' => 176_000]))->assertUnprocessable();

        $this->assertEqualsWithDelta(0, $this->stock(), 0.0001, 'rolled back to the 175 Ton edit');
        $this->assertSame(1, Sale::find($saleId)->items()->count());
        $this->assertSame(1, InventoryTransaction::where('source_type', 'raw_material_sale')->count());
    }

    public function test_a_sale_cannot_switch_type_on_edit(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload())->json('id');

        $this->putJson("/api/sales/{$saleId}", [
            'date' => '2026-02-01', 'customer_id' => $this->customer->id,
            'items' => [['product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 1, 'rate_per_ton' => 1]],
        ])->assertUnprocessable();

        $this->assertSame('raw_material', Sale::find($saleId)->sale_type);
    }

    // ------------------------------------------------------------ 11 delete

    public function test_delete_restores_stock_and_reverses_ledger_and_cash(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload(['paid_at_sale' => 20_000]))->json('id');
        $this->assertEqualsWithDelta(155, $this->stock(), 0.0001);

        $this->deleteJson("/api/sales/{$saleId}")->assertNoContent();

        $this->assertEqualsWithDelta(175, $this->stock(), 0.0001);
        $this->assertSame(0, InventoryTransaction::where('source_type', 'raw_material_sale')->count());
        $this->assertSame(0, CustomerTransaction::count());
        $this->assertSame(0, Transaction::count());
        $this->assertEqualsWithDelta(0, $this->balance(), 0.001);
        $this->assertTrue(AuditLog::where('entity_id', $saleId)->where('action', 'DELETE')->exists());
    }

    // ------------------------------------------------------------ 12 confidentiality

    public function test_staff_never_receive_the_rate(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload())->json('id');

        $this->actingAsRole('Staff');

        $this->getJson("/api/sales/{$saleId}")->assertOk()->assertJsonMissingPath('items.0.rate_per_ton');
        $this->getJson('/api/app-data')->assertOk()->assertJsonMissingPath('saleItems.0.rate_per_ton');

        $this->actingAsRole('Admin');
        $this->getJson("/api/sales/{$saleId}")->assertJsonPath('items.0.rate_per_ton', 3000);
    }

    public function test_staff_cannot_edit_or_delete_a_raw_material_sale(): void
    {
        $saleId = $this->postJson('/api/sales', $this->payload())->json('id');

        $this->actingAsRole('Staff');
        $this->putJson("/api/sales/{$saleId}", $this->payload())->assertForbidden();
        $this->deleteJson("/api/sales/{$saleId}")->assertForbidden();
    }

    // ------------------------------------------------------------ 13 finished sales unaffected

    public function test_finished_product_sales_still_use_bag_stock_and_never_raw_stock(): void
    {
        ProductionEntry::create(['date' => '2026-01-02', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 300]);
        $before = $this->stock();

        $this->postJson('/api/sales', [
            'date' => '2026-02-01', 'customer_id' => $this->customer->id,
            'items' => [['product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 100, 'rate_per_ton' => 2_000]],
        ])->assertCreated()
            ->assertJsonPath('sale_type', 'finished_product')
            ->assertJsonPath('total_amount', 10000);

        $this->assertEqualsWithDelta($before, $this->stock(), 0.0001, 'raw stock untouched');
        $this->assertSame(200, $this->inventory()->availableBags($this->white->id, $this->mesh->id));
        $this->assertSame(0, InventoryTransaction::where('source_type', 'raw_material_sale')->count());
    }

    public function test_raw_sales_never_touch_bag_stock(): void
    {
        ProductionEntry::create(['date' => '2026-01-02', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 300]);

        $this->postJson('/api/sales', $this->payload())->assertCreated();

        $this->assertSame(300, $this->inventory()->availableBags($this->white->id, $this->mesh->id));
    }

    // ------------------------------------------------------------ 15 reports

    public function test_sales_report_distinguishes_the_two_types(): void
    {
        ProductionEntry::create(['date' => '2026-01-02', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 300]);
        app(SalesService::class)->createSale([
            'date' => '2026-02-01', 'customer_id' => $this->customer->id,
            'items' => [['product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 100, 'rate_per_ton' => 2_000]],
        ]);
        $this->postJson('/api/sales', $this->payload())->assertCreated();

        $this->getJson('/api/reports/sales?sale_type=raw_material')->assertOk()
            ->assertJsonCount(1, 'rows')->assertJsonPath('rows.0.sale_type', 'raw_material');
        $this->getJson('/api/reports/sales?sale_type=finished_product')->assertOk()
            ->assertJsonCount(1, 'rows')->assertJsonPath('rows.0.sale_type', 'finished_product');
        $this->getJson('/api/reports/sales')->assertOk()->assertJsonCount(2, 'rows');

        $shipment = collect($this->getJson('/api/reports/shipments')->assertOk()->json('rows'))
            ->firstWhere('product', 'Vietnam White Limestone');
        $this->assertSame('2026-01-01', $shipment['date']);
        $this->assertEqualsWithDelta(20, $shipment['raw_sale_ton'], 0.001);

        // Mesh-wise is finished goods only — the raw line has no mesh to group under.
        $this->getJson('/api/reports/mesh-wise')->assertOk()->assertJsonCount(1, 'rows');
    }
}
