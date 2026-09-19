<?php

namespace Tests\Feature;

use App\Exceptions\InsufficientStockException;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\WastageEntry;
use App\Services\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Current raw stock — "how many tons of this limestone are physically in the
 * yard right now":
 *
 *     Total Imported − Production Consumption − Wastage
 *
 * The cases here are the worked examples from the business brief, plus the two
 * things that would quietly corrupt the figure: wastage being subtracted twice,
 * and tonnage being rounded to whole tons.
 */
class RawStockTest extends TestCase
{
    use RefreshDatabase;

    private InventoryService $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        $this->inventory = app(InventoryService::class);
    }

    private function import(Product $product, float $tons, string $date = '2026-01-01'): void
    {
        $this->inventory->receiveStock([
            'date' => $date, 'product_id' => $product->id,
            'gross_weight_kg' => $tons * 1000, 'tare_weight_kg' => 0,
        ]);
    }

    private function produce(Product $product, MeshSize $mesh, int $bags, string $date = '2026-01-05'): ProductionEntry
    {
        return $this->inventory->consumeStock(
            $product->id,
            'production',
            $date,
            ($bags * (float) $mesh->bag_kg) / 1000,
            fn () => ProductionEntry::create([
                'date' => $date, 'product_id' => $product->id, 'mesh_id' => $mesh->id, 'bags' => $bags,
            ]),
        );
    }

    private function waste(Product $product, float $tons, string $date = '2026-01-06'): void
    {
        $this->inventory->consumeStock(
            $product->id,
            'wastage',
            $date,
            $tons,
            fn () => WastageEntry::create([
                'date' => $date, 'product_id' => $product->id, 'quantity_kg' => $tons * 1000,
            ]),
        );
    }

    /** 500 imported − 320 production − 5 wastage = 175, the brief's own example. */
    public function test_current_raw_stock_is_imported_less_production_less_wastage(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);

        $this->import($product, 500);
        $this->produce($product, $mesh, 6400);   // 6,400 × 50 kg = 320 Ton
        $this->waste($product, 5);

        $summary = $this->inventory->rawStockSummary($product->id);

        $this->assertEqualsWithDelta(500.0, $summary['imported_ton'], 0.0001);
        $this->assertEqualsWithDelta(320.0, $summary['production_ton'], 0.0001);
        $this->assertEqualsWithDelta(5.0, $summary['wastage_ton'], 0.0001);
        $this->assertEqualsWithDelta(175.0, $summary['current_raw_stock_ton'], 0.0001);
        $this->assertEqualsWithDelta(175.0, $this->inventory->currentRawStock($product->id), 0.0001);
    }

    /**
     * Wastage is *additional* raw material loss, never a slice of what
     * production already consumed — so recording production alone must not move
     * the wastage figure, and adding wastage must deduct its tonnage exactly
     * once.
     */
    public function test_wastage_is_not_double_counted_against_production(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);

        $this->import($product, 100);
        $this->produce($product, $mesh, 400);   // 20 Ton bagged

        $afterProduction = $this->inventory->rawStockSummary($product->id);
        $this->assertEqualsWithDelta(20.0, $afterProduction['production_ton'], 0.0001);
        $this->assertEqualsWithDelta(0.0, $afterProduction['wastage_ton'], 0.0001);
        $this->assertEqualsWithDelta(80.0, $afterProduction['current_raw_stock_ton'], 0.0001);

        $this->waste($product, 3);

        $afterWastage = $this->inventory->rawStockSummary($product->id);
        $this->assertEqualsWithDelta(20.0, $afterWastage['production_ton'], 0.0001);
        $this->assertEqualsWithDelta(3.0, $afterWastage['wastage_ton'], 0.0001);
        // 100 − 20 − 3, not 100 − 20 − 3 − 3.
        $this->assertEqualsWithDelta(77.0, $afterWastage['current_raw_stock_ton'], 0.0001);
    }

    /** The brief's flow: 100 Ton raw, 20 Ton into production, 80 Ton left — and 400 bags now in finished stock. */
    public function test_production_moves_tonnage_from_raw_stock_into_finished_stock(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);

        $this->import($product, 100);
        $this->assertEqualsWithDelta(100.0, $this->inventory->currentRawStock($product->id), 0.0001);
        $this->assertSame(0, $this->inventory->availableBags($product->id, $mesh->id));

        $this->produce($product, $mesh, 400);

        $this->assertEqualsWithDelta(80.0, $this->inventory->currentRawStock($product->id), 0.0001);
        $this->assertSame(400, $this->inventory->availableBags($product->id, $mesh->id));
    }

    /** 454 bags × 45 kg = 20.43 Ton — carried as a decimal, never rounded to 20. */
    public function test_tonnage_keeps_its_decimals(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 45]);

        $this->import($product, 100);
        $this->produce($product, $mesh, 454);

        $summary = $this->inventory->rawStockSummary($product->id);
        $this->assertEqualsWithDelta(20.43, $summary['production_ton'], 0.0001);
        $this->assertEqualsWithDelta(79.57, $summary['current_raw_stock_ton'], 0.0001);
    }

    public function test_each_limestone_type_has_its_own_raw_stock(): void
    {
        $white = Product::factory()->create(['name' => 'Vietnam White Limestone', 'code' => 'VWL-T']);
        $red = Product::factory()->create(['name' => 'Oman Red Limestone', 'code' => 'ORL-T']);
        $grey = Product::factory()->create(['name' => 'Grey Limestone', 'code' => 'GRL-T']);
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);

        $this->import($white, 500);
        $this->produce($white, $mesh, 6400);
        $this->waste($white, 5);

        $this->import($red, 300);
        $this->produce($red, $mesh, 3000);
        $this->waste($red, 2);

        $this->import($grey, 250);
        $this->produce($grey, $mesh, 2000);

        $summaries = $this->inventory->allRawStockSummaries()->keyBy('product_name');

        $this->assertEqualsWithDelta(175.0, $summaries['Vietnam White Limestone']['current_raw_stock_ton'], 0.0001);
        $this->assertEqualsWithDelta(148.0, $summaries['Oman Red Limestone']['current_raw_stock_ton'], 0.0001);
        $this->assertEqualsWithDelta(150.0, $summaries['Grey Limestone']['current_raw_stock_ton'], 0.0001);
        $this->assertEqualsWithDelta(0.0, $summaries['Grey Limestone']['wastage_ton'], 0.0001);
    }

    /**
     * A date window reports the movements inside it, and carries in whatever was
     * on hand beforehand — so opening + imported − production − wastage still
     * lands on the stock actually held at the end of the window.
     */
    public function test_date_range_report_carries_in_the_opening_stock(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);

        $this->import($product, 100, '2026-01-01');
        $this->produce($product, $mesh, 400, '2026-01-10');     // 20 Ton in January

        $this->import($product, 50, '2026-02-01');
        $this->produce($product, $mesh, 200, '2026-02-10');     // 10 Ton in February
        $this->waste($product, 1, '2026-02-15');

        $february = $this->inventory->rawStockSummary($product->id, '2026-02-01', '2026-02-28');

        $this->assertEqualsWithDelta(80.0, $february['opening_ton'], 0.0001);
        $this->assertEqualsWithDelta(50.0, $february['imported_ton'], 0.0001);
        $this->assertEqualsWithDelta(10.0, $february['production_ton'], 0.0001);
        $this->assertEqualsWithDelta(1.0, $february['wastage_ton'], 0.0001);
        $this->assertEqualsWithDelta(119.0, $february['current_raw_stock_ton'], 0.0001);

        // The same figure the all-time view reports, since the window ends after everything.
        $this->assertEqualsWithDelta(119.0, $this->inventory->currentRawStock($product->id), 0.0001);
    }

    public function test_production_cannot_take_raw_stock_negative(): void
    {
        $product = Product::factory()->create(['name' => 'Vietnam White Limestone']);
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);

        $this->import($product, 10);

        $this->expectException(InsufficientStockException::class);
        $this->produce($product, $mesh, 400);   // 20 Ton against 10 Ton on hand
    }

    public function test_wastage_cannot_take_raw_stock_negative(): void
    {
        $product = Product::factory()->create();
        $this->import($product, 10);

        $this->expectException(InsufficientStockException::class);
        $this->waste($product, 10.5);
    }

    public function test_editing_a_shipments_weights_recomputes_net_kg_and_ton(): void
    {
        $product = Product::factory()->create();
        $shipment = $this->inventory->receiveStock([
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 10_000, 'tare_weight_kg' => 500,
        ]);

        $this->assertEqualsWithDelta(9_500.0, $shipment->netWeightKg(), 0.0001);
        $this->assertEqualsWithDelta(9.5, $shipment->netWeightTon(), 0.0001);

        $updated = $this->inventory->updateShipment($shipment->id, [
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 12_000, 'tare_weight_kg' => 1_000,
        ]);

        $this->assertEqualsWithDelta(11_000.0, $updated->netWeightKg(), 0.0001);
        $this->assertEqualsWithDelta(11.0, $updated->netWeightTon(), 0.0001);
        $this->assertEqualsWithDelta(11.0, $this->inventory->currentRawStock($product->id), 0.0001);
    }

    public function test_editing_a_shipment_down_below_already_consumed_tonnage_is_rejected(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);

        $shipment = $this->inventory->receiveStock([
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 10_000, 'tare_weight_kg' => 0,
        ]);
        $this->produce($product, $mesh, 160, '2026-01-05'); // consumes 8 Ton, 2 Ton left

        $this->expectException(InsufficientStockException::class);
        // Shrinking the shipment to 5 Ton would leave only 5 − 8 = −3 Ton on hand.
        $this->inventory->updateShipment($shipment->id, [
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 5_000, 'tare_weight_kg' => 0,
        ]);

        // The shipment must be unchanged — the whole edit rolled back.
        $this->assertEqualsWithDelta(10_000.0, $shipment->fresh()->gross_weight_kg, 0.0001);
    }

    public function test_editing_a_closed_shipment_is_still_blocked(): void
    {
        $product = Product::factory()->create();
        $shipment = $this->inventory->receiveStock([
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 10_000, 'tare_weight_kg' => 0,
        ]);
        $this->inventory->closeShipment($shipment->shipment_id);

        $this->expectException(\App\Exceptions\BusinessRuleException::class);
        $this->inventory->updateShipment($shipment->id, [
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 9_000, 'tare_weight_kg' => 0,
        ]);
    }

    public function test_get_current_stock_reports_the_same_headline_figure(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);

        $this->import($product, 500);
        $this->produce($product, $mesh, 6400);
        $this->waste($product, 5);

        $stock = $this->inventory->getCurrentStock($product->id);

        $this->assertEqualsWithDelta(175.0, $stock['current_raw_stock_ton'], 0.0001);
        // With no shipment closed, the shipment-cycle view telescopes to the same number.
        $this->assertEqualsWithDelta(175.0, $stock['closing_ton'], 0.0001);
    }
}
