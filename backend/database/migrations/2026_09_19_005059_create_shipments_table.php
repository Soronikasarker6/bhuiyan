<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The inventory cycle a raw material's imports accumulate into — see
     * App\Services\InventoryService. At most one row per product is ever
     * `open` at a time; every import received while it's open belongs to
     * it (raw_material_imports.shipment_id), and closing freezes the four
     * `closing_*` columns below permanently. The next import after a close
     * starts a new row here, with a new id — this table's own auto-
     * increment id *is* the "Shipment ID" shown on screen.
     */
    public function up(): void
    {
        Schema::create('shipments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            // Set once, from the first import that opened this cycle — never
            // moved by a later import, even a back-dated one, joining the
            // same still-open cycle.
            $table->date('opened_on');
            $table->enum('status', ['open', 'closed'])->default('open');
            $table->decimal('closing_opening_ton', 15, 3)->nullable();
            $table->decimal('closing_received_ton', 15, 3)->nullable();
            // Production consumption and wastage, frozen separately — the
            // Shipment History screen reports them as two distinct figures
            // (§8/§11 of the brief), not one blended "consumed" number.
            $table->decimal('closing_consumed_ton', 15, 3)->nullable();
            $table->decimal('closing_wastage_ton', 15, 3)->nullable();
            $table->decimal('closing_closing_ton', 15, 3)->nullable();
            $table->dateTime('closing_closed_at')->nullable();
            $table->timestamps(3);

            $table->index(['product_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipments');
    }
};
