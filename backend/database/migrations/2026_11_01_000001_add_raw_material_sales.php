<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Raw limestone sold straight from the yard, without going through
     * production — a second kind of sale on the same invoice/ledger rails.
     *
     * - `sales.sale_type` tells the two apart. Every existing row is a
     *   finished-product sale, which is what the default says.
     * - A raw material sale has one line with no mesh size and no bags: its
     *   billable weight is the weighbridge net (gross − tare on the sale
     *   header), held in `actual_weight_ton`. That column widens to 5
     *   decimals so a kg figure with 2 decimals converts to tons exactly.
     * - `inventory_transactions.source_type` gains `raw_material_sale` — a
     *   raw-stock OUT of its own, never filed as production or wastage.
     * - A closed shipment freezes its raw-sale tonnage beside the
     *   production and wastage it already freezes (null on cycles closed
     *   before this existed — read as 0).
     */
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->string('sale_type', 20)->default('finished_product')->after('customer_id')->index();
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->foreignId('mesh_size_id')->nullable()->change();
            $table->decimal('actual_weight_ton', 16, 5)->nullable()->change();
        });

        Schema::table('inventory_transactions', function (Blueprint $table) {
            $table->enum('source_type', ['shipment', 'production', 'wastage', 'raw_material_sale'])->change();
        });

        Schema::table('shipments', function (Blueprint $table) {
            $table->decimal('closing_raw_sale_ton', 15, 3)->nullable()->after('closing_wastage_ton');
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->dropColumn('closing_raw_sale_ton');
        });

        Schema::table('inventory_transactions', function (Blueprint $table) {
            $table->enum('source_type', ['shipment', 'production', 'wastage'])->change();
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->foreignId('mesh_size_id')->nullable(false)->change();
            $table->decimal('actual_weight_ton', 15, 3)->nullable()->change();
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->dropIndex(['sale_type']);
            $table->dropColumn('sale_type');
        });
    }
};
