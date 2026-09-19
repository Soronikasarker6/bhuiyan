<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One weighbridge receipt of raw material — gross in, tare out. Belongs to
 * exactly one `Shipment` (the inventory cycle it accumulated into); see
 * App\Services\InventoryService for how imports join an open shipment, and
 * `Shipment` for the opening/received/consumed/closing chain itself.
 */
class RawMaterialImport extends Model
{
    use HasFactory;

    protected $fillable = [
        'shipment_id', 'date', 'product_id', 'ship_name', 'serial_no', 'truck_no',
        'gross_weight_kg', 'tare_weight_kg', 'price_per_ton', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'gross_weight_kg' => 'float',
            'tare_weight_kg' => 'float',
            'price_per_ton' => 'float',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    public function isClosed(): bool
    {
        return $this->shipment?->isClosed() ?? false;
    }

    /** Never negative — a mis-keyed tare heavier than gross reads as zero net weight. */
    public function netWeightKg(): float
    {
        return max(0.0, (float) $this->gross_weight_kg - (float) $this->tare_weight_kg);
    }

    public function netWeightTon(): float
    {
        return $this->netWeightKg() / 1000;
    }

    public function value(): ?float
    {
        if ($this->price_per_ton === null) {
            return null;
        }

        return $this->netWeightTon() * (float) $this->price_per_ton;
    }

    /**
     * Shapes this import like the frontend's ImportRow/RawMaterialImport,
     * used by every endpoint that returns import entries (bootstrap
     * included) so the frontend's mapper sees one consistent shape
     * everywhere. Cycle status/closing figures live on the parent
     * `Shipment` now — see `ShipmentCycleController` / `AppDataController`
     * for the `shipmentCycles` collection those come from.
     */
    public function toPresentedArray(): array
    {
        return array_merge($this->toArray(), [
            'product_name' => $this->product?->name,
            'net_weight_kg' => $this->netWeightKg(),
            'net_weight_ton' => $this->netWeightTon(),
            'value' => $this->value(),
        ]);
    }
}
