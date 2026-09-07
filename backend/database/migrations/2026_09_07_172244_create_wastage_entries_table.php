<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('wastage_entries', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->decimal('quantity_kg', 15, 3);
            $table->string('reason')->nullable();
            $table->timestamps(3);

            $table->index(['product_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('wastage_entries');
    }
};
