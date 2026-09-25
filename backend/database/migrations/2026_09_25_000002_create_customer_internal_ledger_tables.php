<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The owner's private bookkeeping ledger — deliberately separate from
     * `customer_transactions`.
     *
     * `customer_transactions` is the *operational* receivables ledger: it is
     * written by sales and payments, and it is what Customer Due, Advance,
     * the Cash In screen, P&L and every customer report read. Nothing in this
     * table touches any of that. These two tables share only the customer
     * they point at.
     *
     * Keeping them apart is the whole point. An owner correcting a private
     * note must not move a customer's due; a sale must not appear in the
     * owner's private book unless the owner writes it there.
     *
     * Convention, matching the receivables ledger this system already has
     * (see CustomerLedgerService): balance = running (debit - credit),
     * positive means the party owes us (Dr), negative means they are ahead
     * (Cr). The running balance is never stored — it is derived in date order
     * from the opening balance, so a stored figure can never drift from the
     * entries behind it.
     */
    public function up(): void
    {
        Schema::create('customer_internal_ledger_entries', function (Blueprint $table) {
            $table->id();
            // restrictOnDelete, not cascade: a customer being removed from the
            // master list must never silently delete the owner's own book.
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->date('date');
            $table->string('details');
            // The owner's own reference — an invoice number, a cheque number,
            // a note. Free text on purpose: it points at whatever the owner
            // filed it under, which is not necessarily a record in this system.
            $table->string('reference')->nullable();
            $table->decimal('debit', 14, 2)->default(0);
            $table->decimal('credit', 14, 2)->default(0);
            $table->timestamps(3);

            // The one query this table exists to answer: one party's entries
            // in date order.
            $table->index(['customer_id', 'date']);
            $table->index('date');
        });

        // One opening balance per party, as a real opening balance rather than
        // a fabricated transaction dated "before everything" — so it can never
        // be edited, filtered or deleted as if it were an ordinary entry.
        Schema::create('customer_internal_ledger_openings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->unique()->constrained()->cascadeOnDelete();
            // Signed, same convention as the entries: positive = the party owes us.
            $table->decimal('opening_balance', 14, 2)->default(0);
            // The date the opening figure is stated as of; shown as the first
            // line of the ledger. Null means "before everything recorded here".
            $table->date('as_of')->nullable();
            $table->string('notes')->nullable();
            $table->timestamps(3);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_internal_ledger_openings');
        Schema::dropIfExists('customer_internal_ledger_entries');
    }
};
