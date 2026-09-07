<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The receivables ledger. Balance = running (debit - credit) ordered by
     * (date, id) — never stored. A sale posts a debit row (+ a linked credit "payment"
     * row if anything was paid at sale time); a negative running balance is simply
     * displayed as customer advance, there is no separate advance pool table.
     */
    public function up(): void
    {
        Schema::create('customer_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->date('date');
            $table->enum('type', [
                'sale', 'payment', 'advance', 'advance_adjustment', 'refund', 'opening_balance', 'other',
            ]);
            $table->string('reference');
            $table->string('description')->nullable();
            $table->decimal('debit', 14, 2)->default(0);
            $table->decimal('credit', 14, 2)->default(0);
            $table->foreignId('reference_sale_id')->nullable()->constrained('sales')->cascadeOnDelete();
            $table->foreignId('linked_account_id')->nullable()->constrained('accounts')->nullOnDelete();
            $table->string('method')->nullable();
            $table->timestamps(3);

            $table->index(['customer_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_transactions');
    }
};
