<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Deleting money is not the same as it never having happened.
     *
     * Both financial ledgers switch from a hard delete to a void: the row
     * leaves the active register (Eloquent's SoftDeletes scope does that for
     * every existing query, unchanged) but the original figures survive, so
     * the audit trail's before_data has something real behind it and a
     * mistaken void is recoverable rather than retyped from memory.
     *
     * `voided_by_user_id` / `void_reason` are a convenience on the row itself
     * for the "who removed this and why" question the ledger screens ask; the
     * authoritative record is still the VOID audit event, which also carries
     * the full before-snapshot.
     *
     * Note on the existing cascade: `transactions.customer_transaction_id`
     * cascades on delete, which only ever fires on a *hard* delete. Now that
     * neither table is hard-deleted from application code, the two legs of a
     * customer payment are voided together explicitly in
     * CustomerLedgerService / LedgerService instead. A sale being deleted
     * still hard-deletes through its own `reference_sale_id` cascades exactly
     * as before -- sales are unchanged by this migration.
     */
    public function up(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->softDeletes();
            $table->foreignId('voided_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('void_reason')->nullable();
        });

        Schema::table('customer_transactions', function (Blueprint $table) {
            $table->softDeletes();
            $table->foreignId('voided_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('void_reason')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('voided_by_user_id');
            $table->dropColumn(['deleted_at', 'void_reason']);
        });

        Schema::table('customer_transactions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('voided_by_user_id');
            $table->dropColumn(['deleted_at', 'void_reason']);
        });
    }
};
