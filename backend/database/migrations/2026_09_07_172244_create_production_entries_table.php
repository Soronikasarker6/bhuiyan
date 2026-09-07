<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** No "sell" column — sell figures are always derived from sale_items. */
    public function up(): void
    {
        Schema::create('production_entries', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('mesh_id')->constrained('mesh_sizes')->restrictOnDelete();
            $table->unsignedInteger('bags');
            $table->string('notes')->nullable();
            $table->timestamps(3);

            $table->index(['product_id', 'mesh_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('production_entries');
    }
};
