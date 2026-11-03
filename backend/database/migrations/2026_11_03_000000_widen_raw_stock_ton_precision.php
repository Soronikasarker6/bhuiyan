<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Raw sale lines hold tons to 5 decimals (net kg with 2 decimals ÷ 1000), and
 * wastage/production can produce up to 6 (kg with 3 decimals ÷ 1000). The raw
 * stock audit ledger and the frozen closed-shipment snapshot were DECIMAL(15,3),
 * so they quietly rounded those fractions away. Widen them to 6 decimals so
 * every ton figure keeps exactly what was recorded.
 *
 * Existing rows are not recomputed: anything already stored was rounded to 3
 * decimals and stays as it is. The live stock figures never read these
 * columns — they are recomputed from the source logs — except a closed
 * shipment's snapshot, which is deliberately frozen.
 */
return new class extends Migration
{
    private const SHIPMENT_COLUMNS = [
        'closing_opening_ton', 'closing_received_ton', 'closing_consumed_ton',
        'closing_wastage_ton', 'closing_raw_sale_ton', 'closing_closing_ton',
    ];

    public function up(): void
    {
        $this->resize(18, 6);
    }

    public function down(): void
    {
        $this->resize(15, 3);
    }

    private function resize(int $precision, int $scale): void
    {
        Schema::table('inventory_transactions', function (Blueprint $table) use ($precision, $scale) {
            $table->decimal('quantity_ton', $precision, $scale)->change();
            $table->decimal('balance_after_ton', $precision, $scale)->change();
        });

        Schema::table('shipments', function (Blueprint $table) use ($precision, $scale) {
            foreach (self::SHIPMENT_COLUMNS as $column) {
                $table->decimal($column, $precision, $scale)->nullable()->change();
            }
        });
    }
};
