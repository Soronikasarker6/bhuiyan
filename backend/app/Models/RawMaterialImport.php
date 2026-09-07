<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row = one shipment = one inventory cycle for its product. See
 * App\Services\InventoryService for the opening/received/consumed/closing chain.
 */
class RawMaterialImport extends Model
{
    use HasFactory;

    protected $fillable = [
        'date', 'product_id', 'ship_name', 'serial_no', 'truck_no',
        'gross_weight_kg', 'tare_weight_kg', 'price_per_ton', 'notes', 'status',
        'closing_opening_ton', 'closing_received_ton', 'closing_consumed_ton',
        'closing_closing_ton', 'closing_closed_at',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'gross_weight_kg' => 'float',
            'tare_weight_kg' => 'float',
            'price_per_ton' => 'float',
            'closing_opening_ton' => 'float',
            'closing_received_ton' => 'float',
            'closing_consumed_ton' => 'float',
            'closing_closing_ton' => 'float',
            'closing_closed_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function isClosed(): bool
    {
        return $this->status === 'closed';
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
     * Shapes this shipment like the frontend's ImportRow/RawMaterialImport —
     * the frozen closing_* columns nested under `closing` (null while open),
     * used by every endpoint that returns shipments (bootstrap included) so
     * the frontend's mapper sees one consistent shape everywhere.
     */
    public function toPresentedArray(): array
    {
        $closing = $this->isClosed() ? [
            'opening_ton' => (float) $this->closing_opening_ton,
            'received_ton' => (float) $this->closing_received_ton,
            'consumed_ton' => (float) $this->closing_consumed_ton,
            'closing_ton' => (float) $this->closing_closing_ton,
            'closed_at' => optional($this->closing_closed_at)->toIso8601String(),
        ] : null;

        return array_merge($this->toArray(), [
            'product_name' => $this->product?->name,
            'net_weight_kg' => $this->netWeightKg(),
            'net_weight_ton' => $this->netWeightTon(),
            'value' => $this->value(),
            'closing' => $closing,
        ]);
    }
}
