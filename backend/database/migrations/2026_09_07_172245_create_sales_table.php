<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no')->unique();
            $table->date('date');
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->string('truck_no')->nullable();
            $table->text('notes')->nullable();
            $table->decimal('paid_at_sale', 14, 2)->default(0);
            $table->timestamps();

            $table->index(['customer_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
