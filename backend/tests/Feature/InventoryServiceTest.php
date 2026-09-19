<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Shipment;
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
        $this->assertEqualsWithDelta(2500.0, $stock['cycle_wastage_ton'], 0.0001);
        $this->assertEqualsWithDelta(7500.0, $stock['closing_ton'], 0.0001);
        $this->assertEqualsWithDelta(7500.0, $stock['available_ton'], 0.0001);
    }

    public function test_a_second_import_while_open_accumulates_into_the_same_shipment(): void
    {
        $product = Product::factory()->create();
        $first = $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $second = $this->inventory->receiveStock(['date' => '2026-01-10', 'product_id' => $product->id, 'gross_weight_kg' => 20_000_000, 'tare_weight_kg' => 0]);

        // Same shipment cycle — no new one opened for the second import.
        $this->assertSame($first->shipment_id, $second->shipment_id);
        $this->assertSame(1, Shipment::where('product_id', $product->id)->count());

        $this->consume($product, '2026-01-15', 5000);

        $cycles = $this->inventory->shipmentCycles($product->id);
        $this->assertCount(1, $cycles);
        $this->assertEqualsWithDelta(30000.0, $cycles[0]['received_ton'], 0.0001); // 10,000 + 20,000, summed
        $this->assertEqualsWithDelta(25000.0, $cycles[0]['closing_ton'], 0.0001);
    }

    public function test_closing_then_importing_again_opens_a_new_shipment(): void
    {
        $product = Product::factory()->create();
        $first = $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->consume($product, '2026-01-05', 2500);
        $this->inventory->closeShipment($first->shipment_id);

        $second = $this->inventory->receiveStock(['date' => '2026-02-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->consume($product, '2026-02-05', 5000);

        // A brand new shipment id — never the closed one, and never reused.
        $this->assertNotSame($first->shipment_id, $second->shipment_id);

        $cycles = $this->inventory->shipmentCycles($product->id);
        $this->assertEqualsWithDelta(7500.0, $cycles[0]['closing_ton'], 0.0001);
        $this->assertEqualsWithDelta(7500.0, $cycles[1]['opening_ton'], 0.0001);
        $this->assertEqualsWithDelta(17500.0, $cycles[1]['available_ton'], 0.0001);
        $this->assertEqualsWithDelta(12500.0, $cycles[1]['closing_ton'], 0.0001);

        // A third shipment continues the chain from 12,500.
        $third = $this->inventory->receiveStock(['date' => '2026-03-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->assertSame($second->shipment_id, $third->shipment_id); // still open, so it accumulates

        $cycles = $this->inventory->shipmentCycles($product->id);
        $this->assertCount(2, $cycles);
        // Opening is still 7,500 — inherited once from the closed first
        // shipment and never moved by the second shipment's own activity.
        $this->assertEqualsWithDelta(7500.0, $cycles[1]['opening_ton'], 0.0001);
        $this->assertEqualsWithDelta(20000.0, $cycles[1]['received_ton'], 0.0001); // 10,000 + this third import's 10,000
        $this->assertEqualsWithDelta(22500.0, $cycles[1]['closing_ton'], 0.0001);
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
        $import = $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->consume($product, '2026-01-05', 2500);

        $this->inventory->closeShipment($import->shipment_id);
        $closed = Shipment::find($import->shipment_id);
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

        $import = $this->inventory->receiveStock(['date' => '2026-01-10', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->assertNull($this->inventory->cycleStatusForDate($product->id, '2026-01-01'));
        $this->assertSame('open', $this->inventory->cycleStatusForDate($product->id, '2026-01-15'));

        $this->inventory->closeShipment($import->shipment_id);
        $this->assertSame('closed', $this->inventory->cycleStatusForDate($product->id, '2026-01-15'));
    }

    public function test_reopening_a_shipment_makes_it_live_again(): void
    {
        $product = Product::factory()->create();
        $import = $this->inventory->receiveStock(['date' => '2026-01-01', 'product_id' => $product->id, 'gross_weight_kg' => 10_000_000, 'tare_weight_kg' => 0]);
        $this->inventory->closeShipment($import->shipment_id);
        $this->inventory->reopenShipment($import->shipment_id);

        $shipment = Shipment::find($import->shipment_id);
        $this->assertSame('open', $shipment->status);
        $this->assertNull($shipment->closing_closing_ton);

        // Reopened means live again — a further import while it's open joins it, not a new shipment.
        $again = $this->inventory->receiveStock(['date' => '2026-01-20', 'product_id' => $product->id, 'gross_weight_kg' => 5_000_000, 'tare_weight_kg' => 0]);
        $this->assertSame($import->shipment_id, $again->shipment_id);
    }
}
