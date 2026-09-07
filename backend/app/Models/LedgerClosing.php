<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LedgerClosing extends Model
{
    use HasFactory;

    protected $fillable = [
        'month_key', 'month', 'year', 'cash_total', 'bank_total', 'grand_total',
        'month_in', 'month_out', 'net_movement', 'closed_at',
    ];

    protected function casts(): array
    {
        return [
            'cash_total' => 'float',
            'bank_total' => 'float',
            'grand_total' => 'float',
            'month_in' => 'float',
            'month_out' => 'float',
            'net_movement' => 'float',
            'closed_at' => 'datetime',
        ];
    }

    public function balances(): HasMany
    {
        return $this->hasMany(LedgerClosingBalance::class);
    }
}
