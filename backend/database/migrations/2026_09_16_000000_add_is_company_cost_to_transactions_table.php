<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Profit & Loss's "Company Costs" used to be 100% of a month's Cash Out
     * movement, automatically. It is now an explicit selection of Cash Out
     * transactions per the business's own judgement (customer payments were
     * never included — this only ever touches direction='out' rows).
     *
     * Existing Cash Out rows are backfilled to true so historical Net Profit
     * figures already reported are unchanged by this migration; anyone can
     * still uncheck them from the Profit & Loss page afterwards. Every new
     * Cash Out transaction created from this point on defaults to false and
     * must be explicitly selected.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->boolean('is_company_cost')->default(false)->after('amount');
        });

        DB::table('transactions')->where('direction', 'out')->update(['is_company_cost' => true]);
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn('is_company_cost');
        });
    }
};
