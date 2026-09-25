<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One party's opening balance in the owner's private ledger.
 *
 * Deliberately its own row rather than a transaction dated before everything
 * else: an opening balance is a starting position, not something that
 * happened, and modelling it as a fake entry would let it be edited, filtered
 * out by a date range or deleted like an ordinary line.
 *
 * Signed the same way the entries are: positive means the party owes us.
 *
 * Separate from `customers.opening_balance`, which belongs to the operational
 * receivables ledger and posts a real OPN row there. Sharing one number would
 * mean an edit in the owner's private book moved a customer's actual due,
 * which is exactly what this ledger must never do.
 */
class CustomerInternalLedgerOpening extends Model
{
    protected $table = 'customer_internal_ledger_openings';

    protected $fillable = ['customer_id', 'opening_balance', 'as_of', 'notes'];

    protected function casts(): array
    {
        return [
            'opening_balance' => 'float',
            'as_of' => 'date:Y-m-d',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
