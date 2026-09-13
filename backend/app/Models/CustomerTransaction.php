<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * One row of the receivables ledger. Balance is never stored — it's the running
 * (debit - credit) ordered by (date, id), computed by CustomerLedgerService.
 */
class CustomerTransaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_id', 'date', 'type', 'reference', 'description',
        'debit', 'credit', 'reference_sale_id', 'linked_account_id', 'method',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'debit' => 'float',
            'credit' => 'float',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'reference_sale_id');
    }

    public function linkedAccount(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'linked_account_id');
    }

    /** The Cash & Bank row this payment was posted into, when one was written. */
    public function cashTransaction(): HasOne
    {
        return $this->hasOne(Transaction::class);
    }
}
