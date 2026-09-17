<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Superseded by `company_cost_selections` — Company Costs is now a
     * per-category choice for the month, not a flag on each transaction.
     * The previous migration already carried forward every row this flag
     * marked true, so nothing here changes what Net Profit reports.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropColumn('is_company_cost');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->boolean('is_company_cost')->default(false)->after('amount');
        });
    }
};
