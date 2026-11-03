<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Gross and tare weight are not part of how the business sells: a truck's
     * load is recorded directly as its net weight, which is edited at billing
     * and stored as each line's billable ton (`sale_items.actual_weight_ton`).
     * The two columns added by 2026_11_01_000000 are therefore removed.
     *
     * Dropped only while empty. If any sale was recorded with a gross/tare
     * value in the meantime, the columns are left in place (and logged) so no
     * entered figure is silently destroyed — the application no longer reads
     * or writes them either way.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('sales', 'gross_weight_kg') && ! Schema::hasColumn('sales', 'tare_weight_kg')) {
            return;
        }

        $inUse = DB::table('sales')->whereNotNull('gross_weight_kg')->orWhereNotNull('tare_weight_kg')->count();
        if ($inUse > 0) {
            Log::warning("sales.gross_weight_kg / tare_weight_kg kept: {$inUse} sale(s) hold values. They are no longer used by the application.");

            return;
        }

        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['gross_weight_kg', 'tare_weight_kg']);
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('sales', 'gross_weight_kg')) {
            return;
        }

        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('gross_weight_kg', 12, 2)->nullable()->after('truck_no');
            $table->decimal('tare_weight_kg', 12, 2)->nullable()->after('gross_weight_kg');
        });
    }
};
