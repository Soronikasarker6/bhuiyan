<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\RawMaterialImport;
use App\Models\WastageEntry;
use App\Services\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Ports the exact scenarios from the frontend's src/test/rawMaterial.test.ts —
 * see the plan's §6 for the full list. Wastage entries (not production) are used
 * to drive consumption here since they take a ton amount directly, keeping the
 * arithmetic under test isolated from bag/mesh conversion (covered separately).
 */
class InventoryServiceTest extends TestCase
{
    use RefreshDatabase;

    private InventoryService $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        $this->inventory = app(InventoryService::class);
    }

    private function consume(Product $product, string $date, float $tons): void
    {
        $this->inventory->consumeStock($product->id, 'wastage', $date, $tons, fn () => WastageEntry::create([
            'date' => $date, 'product_id' => $product->id, 'quantity_kg' => $tons * 1000,
        ]));
    }

    public function test_fresh_shipment_receives_and_consumes(): void
    {
        $product = Product::factory()->create();
        $this->inventory->receiveStock([
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0,
        ]);

        $this->consume($product, '2026-01-02', 2500);

        $stock = $this->inventory->getCurrentStock($product->id);
        $this->assertSame(0.0, $stock['opening_ton']);
        $this->assertEqualsWithDelta(10000.0, $stock['received_ton'], 0.0001);
        $this->assertEqualsWithDelta(2500.0, $stock['consumed_ton'], 0.0001);
        $this->assertEqualsWithDelta(7500.0, $stock['closing_ton'], 0.0001);
        $this->assertEqualsWithDelta(7500.0, $stock['available_ton'], 0.0001);
    }

    public function test_second_shipment_opens_at_first_shipments_closing(): void
    {
        $product = Product::factory()->create();
        $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->consume($product, '2026-01-05', 2500);

        $this->inventory->receiveStock(['date' => '2026-02-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->consume($product, '2026-02-05', 5000);

        $cycles = $this->inventory->shipmentCycles($product->id);
        $this->assertEqualsWithDelta(7500.0, $cycles[0]['closing_ton'], 0.0001);
        $this->assertEqualsWithDelta(7500.0, $cycles[1]['opening_ton'], 0.0001);
        $this->assertEqualsWithDelta(17500.0, $cycles[1]['available_ton'], 0.0001);
        $this->assertEqualsWithDelta(12500.0, $cycles[1]['closing_ton'], 0.0001);

        // A third shipment continues the chain from 12,500.
        $this->inventory->receiveStock(['date' => '2026-03-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $cycles = $this->inventory->shipmentCycles($product->id);
        $this->assertEqualsWithDelta(12500.0, $cycles[2]['opening_ton'], 0.0001);
        $this->assertEqualsWithDelta(22500.0, $cycles[2]['closing_ton'], 0.0001);
    }

    public function test_materials_never_interfere_with_each_other(): void
    {
        $white = Product::factory()->create(['code' => 'VWL-T']);
        $red = Product::factory()->create(['code' => 'ORL-T']);

        $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $white->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->consume($white, '2026-01-05', 3000);
        $this->consume($white, '2026-01-06', 500);

        $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $red->id, 'gross_weight_kg' => 8_000_000, 'tare_weight_kg' => 0]);
        $this->consume($red, '2026-01-05', 1000);

        $this->assertEqualsWithDelta(6500.0, $this->inventory->calculateAvailableStock($white->id), 0.0001);
        $this->assertEqualsWithDelta(7000.0, $this->inventory->calculateAvailableStock($red->id), 0.0001);
    }

    public function test_decimal_tons_are_never_rounded(): void
    {
        $product = Product::factory()->create();
        $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_200, 'tare_weight_kg' => 0]);
        $this->consume($product, '2026-01-05', 2500.5);

        $this->assertEqualsWithDelta(7499.7, $this->inventory->calculateAvailableStock($product->id), 0.0001);
    }

    public function test_closing_a_shipment_freezes_it_against_later_back_dated_entries(): void
    {
        $product = Product::factory()->create();
        $shipment = $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->consume($product, '2026-01-05', 2500);

        $this->inventory->closeShipment($shipment->id);
        $closed = $shipment->fresh();
        $this->assertSame('closed', $closed->status);
        $this->assertEqualsWithDelta(7500.0, (float) $closed->closing_closing_ton, 0.0001);

        // A back-dated wastage entry inside the now-closed window must not move it.
        WastageEntry::create(['date' => '2026-01-03', 'product_id' => $product->id, 'quantity_kg' => 900_000]);

        $this->inventory->receiveStock(['date' => '2026-02-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);

        $cycles = $this->inventory->shipmentCycles($product->id);
        $this->assertEqualsWithDelta(7500.0, $cycles[0]['closing_ton'], 0.0001); // untouched
        $this->assertEqualsWithDelta(7500.0, $cycles[1]['opening_ton'], 0.0001);
        $this->assertEqualsWithDelta(17500.0, $cycles[1]['closing_ton'], 0.0001);
    }

    public function test_cycle_status_for_date(): void
    {
        $product = Product::factory()->create();
        $this->assertNull($this->inventory->cycleStatusForDate($product->id, '2026-01-01'));

        $shipment = $this->inventory->receiveStock(['date' => '2026-01-10', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->assertNull($this->inventory->cycleStatusForDate($product->id, '2026-01-01'));
        $this->assertSame('open', $this->inventory->cycleStatusForDate($product->id, '2026-01-15'));

        $this->inventory->closeShipment($shipment->id);
        $this->assertSame('closed', $this->inventory->cycleStatusForDate($product->id, '2026-01-15'));
    }

    public function test_reopening_a_shipment_makes_it_live_again(): void
    {
        $product = Product::factory()->create();
        $shipment = $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->inventory->closeShipment($shipment->id);
        $this->inventory->reopenShipment($shipment->id);

        $this->assertSame('open', $shipment->fresh()->status);
        $this->assertNull($shipment->fresh()->closing_closing_ton);
    }
}
