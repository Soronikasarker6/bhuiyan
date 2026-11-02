<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** No "sell" column here — sell figures are always derived from SaleItem. */
class ProductionEntry extends Model
{
    use HasFactory;

    protected $fillable = [
        'date', 'product_id', 'mesh_id', 'bags', 'notes',
        'reversed_on', 'reversed_at', 'reversed_by_user_id', 'reversal_reason',
    ];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d', 'reversed_on' => 'date:Y-m-d', 'reversed_at' => 'datetime'];
    }

    /** Raw tons this entry consumed — bags × bag weight. */
    public function quantityTon(): float
    {
        return ((float) $this->bags * (float) $this->mesh->bag_kg) / 1000;
    }

    public function isReversed(): bool
    {
        return $this->reversed_on !== null;
    }


    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function mesh(): BelongsTo
    {
        return $this->belongsTo(MeshSize::class, 'mesh_id');
    }
}
