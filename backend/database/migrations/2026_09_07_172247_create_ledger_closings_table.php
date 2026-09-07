<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** A frozen, point-in-time snapshot of account balances at month end. */
    public function up(): void
    {
        Schema::create('ledger_closings', function (Blueprint $table) {
            $table->id();
            $table->string('month_key')->unique(); // "YYYY-MM"
            $table->string('month');
            $table->unsignedSmallInteger('year');
            $table->decimal('cash_total', 14, 2);
            $table->decimal('bank_total', 14, 2);
            $table->decimal('grand_total', 14, 2);
            $table->decimal('month_in', 14, 2);
            $table->decimal('month_out', 14, 2);
            $table->decimal('net_movement', 14, 2);
            $table->dateTime('closed_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ledger_closings');
    }
};
