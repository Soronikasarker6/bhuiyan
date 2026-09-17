<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The Cash & Bank ledger — separate from CustomerTransaction. Balance per account
 * is never stored — it's the running (in - out) computed by LedgerService. A
 * transfer between two accounts is two rows sharing transfer_id.
 *
 * A row with customer_transaction_id set is the cash half of a customer payment:
 * the money arriving here is the same event as the customer's due going down, so
 * the two rows are written together and deleted together, never one alone.
 */
class Transaction extends Model
{
    use HasFactory;

    protected $fillable = [
        'date', 'details', 'account_id', 'direction', 'category_id',
        'category_name', 'amount', 'transfer_id', 'reference_sale_id',
        'customer_id', 'customer_transaction_id',
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

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function customerTransaction(): BelongsTo
    {
        return $this->belongsTo(CustomerTransaction::class);
    }

    public function isTransfer(): bool
    {
        return $this->transfer_id !== null;
    }

    /** Whether this row is the cash half of a customer payment. */
    public function isCustomerPayment(): bool
    {
        return $this->customer_transaction_id !== null;
    }

    /** Set only on the row a sale's "paid at sale" amount posted — null for every other transaction. */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'reference_sale_id');
    }
}
