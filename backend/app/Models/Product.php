<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'code', 'description', 'unit', 'active'];

    protected function casts(): array
    {
        return ['active' => 'boolean'];
    }

    public function imports(): HasMany
    {
        return $this->hasMany(RawMaterialImport::class);
    }

    public function wastageEntries(): HasMany
    {
        return $this->hasMany(WastageEntry::class);
    }

    public function productionEntries(): HasMany
    {
        return $this->hasMany(ProductionEntry::class);
    }

    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function inventoryTransactions(): HasMany
    {
        return $this->hasMany(InventoryTransaction::class);
    }
}
