<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A row's presence means "this category counts toward Company Costs for
     * this month" — replacing the old per-transaction `is_company_cost` flag
     * with a per-(month, category) choice, which is what the Profit & Loss
     * picker now offers. Unique on (month_key, category_id): checking a
     * category writes one row, unchecking it removes that row, never more
     * than one per month per category.
     */
    public function up(): void
    {
        Schema::create('company_cost_selections', function (Blueprint $table) {
            $table->id();
            $table->string('month_key');
            $table->foreignId('category_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['month_key', 'category_id']);
        });

        // Backfill so already-reported Net Profit figures carry forward: any
        // (month, category) that had at least one Cash Out transaction
        // explicitly marked a company cost under the old per-transaction
        // scheme is selected under the new per-category one.
        $monthExpr = DB::connection()->getDriverName() === 'sqlite'
            ? "strftime('%Y-%m', date)"
            : "DATE_FORMAT(date, '%Y-%m')";

        $rows = DB::table('transactions')
            ->where('direction', 'out')
            ->where('is_company_cost', true)
            ->whereNotNull('category_id')
            ->selectRaw("{$monthExpr} as month_key, category_id")
            ->distinct()
            ->get();

        $now = now();
        foreach ($rows as $row) {
            DB::table('company_cost_selections')->insertOrIgnore([
                'month_key' => $row->month_key,
                'category_id' => $row->category_id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('company_cost_selections');
    }
};
