<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('mesh_size_id')->constrained('mesh_sizes')->restrictOnDelete();
            $table->unsignedInteger('bags');
            $table->decimal('rate_per_ton', 14, 2);
            // Truck/weighbridge actual reading; overrides the calculated weight for
            // billing only — bag count still drives stock deduction either way.
            $table->decimal('actual_weight_ton', 15, 3)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_items');
    }
};
