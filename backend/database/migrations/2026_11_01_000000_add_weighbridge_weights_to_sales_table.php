<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The truck's weighbridge slip — gross in, tare out — for the whole load.
     *
     * Both are nullable and never backfilled: older sales were recorded
     * without a slip, and an invented figure would be worse than a blank.
     * Net is never stored; it is always `gross - tare`, the same rule raw
     * material imports follow.
     *
     * This is a record of what the truck carried, not what was billed. The
     * billable tonnage stays on `sale_items` (actual_weight_ton, or bags ×
     * bag weight) and remains the only figure amounts, ledgers and stock read.
     */
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('gross_weight_kg', 12, 2)->nullable()->after('truck_no');
            $table->decimal('tare_weight_kg', 12, 2)->nullable()->after('gross_weight_kg');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['gross_weight_kg', 'tare_weight_kg']);
        });
    }
};
