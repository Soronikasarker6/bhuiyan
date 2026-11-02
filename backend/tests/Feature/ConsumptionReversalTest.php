<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\InventoryTransaction;
use App\Models\MeshSize;
use App\Models\Product;
use App\Models\ProductionEntry;
use App\Models\User;
use App\Models\WastageEntry;
use App\Services\InventoryService;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Production and wastage entries inside a closed shipment cycle cannot be
 * edited or deleted; an Admin reverses them instead. The entry stays as it
 * was; the reversal returns its tons (and takes a production entry's bags back
 * out of bag stock) on the reversal date, in the open cycle.
 */
class ConsumptionReversalTest extends TestCase
{
    use RefreshDatabase;

    private Product $white;

    private MeshSize $mesh;

    private ProductionEntry $production;

    private WastageEntry $wastage;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        $this->white = Product::factory()->create(['name' => 'Vietnam White Limestone']);
        $this->mesh = MeshSize::factory()->create(['bag_kg' => 50]);

        // Cycle 1: 175 Ton in; 100 bags (5 Ton) produced; 2 Ton wasted — then closed at 168.
        $this->inventory()->receiveStock([
            'date' => '2026-01-01', 'product_id' => $this->white->id,
            'gross_weight_kg' => 200_000, 'tare_weight_kg' => 25_000,
        ]);
        $this->production = $this->inventory()->consumeStock($this->white->id, 'production', '2026-01-10', 5,
            fn () => ProductionEntry::create(['date' => '2026-01-10', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 100]));
        $this->wastage = $this->inventory()->consumeStock($this->white->id, 'wastage', '2026-01-12', 2,
            fn () => WastageEntry::create(['date' => '2026-01-12', 'product_id' => $this->white->id, 'quantity_kg' => 2_000]));

        $this->inventory()->closeShipment($this->inventory()->shipmentCycles($this->white->id)->last()['shipment']->id);

