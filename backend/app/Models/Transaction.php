<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The Cash & Bank ledger — separate from CustomerTransaction. Balance per account
 * is never stored — it's the running (in - out) computed by LedgerService. A
 * transfer between two accounts is two rows sharing transfer_id.
 */
class Transaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'date', 'details', 'account_id', 'direction', 'category_id',
        'category_name', 'amount', 'transfer_id',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'amount' => 'float',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function isTransfer(): bool
    {
        return $this->transfer_id !== null;
    }
}
