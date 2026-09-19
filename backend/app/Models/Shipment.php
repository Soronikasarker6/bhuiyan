<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One raw material's inventory cycle. At most one row per product is
 * `open` at a time — every import received while it's open belongs to it
 * (see `imports()`); closing freezes the four `closing_*` columns
 * permanently. This row's own id is the "Shipment ID" shown on screen —
 * see App\Services\InventoryService for the open/close/accumulate rules.
 */
class Shipment extends Model
{
    protected $fillable = [
        'product_id', 'opened_on', 'status',
        'closing_opening_ton', 'closing_received_ton', 'closing_consumed_ton',
        'closing_wastage_ton', 'closing_closing_ton', 'closing_closed_at',
    ];

    protected function casts(): array
    {
        return [
            'opened_on' => 'date:Y-m-d',
            'closing_opening_ton' => 'float',
            'closing_received_ton' => 'float',
            'closing_consumed_ton' => 'float',
            'closing_wastage_ton' => 'float',
            'closing_closing_ton' => 'float',
            'closing_closed_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function imports(): HasMany
    {
        return $this->hasMany(RawMaterialImport::class);
    }

    public function isClosed(): bool
    {
        return $this->status === 'closed';
    }

    public function toPresentedArray(): array
    {
        $closing = $this->isClosed() ? [
            'opening_ton' => (float) $this->closing_opening_ton,
            'received_ton' => (float) $this->closing_received_ton,
            'consumed_ton' => (float) $this->closing_consumed_ton,
            'wastage_ton' => (float) $this->closing_wastage_ton,
            'closing_ton' => (float) $this->closing_closing_ton,
            'closed_at' => optional($this->closing_closed_at)->toIso8601String(),
        ] : null;

        return array_merge($this->toArray(), [
            'product_name' => $this->product?->name,
            'closing' => $closing,
        ]);
    }
}
