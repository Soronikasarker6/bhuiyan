<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WastageEntry extends Model
{
    use HasFactory;

    protected $fillable = [
        'date', 'product_id', 'quantity_kg', 'reason',
        'reversed_on', 'reversed_at', 'reversed_by_user_id', 'reversal_reason',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'quantity_kg' => 'float',
            'reversed_on' => 'date:Y-m-d',
            'reversed_at' => 'datetime',
        ];
    }

    public function isReversed(): bool
    {
        return $this->reversed_on !== null;
    }


    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function quantityTon(): float
    {
        return (float) $this->quantity_kg / 1000;
    }
}
