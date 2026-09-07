<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LedgerClosingBalance extends Model
{
    use HasFactory;

    protected $fillable = ['ledger_closing_id', 'account_id', 'account_name', 'kind', 'balance'];

    protected function casts(): array
    {
        return ['balance' => 'float'];
    }

    public function ledgerClosing(): BelongsTo
    {
        return $this->belongsTo(LedgerClosing::class);
    }
}
