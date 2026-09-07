<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Child rows for LedgerClosing.balances[] — one per account, frozen at close time. */
    public function up(): void
    {
        Schema::create('ledger_closing_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ledger_closing_id')->constrained()->cascadeOnDelete();
            $table->foreignId('account_id')->nullable()->constrained()->nullOnDelete();
            $table->string('account_name');
            $table->enum('kind', ['cash', 'bank']);
            $table->decimal('balance', 14, 2);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ledger_closing_balances');
    }
};
