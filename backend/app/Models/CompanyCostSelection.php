<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row = one Cash Out category counts toward Profit & Loss's "Company
 * Costs" for one month. Presence, not a boolean column, is the selection —
 * checking a category in the P&L picker writes a row here, unchecking it
 * deletes it. See LedgerService::companyCostCategoryTotals/companyCostsForMonth.
 */
class CompanyCostSelection extends Model
{
    protected $fillable = ['month_key', 'category_id'];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }
}
