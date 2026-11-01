<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Production and wastage entries inside a closed shipment cycle can no
     * longer be edited or deleted — that cycle's frozen figures would stop
     * matching the logs behind them. An Admin reverses one instead, exactly
     * like a raw material sale: the entry stays as it was, marked reversed,
     * and the reversal returns its tons on the reversal date (and, for
     * production, takes its bags back out of bag stock) with a
     * `*_reversal` stock IN row of its own.
     *
     * `reversal_reason` rather than `reason`: wastage already has a `reason`
     * column — why the stone was wasted — which this must not be confused with.
     */
    public function up(): void
    {
        foreach (['production_entries', 'wastage_entries'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->date('reversed_on')->nullable();
                $table->timestamp('reversed_at')->nullable();
                $table->foreignId('reversed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('reversal_reason', 500)->nullable();
            });
        }

        Schema::table('inventory_transactions', function (Blueprint $table) {
            $table->enum('source_type', [
                'shipment', 'production', 'wastage', 'raw_material_sale', 'raw_material_sale_reversal',
                'production_reversal', 'wastage_reversal',
            ])->change();
        });
    }

    public function down(): void
    {
        Schema::table('inventory_transactions', function (Blueprint $table) {
            $table->enum('source_type', [
                'shipment', 'production', 'wastage', 'raw_material_sale', 'raw_material_sale_reversal',
            ])->change();
        });

        foreach (['production_entries', 'wastage_entries'] as $table) {
            Schema::table($table, function (Blueprint $table) {
                $table->dropConstrainedForeignId('reversed_by_user_id');
                $table->dropColumn(['reversed_on', 'reversed_at', 'reversal_reason']);
            });
        }
    }
};
