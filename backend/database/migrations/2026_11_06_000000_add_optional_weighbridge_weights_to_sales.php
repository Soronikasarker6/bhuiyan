<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Optional weighbridge readings on a raw material sale. They are a record
     * only: the net weight entered at billing (stored as the line's
     * `sale_items.actual_weight_ton`) stays the single figure billed and
     * deducted from raw stock. Nullable, so every existing sale — and every
     * sale entered by net weight alone — reads as "not recorded".
     *
     * 2026_11_02_000001 may have left these columns in place (it only drops
     * them while empty), so each is added only if missing.
     */
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            if (! Schema::hasColumn('sales', 'gross_weight_kg')) {
                $table->decimal('gross_weight_kg', 12, 2)->nullable()->after('truck_no');
            }
            if (! Schema::hasColumn('sales', 'tare_weight_kg')) {
                $table->decimal('tare_weight_kg', 12, 2)->nullable()->after('gross_weight_kg');
            }
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['gross_weight_kg', 'tare_weight_kg']);
        });
    }
};
