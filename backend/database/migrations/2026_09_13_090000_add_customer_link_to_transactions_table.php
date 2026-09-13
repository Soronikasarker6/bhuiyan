<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Links a Cash & Bank "money in" row back to the customer payment it *is*.
     *
     * A customer payment is one business event with two ledger consequences —
     * the cash account goes up, the customer's due goes down — and it has
     * always been written as two rows (see CustomerLedgerService::recordPayment).
     * Until now only the receivables row knew about the pairing, via
     * linked_account_id, so the cash row could be deleted on its own and leave
     * the customer credited for money that no longer exists anywhere.
     *
     * customer_transaction_id makes that pairing symmetric: deleting either row
     * now removes both. customer_id is denormalised alongside it purely so the
     * cash register can show and filter by customer without a second join.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->foreignId('customer_id')->nullable()->after('reference_sale_id')
                ->constrained()->nullOnDelete();
            $table->foreignId('customer_transaction_id')->nullable()->after('customer_id')
                ->constrained('customer_transactions')->cascadeOnDelete();

            $table->index('customer_id');
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropForeign(['customer_transaction_id']);
            $table->dropColumn('customer_transaction_id');
            $table->dropIndex(['customer_id']);
            $table->dropForeign(['customer_id']);
            $table->dropColumn('customer_id');
        });
    }
};
