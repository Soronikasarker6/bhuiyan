<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** No "sell" column here — sell figures are always derived from SaleItem. */
class ProductionEntry extends Model
{
    use HasFactory;

    protected $fillable = ['date', 'product_id', 'mesh_id', 'bags', 'notes'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
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
