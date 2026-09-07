<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The Cash & Bank ledger — completely separate from customer_transactions.
     * Balance per account = running (in - out), never stored. A transfer between
     * two accounts is two rows sharing transfer_id, always written/deleted together.
     */
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->string('details')->nullable();
            $table->foreignId('account_id')->constrained()->restrictOnDelete();
            $table->enum('direction', ['in', 'out']);
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();
            // Snapshot so the label survives a category being renamed/deleted later.
            $table->string('category_name')->nullable();
            $table->decimal('amount', 14, 2);
            $table->string('transfer_id')->nullable();
            $table->timestamps(3);

            $table->index(['account_id', 'date']);
            $table->index('transfer_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
