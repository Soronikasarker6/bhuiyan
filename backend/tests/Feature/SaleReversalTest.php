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
use App\Services\ProfitService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * A raw material sale inside a closed shipment cycle cannot be edited or
 * deleted; an Admin reverses it instead. The sale and everything it posted
 * stay as they were; the reversal posts its own offsetting entries on the
 * reversal date, so the closed cycle keeps its figures and the correction
 * lands in the open one.
 */
class SaleReversalTest extends TestCase
{
    use RefreshDatabase;

    private Product $white;

    private MeshSize $mesh;

    private Customer $customer;

    private Account $cash;

    private int $saleId;

    private int $closedShipmentId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        $this->cash = Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        $this->white = Product::factory()->create(['name' => 'Vietnam White Limestone']);
        $this->mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->customer = Customer::factory()->create();

        // Cycle 1: 175 Ton received in January; 20 Ton sold raw in February (25,000 paid at sale).
        $this->inventory()->receiveStock([
            'date' => '2026-01-01', 'product_id' => $this->white->id,
            'gross_weight_kg' => 200_000, 'tare_weight_kg' => 25_000,
        ]);

        $this->actingAsRole('Admin');
        $this->saleId = $this->postJson('/api/sales', $this->payload(['paid_at_sale' => 25_000]))->assertCreated()->json('id');

        // Close cycle 1 (155 Ton closing), then a new shipment opens cycle 2 in March.
        $this->closedShipmentId = $this->inventory()->shipmentCycles($this->white->id)->last()['shipment']->id;
        $this->inventory()->closeShipment($this->closedShipmentId);
        $this->inventory()->receiveStock([
            'date' => '2026-03-01', 'product_id' => $this->white->id,
            'gross_weight_kg' => 50_000, 'tare_weight_kg' => 0,
        ]);
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

