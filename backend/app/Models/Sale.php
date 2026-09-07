<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    use HasFactory;

    protected $fillable = ['invoice_no', 'date', 'customer_id', 'truck_no', 'notes', 'paid_at_sale'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'paid_at_sale' => 'float',
        ];
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
