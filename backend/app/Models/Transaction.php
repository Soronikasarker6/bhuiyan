<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * The Cash & Bank ledger — separate from CustomerTransaction. Balance per account
 * is never stored — it's the running (in - out) computed by LedgerService. A
 * transfer between two accounts is two rows sharing transfer_id.
 *
 * A row with customer_transaction_id set is the cash half of a customer payment:
 * the money arriving here is the same event as the customer's due going down, so
 * the two rows are written together and deleted together, never one alone.
 *
 * Removing an entry is a *void*, not a delete (see the SoftDeletes trait): it
 * leaves the active register — every existing query here and in LedgerService
 * gets that for free from the global scope — while the original figures stay
 * on the row behind the audit trail's VOID event.
 */
class Transaction extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'date', 'details', 'account_id', 'direction', 'category_id',
        'category_name', 'amount', 'transfer_id', 'reference_sale_id',
        'customer_id', 'customer_transaction_id',
        'voided_by_user_id', 'void_reason',
    ];

    /**
     * Appended so the audit trail, the ledger table and a void confirmation
     * all name an entry the same way — and so that name is in the row's own
     * JSON, which is what before/after snapshots are built from.
     */
    protected $appends = ['reference'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'amount' => 'float',
        ];
    }

    /**
     * The stable, human reference for one ledger entry — TX-000123.
     *
     * Derived from the primary key rather than stored, because the whole
     * point is that it never changes: editing an entry updates it in place
     * (§13 of the audit brief), it is never deleted-and-recreated, so the id
     * it is derived from is fixed for the life of the record.
     */
    public function getReferenceAttribute(): string
    {
        return self::referenceFor($this->id);
    }

    public static function referenceFor(int|string|null $id): string
    {
        return 'TX-'.str_pad((string) ($id ?? 0), 6, '0', STR_PAD_LEFT);
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