    /** 20 Ton net of white limestone @ 3,000 = 60,000. */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'sale_type' => 'raw_material', 'date' => '2026-02-01', 'customer_id' => $this->customer->id,
            'product_id' => $this->white->id, 'truck_no' => 'DMT-1',
            'net_weight_kg' => 20_000, 'rate_per_ton' => 3_000,
        ], $overrides);
    }

    private function reverse(array $body = []): TestResponse
    {
        return $this->postJson("/api/sales/{$this->saleId}/reverse", $body + ['reason' => 'Wrong customer', 'date' => '2026-03-10']);
    }

    private function stock(): float
    {
        return $this->inventory()->currentRawStock($this->white->id);
    }

    private function totals(): array
    {
        return app(CustomerLedgerService::class)->totals($this->customer->id);
    }

    private function cashBalance(): float
    {
        return (float) app(LedgerService::class)->accountBalances()->firstWhere('account_id', $this->cash->id)['balance'];
    }

    /** @return array{0: array, 1: array} [closed cycle 1, open cycle 2] */
    private function cycles(): array
    {
        $cycles = $this->inventory()->shipmentCycles($this->white->id)->values();

        return [$cycles[0], $cycles[1]];
    }

    // ------------------------------------------------------------ blocked

    public function test_a_raw_sale_in_a_closed_cycle_cannot_be_edited(): void
    {
        $this->putJson("/api/sales/{$this->saleId}", $this->payload(['net_weight_kg' => 10_000]))
            ->assertUnprocessable()
            ->assertJsonPath('message', fn (string $m) => str_contains($m, 'closed shipment cycle') && str_contains($m, 'reverse'));

        $this->assertEqualsWithDelta(20, Sale::find($this->saleId)->items()->first()->actual_weight_ton, 0.00001);
        $this->assertEqualsWithDelta(205, $this->stock(), 0.0001);
    }

    public function test_a_raw_sale_in_a_closed_cycle_cannot_be_deleted(): void
    {
        $this->deleteJson("/api/sales/{$this->saleId}")->assertUnprocessable();

        $this->assertNotNull(Sale::find($this->saleId));
        $this->assertSame(1, InventoryTransaction::where('source_type', 'raw_material_sale')->count());
        $this->assertSame(2, CustomerTransaction::where('reference_sale_id', $this->saleId)->count());
        $this->assertSame(1, Transaction::count());
    }

    public function test_finished_product_sales_are_not_tied_to_shipment_cycles(): void
    {
        ProductionEntry::create(['date' => '2026-03-02', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 300]);
        $saleId = $this->postJson('/api/sales', [
            'date' => '2026-03-05', 'customer_id' => $this->customer->id,
            'items' => [['product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 100, 'rate_per_ton' => 2_000]],
        ])->assertCreated()->json('id');

        $this->putJson("/api/sales/{$saleId}", [
            'date' => '2026-03-05', 'customer_id' => $this->customer->id,
            'items' => [['product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 120, 'rate_per_ton' => 2_000]],
        ])->assertOk();
        $this->deleteJson("/api/sales/{$saleId}")->assertNoContent();

        $this->postJson("/api/sales/{$this->saleId}/reverse", ['reason' => 'x'])->assertOk();
    }

    // ------------------------------------------------------------ reversal

    public function test_reversal_keeps_the_original_and_marks_it_reversed(): void
    {
        $saleRow = CustomerTransaction::where('reference_sale_id', $this->saleId)->where('type', 'sale')->sole();

        $this->reverse()->assertOk()
            ->assertJsonPath('id', $this->saleId)
            ->assertJsonPath('status', 'reversed')
            ->assertJsonPath('reversed_on', '2026-03-10')
            ->assertJsonPath('reversal_reason', 'Wrong customer')
            ->assertJsonPath('total_amount', 60000)
            ->assertJsonPath('amount_paid', 25000)
            ->assertJsonPath('amount_due', 0);

        $sale = Sale::find($this->saleId);
        $this->assertSame('2026-02-01', $sale->date->toDateString(), 'original date untouched');
        $this->assertSame(1, $sale->items()->count());
        $this->assertEquals($saleRow->fresh()->toArray(), $saleRow->toArray(), 'original sale debit untouched');
        $this->assertSame(1, InventoryTransaction::where('source_type', 'raw_material_sale')->count(), 'original stock OUT kept');
        $this->assertNotNull($sale->reversed_by_user_id);
    }

    public function test_reversal_returns_stock_in_the_open_cycle_and_leaves_the_closed_one_frozen(): void
    {
        [$closedBefore] = $this->cycles();
        $this->assertEqualsWithDelta(205, $this->stock(), 0.0001); // 175 − 20 + 50

        $this->reverse()->assertOk();

        $this->assertEqualsWithDelta(225, $this->stock(), 0.0001);

        [$closed, $open] = $this->cycles();
        $this->assertSame($closedBefore['closing_ton'], $closed['closing_ton']);
        $this->assertSame($closedBefore['raw_sale_ton'], $closed['raw_sale_ton']);
        $this->assertEqualsWithDelta(20, $closed['raw_sale_ton'], 0.001, 'closed cycle still shows the sale');
        $this->assertEqualsWithDelta(-20, $open['raw_sale_ton'], 0.001, 'the return lands in the open cycle');
        $this->assertEqualsWithDelta(225, $open['closing_ton'], 0.001);

        $movement = InventoryTransaction::where('source_type', 'raw_material_sale_reversal')->sole();
        $this->assertSame('in', $movement->direction);
        $this->assertSame($this->saleId, $movement->source_id);
        $this->assertEqualsWithDelta(20, $movement->quantity_ton, 0.001);

        // Stock as at a February date — before the reversal — still shows the sale.
        $this->assertEqualsWithDelta(155, $this->inventory()->currentRawStock($this->white->id, '2026-02-28'), 0.0001);
    }

    public function test_reversal_clears_the_receivable_and_frees_paid_money_as_advance(): void
    {
        $this->assertEqualsWithDelta(35_000, $this->totals()['balance'], 0.001);
        $this->assertEqualsWithDelta(25_000, $this->cashBalance(), 0.001);

        $this->reverse()->assertOk();

        $reversal = CustomerTransaction::where('type', 'sale_reversal')->sole();
        $this->assertSame($this->saleId, $reversal->reference_sale_id);
        $this->assertSame('2026-03-10', $reversal->date->toDateString());
        $this->assertEqualsWithDelta(60_000, $reversal->credit, 0.001);

        $totals = $this->totals();
        $this->assertEqualsWithDelta(-25_000, $totals['balance'], 0.001, 'the 25,000 paid is now credit in hand');
        $this->assertEqualsWithDelta(25_000, $totals['available_advance'], 0.001);
        $this->assertEqualsWithDelta(0, $totals['total_sales'], 0.001, 'net of the reversal');
        $this->assertEqualsWithDelta($totals['total_sales'] - $totals['total_paid'], $totals['balance'], 0.001);

        // No money moved: nothing was refunded, so cash is unchanged and nothing is duplicated.
        $this->assertEqualsWithDelta(25_000, $this->cashBalance(), 0.001);
        $this->assertSame(1, Transaction::count());
        $this->assertSame(1, CustomerTransaction::where('type', 'payment')->count());
    }

    public function test_the_freed_advance_covers_the_corrected_sale(): void
    {
        // Wrong type recorded: reverse it, then record the right sale.
        $this->reverse(['reason' => 'Should have been bagged stock'])->assertOk();

        ProductionEntry::create(['date' => '2026-03-02', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 300]);
        $this->postJson('/api/sales', [
            'date' => '2026-03-11', 'customer_id' => $this->customer->id,
            'items' => [['product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 100, 'rate_per_ton' => 2_000]],
        ])->assertCreated()
            ->assertJsonPath('status', 'advance')
            ->assertJsonPath('covered_by_advance', 10000);

        $this->assertEqualsWithDelta(-15_000, $this->totals()['balance'], 0.001);
    }

    public function test_profit_takes_the_reversal_in_the_reversal_month(): void
    {
        $profit = app(ProfitService::class);
        $this->assertEqualsWithDelta(60_000, $profit->monthlyProfit(2026, 1)['total_sales'], 0.001);

        $this->reverse()->assertOk();

        $this->assertEqualsWithDelta(60_000, $profit->monthlyProfit(2026, 1)['total_sales'], 0.001, 'February as reported');
        $this->assertEqualsWithDelta(-60_000, $profit->monthlyProfit(2026, 2)['total_sales'], 0.001, 'March carries the reversal');
    }

    public function test_reversal_is_audited_with_its_reason(): void
    {
        $this->reverse()->assertOk();

        $log = AuditLog::where('entity_id', $this->saleId)->where('action', 'REVERSE')->sole();
        $this->assertSame('Wrong customer', $log->reason);
        $this->assertStringContainsString('Reversed sale', $log->summary);
    }

    // ------------------------------------------------------------ guards

    public function test_only_admins_can_reverse(): void
    {
        foreach (['Manager', 'Staff'] as $role) {
            $this->actingAsRole($role);
            $this->reverse()->assertForbidden();
        }

        $this->assertNull(Sale::find($this->saleId)->reversed_on);
        $this->assertSame(0, CustomerTransaction::where('type', 'sale_reversal')->count());
    }

    public function test_a_reason_is_required(): void
    {
        $this->postJson("/api/sales/{$this->saleId}/reverse", ['date' => '2026-03-10'])
            ->assertUnprocessable()->assertJsonValidationErrors(['reason']);
    }

    public function test_cannot_be_dated_before_the_sale_or_inside_a_closed_cycle(): void
    {
        $this->reverse(['date' => '2026-01-31'])->assertUnprocessable();

        // Inside the closed cycle 1 window: refused, nothing written.
        $this->reverse(['date' => '2026-02-15'])
            ->assertUnprocessable()
            ->assertJsonPath('message', fn (string $m) => str_contains($m, 'closed shipment cycle'));

        $this->assertNull(Sale::find($this->saleId)->reversed_on);
        $this->assertSame(0, CustomerTransaction::where('type', 'sale_reversal')->count());
        $this->assertSame(0, InventoryTransaction::where('source_type', 'raw_material_sale_reversal')->count());
        $this->assertEqualsWithDelta(205, $this->stock(), 0.0001);
    }

    public function test_a_reversed_sale_is_locked(): void
    {
        $this->reverse()->assertOk();

        $this->reverse()->assertUnprocessable();
        $this->putJson("/api/sales/{$this->saleId}", $this->payload(['date' => '2026-03-12']))->assertUnprocessable();
        $this->deleteJson("/api/sales/{$this->saleId}")->assertUnprocessable();

        $this->assertSame(1, CustomerTransaction::where('type', 'sale_reversal')->count());
        $this->assertEqualsWithDelta(225, $this->stock(), 0.0001);
    }

    public function test_finished_product_sales_cannot_be_reversed(): void
    {
        ProductionEntry::create(['date' => '2026-03-02', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 300]);
        $saleId = $this->postJson('/api/sales', [
            'date' => '2026-03-05', 'customer_id' => $this->customer->id,
            'items' => [['product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 100, 'rate_per_ton' => 2_000]],
        ])->json('id');

        $this->postJson("/api/sales/{$saleId}/reverse", ['reason' => 'x'])->assertUnprocessable();
    }

    public function test_reports_show_the_reversed_status(): void
    {
        $this->reverse()->assertOk();

        $this->getJson('/api/reports/sales?sale_type=raw_material')->assertOk()
            ->assertJsonPath('rows.0.status', 'reversed')
            ->assertJsonPath('rows.0.due', 0);
    }
}
