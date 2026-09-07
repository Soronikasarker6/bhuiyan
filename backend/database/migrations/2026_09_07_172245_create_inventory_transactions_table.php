<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Append-only audit log of every raw-material stock movement — written by
     * InventoryService alongside every shipment/production/wastage write. This is
     * NOT the source of the shipment-cycle math (that's recomputed from
     * raw_material_imports/wastage_entries/production_entries so back-dated entries
     * and closed-shipment freezes behave exactly like the frontend); it exists purely
     * to give a literal, human-readable IN/OUT/BALANCE trail per raw material.
     */
    public function up(): void
    {
        Schema::create('inventory_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->enum('direction', ['in', 'out']);
            $table->enum('source_type', ['shipment', 'production', 'wastage']);
            $table->unsignedBigInteger('source_id');
            $table->decimal('quantity_ton', 15, 3);
            $table->decimal('balance_after_ton', 15, 3);
            $table->dateTime('occurred_at');
            $table->timestamps();

            $table->index(['product_id', 'occurred_at']);
            $table->index(['source_type', 'source_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_transactions');
    }
};
