<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Append-only audit log — see App\Services\InventoryService for how it's written. */
class InventoryTransaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id', 'direction', 'source_type', 'source_id',
        'quantity_ton', 'balance_after_ton', 'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'quantity_ton' => 'float',
            'balance_after_ton' => 'float',
            'occurred_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
