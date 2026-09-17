<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Profit & Loss's "Company Costs" now selects whole categories, not
     * individual transactions — but not every Cash Out category is an
     * operating expense (a transfer to the bank isn't a cost, a loan
     * repayment isn't a cost). This attribute is what keeps those out of the
     * P&L picker entirely rather than relying on someone noticing and
     * leaving them unchecked. Meaningless for direction='in' categories,
     * left null there.
     *
     * Existing direction='out' categories are backfilled by name: the
     * handful that are transfers, financing or related-party movements
     * (rather than a real business cost) are marked 'excluded'; everything
     * else defaults to 'company_expense', same as every new category from
     * here on unless someone picks Excluded for it in Settings.
     */
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->string('expense_type')->nullable()->after('direction');
        });

        DB::table('categories')->where('direction', 'out')->update(['expense_type' => 'company_expense']);

        // Exact names only — a keyword/substring match (e.g. "profit") would
        // also catch a real operating-expense category that merely happens
        // to contain that word (a "Profit Sharing Bonus" payroll line is a
        // real cost, not a transfer). Matches the Excluded set the fresh
        // seeder ships (see CategorySeeder), plus the common loan/debt
        // repayment names existing data is likely to use.
        $excludedNames = [
            'bank to cash', 'cash to bank', 'bank loan repayment',
            'debt repayment', 'loan repayment',
        ];

        DB::table('categories')->where('direction', 'out')->get(['id', 'name'])->each(function ($category) use ($excludedNames) {
            $name = mb_strtolower(trim($category->name));

            if (in_array($name, $excludedNames, true)) {
                DB::table('categories')->where('id', $category->id)->update(['expense_type' => 'excluded']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropColumn('expense_type');
        });
    }
};
