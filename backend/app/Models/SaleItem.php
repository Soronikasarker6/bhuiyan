<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleItem extends Model
{
    use HasFactory;

    protected $fillable = ['sale_id', 'product_id', 'mesh_size_id', 'bags', 'rate_per_ton', 'actual_weight_ton'];

    protected function casts(): array
    {
        return [
            'rate_per_ton' => 'float',
            'actual_weight_ton' => 'float',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function meshSize(): BelongsTo
    {
        return $this->belongsTo(MeshSize::class);
    }

    /** Theoretical weight from bag count — never billed once an actual reading exists. */
    public function calculatedWeightTon(): float
    {
        return ((float) $this->bags * (float) $this->meshSize->bag_kg) / 1000;
    }

    /** The billable figure: the weighbridge reading if one was taken, else calculated. */
    public function billableWeightTon(): float
    {
        $actual = (float) ($this->actual_weight_ton ?? 0);

        return $actual > 0 ? $actual : $this->calculatedWeightTon();
    }

    public function amount(): float
    {
        return $this->billableWeightTon() * (float) $this->rate_per_ton;
    }
}
