<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    use HasFactory;

    protected $fillable = ['name', 'phone', 'address', 'company', 'opening_balance', 'notes', 'active'];

    protected function casts(): array
    {
        return [
            'opening_balance' => 'float',
            'active' => 'boolean',
        ];
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(CustomerTransaction::class);
    }
}
