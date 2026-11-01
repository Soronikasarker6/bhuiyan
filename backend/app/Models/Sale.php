<?php

namespace App\Models;

use App\Support\Weighbridge;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    use HasFactory;

    /** Bagged, mesh-wise stock out of production — every sale before raw material sales existed. */
    public const TYPE_FINISHED_PRODUCT = 'finished_product';

    /** Raw limestone sold straight from the yard by weighbridge net weight — deducts raw stock, never bags. */
    public const TYPE_RAW_MATERIAL = 'raw_material';

    public const TYPES = [self::TYPE_FINISHED_PRODUCT, self::TYPE_RAW_MATERIAL];

    /** The inventory_transactions.source_type a raw material sale's stock OUT row is filed under. */
    public const TYPE_RAW_MATERIAL_SOURCE = 'raw_material_sale';

    /** The stock IN row a reversed raw material sale posts on its reversal date. */
    public const TYPE_RAW_MATERIAL_REVERSAL_SOURCE = 'raw_material_sale_reversal';

    protected $fillable = ['invoice_no', 'date', 'customer_id', 'sale_type', 'truck_no', 'gross_weight_kg', 'tare_weight_kg', 'notes', 'paid_at_sale',
        'reversed_on', 'reversed_at', 'reversed_by_user_id', 'reversal_reason'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'paid_at_sale' => 'float',
            'reversed_on' => 'date:Y-m-d',
            'reversed_at' => 'datetime',
            'gross_weight_kg' => 'float',
            'tare_weight_kg' => 'float',
        ];
    }

    /** Gross − tare from the weighbridge slip; null unless both were recorded. Never the billed weight. */
    public function netWeightKg(): ?float
    {
        return Weighbridge::netKg($this->gross_weight_kg, $this->tare_weight_kg);
    }

    public function isReversed(): bool
    {
        return $this->reversed_on !== null;
    }

    public function isRawMaterial(): bool
    {
        return $this->sale_type === self::TYPE_RAW_MATERIAL;
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(CustomerTransaction::class, 'reference_sale_id');
    }
}
