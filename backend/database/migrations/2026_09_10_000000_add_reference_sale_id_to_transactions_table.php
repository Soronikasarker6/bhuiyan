<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Set only on the one Cash & Bank ledger row a sale's "paid at sale"
     * amount posts (mirrors customer_transactions.reference_sale_id) — so
     * deleting that sale can remove its cash-ledger entry too, the same way
     * it already removes the matching customer-ledger entry, and no orphaned
     * cash-in survives an invoice being deleted.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->foreignId('reference_sale_id')->nullable()->after('transfer_id')
                ->constrained('sales')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reference_sale_id');
        });
    }
};
