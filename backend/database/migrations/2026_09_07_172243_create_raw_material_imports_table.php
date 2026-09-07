<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row = one shipment = one inventory cycle for its product. `closing_*`
     * columns are null until the shipment is closed, at which point they freeze
     * the opening/received/consumed/closing tonnage permanently (see InventoryService).
     */
    public function up(): void
    {
        Schema::create('raw_material_imports', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('ship_name')->nullable();
            $table->string('serial_no')->nullable();
            $table->string('truck_no')->nullable();
            $table->decimal('gross_weight_kg', 15, 3);
            $table->decimal('tare_weight_kg', 15, 3);
            $table->decimal('price_per_ton', 14, 2)->nullable();
            $table->text('notes')->nullable();
            $table->enum('status', ['open', 'closed'])->default('open');
            $table->decimal('closing_opening_ton', 15, 3)->nullable();
            $table->decimal('closing_received_ton', 15, 3)->nullable();
            $table->decimal('closing_consumed_ton', 15, 3)->nullable();
            $table->decimal('closing_closing_ton', 15, 3)->nullable();
            $table->dateTime('closing_closed_at')->nullable();
            $table->timestamps(3);

            $table->index(['product_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('raw_material_imports');
    }
};
