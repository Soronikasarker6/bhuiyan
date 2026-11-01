<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Correcting a sale without rewriting history.
     *
     * A raw material sale inside a closed shipment cycle can no longer be
     * edited or deleted — that cycle's frozen figures would stop matching the
     * logs behind them. An Admin reverses it instead: the sale and every row it
     * posted stay exactly as they were, and the reversal posts its own
     * offsetting entries on the reversal date — a `sale_reversal` credit on the
     * customer ledger and a `raw_material_sale_reversal` stock IN — so the
     * correction lands in the current (open) period and the closed one stays
     * traceable.
     *
     * `reversed_on` is the business date the reversal takes effect;
     * `reversed_at` / `reversed_by_user_id` / `reversal_reason` record who did
     * it and why (the full before/after is in the REVERSE audit event too).
     */
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->date('reversed_on')->nullable()->after('paid_at_sale');
            $table->timestamp('reversed_at')->nullable()->after('reversed_on');
            $table->foreignId('reversed_by_user_id')->nullable()->after('reversed_at')->constrained('users')->nullOnDelete();
            $table->string('reversal_reason', 500)->nullable()->after('reversed_by_user_id');
        });

        Schema::table('customer_transactions', function (Blueprint $table) {
            $table->enum('type', [
                'sale', 'payment', 'advance', 'advance_adjustment', 'refund', 'opening_balance', 'other', 'sale_reversal',
            ])->change();
        });

        Schema::table('inventory_transactions', function (Blueprint $table) {
            $table->enum('source_type', [
                'shipment', 'production', 'wastage', 'raw_material_sale', 'raw_material_sale_reversal',
            ])->change();
        });
    }

    public function down(): void
    {
        Schema::table('inventory_transactions', function (Blueprint $table) {
            $table->enum('source_type', ['shipment', 'production', 'wastage', 'raw_material_sale'])->change();
        });

        Schema::table('customer_transactions', function (Blueprint $table) {
            $table->enum('type', [
                'sale', 'payment', 'advance', 'advance_adjustment', 'refund', 'opening_balance', 'other',
            ])->change();
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reversed_by_user_id');
            $table->dropColumn(['reversed_on', 'reversed_at', 'reversal_reason']);
        });
    }
};
