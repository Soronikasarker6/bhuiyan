<?php

namespace Tests\Feature;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShipmentClosedException;
use App\Models\Customer;
use App\Models\InventoryTransaction;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Services\InventoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Editing a production entry must keep raw stock and bag stock balanced exactly
 * as deleting it and recording the new figures would — never letting raw stock
 * go negative, nor un-producing bags that were already sold.
 */
class ProductionEditTest extends TestCase
{
    use RefreshDatabase;

    private InventoryService $inventory;

    protected function setUp(): void
    {
        parent::setUp();
        $this->inventory = app(InventoryService::class);
    }

    private function import(Product $product, float $tons): void
    {
        $this->inventory->receiveStock([
            'date' => '2026-01-01', 'product_id' => $product->id,
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

    private function edit(ProductionEntry $entry, Product $product, MeshSize $mesh, int $bags, string $date = '2026-01-05'): ProductionEntry
    {
        return $this->inventory->updateProduction($entry->id, [
            'date' => $date, 'product_id' => $product->id, 'mesh_id' => $mesh->id, 'bags' => $bags,
        ]);
    }

    public function test_editing_moves_raw_stock_and_bag_stock_by_the_difference(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->import($product, 20);
        $entry = $this->produce($product, $mesh, 200);   // 10 Ton

        $this->edit($entry, $product, $mesh, 300);       // 15 Ton

        $this->assertEqualsWithDelta(5.0, $this->inventory->currentRawStock($product->id), 0.0001);
        $this->assertSame(300, $this->inventory->availableBags($product->id, $mesh->id));
        $this->assertEqualsWithDelta(15.0, (float) InventoryTransaction::where('source_type', 'production')
            ->where('source_id', $entry->id)->value('quantity_ton'), 0.0001);
    }

    public function test_an_entry_can_reuse_its_own_tonnage(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->import($product, 10);
        $entry = $this->produce($product, $mesh, 200);   // all 10 Ton consumed

        // Same 10 Ton on another day — must not be rejected as "0 Ton available".
        $this->edit($entry, $product, $mesh, 200, '2026-01-07');

        $this->assertEqualsWithDelta(0.0, $this->inventory->currentRawStock($product->id), 0.0001);
    }

    public function test_editing_above_raw_stock_is_rejected_and_rolled_back(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->import($product, 10);
        $entry = $this->produce($product, $mesh, 100);

        try {
            $this->edit($entry, $product, $mesh, 300);
            $this->fail('Expected InsufficientStockException');
        } catch (InsufficientStockException) {
        }

        $this->assertSame(100, (int) $entry->fresh()->bags);
        $this->assertEqualsWithDelta(5.0, $this->inventory->currentRawStock($product->id), 0.0001);
    }

    public function test_editing_below_already_sold_bags_is_rejected(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->import($product, 20);
        $entry = $this->produce($product, $mesh, 300);

        $sale = Sale::create(['invoice_no' => 'T-1', 'date' => '2026-01-10', 'customer_id' => Customer::factory()->create()->id]);
        SaleItem::create(['sale_id' => $sale->id, 'product_id' => $product->id, 'mesh_size_id' => $mesh->id, 'bags' => 200, 'rate_per_ton' => 1]);

        $this->expectException(InsufficientStockException::class);
        $this->edit($entry, $product, $mesh, 150);
    }

    public function test_moving_to_another_product_moves_its_tonnage(): void
    {
        $grey = Product::factory()->create();
        $white = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $this->import($grey, 20);
        $this->import($white, 20);
        $entry = $this->produce($grey, $mesh, 200);

        $this->edit($entry, $white, $mesh, 200);

        $this->assertEqualsWithDelta(20.0, $this->inventory->currentRawStock($grey->id), 0.0001);
        $this->assertEqualsWithDelta(10.0, $this->inventory->currentRawStock($white->id), 0.0001);
    }

    public function test_editing_inside_a_closed_cycle_is_blocked(): void
    {
        $product = Product::factory()->create();
        $mesh = MeshSize::factory()->create(['bag_kg' => 50]);
        $shipment = $this->inventory->receiveStock([
            'date' => '2026-01-01', 'product_id' => $product->id,
            'gross_weight_kg' => 20_000, 'tare_weight_kg' => 0,
        ]);
        $entry = $this->produce($product, $mesh, 100);
        $this->inventory->closeShipment($shipment->shipment_id);

        $this->expectException(ShipmentClosedException::class);
        $this->edit($entry, $product, $mesh, 120);
    }
}