        // Cycle 2 opens in March with 50 Ton.
        $this->inventory()->receiveStock([
            'date' => '2026-03-01', 'product_id' => $this->white->id,
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

    private function reverseProduction(array $body = []): TestResponse
    {
        return $this->postJson("/api/production-entries/{$this->production->id}/reverse", $body + ['reason' => 'Wrong mesh', 'date' => '2026-03-10']);
    }

    private function reverseWastage(array $body = []): TestResponse
    {
        return $this->postJson("/api/wastage-entries/{$this->wastage->id}/reverse", $body + ['reason' => 'Double entry', 'date' => '2026-03-10']);
    }

    private function stock(): float
    {
        return $this->inventory()->currentRawStock($this->white->id);
    }

    private function bags(): int
    {
        return $this->inventory()->availableBags($this->white->id, $this->mesh->id);
    }

    /** @return array{0: array, 1: array} [closed cycle 1, open cycle 2] */
    private function cycles(): array
    {
        $cycles = $this->inventory()->shipmentCycles($this->white->id)->values();

        return [$cycles[0], $cycles[1]];
    }

    // ------------------------------------------------------------ blocked

    public function test_production_in_a_closed_cycle_cannot_be_edited_or_deleted(): void
    {
        $this->putJson("/api/production-entries/{$this->production->id}", [
            'date' => '2026-01-10', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 80,
        ])->assertUnprocessable()->assertJsonPath('message', fn (string $m) => str_contains($m, 'closed shipment cycle'));

        $this->deleteJson("/api/production-entries/{$this->production->id}")->assertUnprocessable();

        $this->assertSame(100, $this->production->fresh()->bags);
        $this->assertSame(1, InventoryTransaction::where('source_type', 'production')->count());
        $this->assertEqualsWithDelta(218, $this->stock(), 0.0001); // 175 − 5 − 2 + 50
    }

    public function test_wastage_in_a_closed_cycle_cannot_be_deleted(): void
    {
        $this->deleteJson("/api/wastage-entries/{$this->wastage->id}")->assertUnprocessable();

        $this->assertNotNull($this->wastage->fresh());
        $this->assertSame(1, InventoryTransaction::where('source_type', 'wastage')->count());
    }

    public function test_entries_in_an_open_cycle_keep_normal_edit_and_delete(): void
    {
        $open = $this->inventory()->consumeStock($this->white->id, 'production', '2026-03-05', 1,
            fn () => ProductionEntry::create(['date' => '2026-03-05', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 20]));
        $waste = $this->inventory()->consumeStock($this->white->id, 'wastage', '2026-03-05', 1,
            fn () => WastageEntry::create(['date' => '2026-03-05', 'product_id' => $this->white->id, 'quantity_kg' => 1_000]));

        $this->putJson("/api/production-entries/{$open->id}", [
            'date' => '2026-03-05', 'product_id' => $this->white->id, 'mesh_id' => $this->mesh->id, 'bags' => 40,
        ])->assertOk();
        $this->deleteJson("/api/production-entries/{$open->id}")->assertNoContent();
        $this->deleteJson("/api/wastage-entries/{$waste->id}")->assertNoContent();

        $this->assertEqualsWithDelta(218, $this->stock(), 0.0001);
    }

    // ------------------------------------------------------------ production reversal

    public function test_production_reversal_keeps_the_entry_and_returns_stock_in_the_open_cycle(): void
    {
        [$closedBefore] = $this->cycles();
        $this->assertSame(100, $this->bags());

        $this->reverseProduction()->assertOk()
            ->assertJsonPath('id', $this->production->id)
            ->assertJsonPath('reversed_on', '2026-03-10')
            ->assertJsonPath('reversal_reason', 'Wrong mesh');

        $entry = $this->production->fresh();
        $this->assertSame(100, $entry->bags, 'original kept');
        $this->assertSame('2026-01-10', $entry->date->toDateString());
        $this->assertNotNull($entry->reversed_by_user_id);
        $this->assertSame(1, InventoryTransaction::where('source_type', 'production')->count(), 'original OUT kept');

        // Raw stock: the 5 Ton come back, in the open cycle only.
        $this->assertEqualsWithDelta(223, $this->stock(), 0.0001);
        [$closed, $open] = $this->cycles();
        $this->assertSame($closedBefore['closing_ton'], $closed['closing_ton']);
        $this->assertEqualsWithDelta(5, $closed['consumed_ton'], 0.001);
        $this->assertEqualsWithDelta(-5, $open['consumed_ton'], 0.001);
        $this->assertEqualsWithDelta(223, $open['closing_ton'], 0.001);
        $this->assertEqualsWithDelta(168, $this->inventory()->currentRawStock($this->white->id, '2026-02-28'), 0.0001);

        // Bag stock: the 100 bags come back out on the reversal date.
        $this->assertSame(0, $this->bags());

        $movement = InventoryTransaction::where('source_type', 'production_reversal')->sole();
        $this->assertSame('in', $movement->direction);
        $this->assertSame($this->production->id, $movement->source_id);
        $this->assertEqualsWithDelta(5, $movement->quantity_ton, 0.001);

        $log = AuditLog::where('entity_id', $this->production->id)->where('action', 'REVERSE')->sole();
        $this->assertSame('Wrong mesh', $log->reason);
    }

    public function test_production_reversal_is_refused_when_its_bags_were_sold(): void
    {
        Account::create(['name' => 'Cash', 'kind' => 'cash', 'system' => true]);
        $this->postJson('/api/sales', [
            'date' => '2026-02-01', 'customer_id' => Customer::factory()->create()->id,
            'items' => [['product_id' => $this->white->id, 'mesh_size_id' => $this->mesh->id, 'bags' => 60, 'rate_per_ton' => 2_000]],
        ])->assertCreated();

        $this->reverseProduction()->assertUnprocessable()
            ->assertJsonPath('message', fn (string $m) => str_contains($m, 'already been sold'));

        $this->assertNull($this->production->fresh()->reversed_on);
        $this->assertSame(0, InventoryTransaction::where('source_type', 'production_reversal')->count());
        $this->assertEqualsWithDelta(218, $this->stock(), 0.0001);
        $this->assertSame(40, $this->bags());
    }

    // ------------------------------------------------------------ wastage reversal

    public function test_wastage_reversal_keeps_the_entry_and_returns_stock_in_the_open_cycle(): void
    {
        $this->reverseWastage()->assertOk()->assertJsonPath('reversed_on', '2026-03-10');

        $this->assertEqualsWithDelta(2_000, $this->wastage->fresh()->quantity_kg, 0.001);
        $this->assertEqualsWithDelta(220, $this->stock(), 0.0001);

        [$closed, $open] = $this->cycles();
        $this->assertEqualsWithDelta(2, $closed['wastage_ton'], 0.001);
        $this->assertEqualsWithDelta(-2, $open['wastage_ton'], 0.001);
        $this->assertSame(100, $this->bags(), 'wastage never touches bags');

        $summary = $this->inventory()->rawStockSummary($this->white->id, '2026-03-01', '2026-03-31');
        $this->assertEqualsWithDelta(-2, $summary['wastage_ton'], 0.001);
        $this->assertEqualsWithDelta(220, $summary['current_raw_stock_ton'], 0.001);

        $this->assertSame(1, InventoryTransaction::where('source_type', 'wastage_reversal')->count());
        $this->assertTrue(AuditLog::where('entity_id', $this->wastage->id)->where('action', 'REVERSE')->exists());
    }

    // ------------------------------------------------------------ guards

    public function test_only_admins_can_reverse(): void
    {
        foreach (['Manager', 'Staff'] as $role) {
            $this->actingAsRole($role);
            $this->reverseProduction()->assertForbidden();
            $this->reverseWastage()->assertForbidden();
        }

        $this->assertNull($this->production->fresh()->reversed_on);
        $this->assertNull($this->wastage->fresh()->reversed_on);
    }

    public function test_reason_and_date_are_validated(): void
    {
        $this->postJson("/api/production-entries/{$this->production->id}/reverse", ['date' => '2026-03-10'])
            ->assertUnprocessable()->assertJsonValidationErrors(['reason']);

        $this->reverseProduction(['date' => '2026-01-09'])->assertUnprocessable();
        $this->reverseWastage(['date' => '2026-02-15'])
            ->assertUnprocessable()
            ->assertJsonPath('message', fn (string $m) => str_contains($m, 'closed shipment cycle'));

        $this->assertSame(0, InventoryTransaction::whereIn('source_type', ['production_reversal', 'wastage_reversal'])->count());
        $this->assertEqualsWithDelta(218, $this->stock(), 0.0001);
    }

    public function test_a_reversed_entry_is_locked(): void
    {
        $this->reverseProduction()->assertOk();
        $this->reverseWastage()->assertOk();

        $this->reverseProduction()->assertUnprocessable();
        $this->reverseWastage()->assertUnprocessable();
        $this->deleteJson("/api/production-entries/{$this->production->id}")->assertUnprocessable();
        $this->deleteJson("/api/wastage-entries/{$this->wastage->id}")->assertUnprocessable();

        $this->assertEqualsWithDelta(225, $this->stock(), 0.0001);
        $this->assertSame(1, InventoryTransaction::where('source_type', 'production_reversal')->count());
    }
}
