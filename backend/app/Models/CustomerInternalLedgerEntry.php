<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of the owner's private bookkeeping ledger.
 *
 * Not to be confused with {@see CustomerTransaction}, which is the
 * operational receivables ledger behind Customer Due, Advance, Cash In and
 * every customer report. Nothing here feeds any of those; see the migration
 * for why the two are separate.
 *
 * An entry carries a debit or a credit, never both (enforced in the request
 * validation), and never zero on both sides.
 */
class CustomerInternalLedgerEntry extends Model
{
    protected $table = 'customer_internal_ledger_entries';

    protected $fillable = ['customer_id', 'date', 'details', 'reference', 'debit', 'credit'];

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

    /** Positive moves the balance toward "they owe us", matching the receivables convention. */
    public function signedAmount(): float
    {
        return (float) $this->debit - (float) $this->credit;
    }

    /** ILG-000123 — the handle the audit trail names this entry by. */
    public function getReferenceLabelAttribute(): string
    {
        return 'ILG-'.str_pad((string) $this->id, 6, '0', STR_PAD_LEFT);
    }
}
