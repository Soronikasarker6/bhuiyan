<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Mesh/grind sizes (e.g. 250, 400, 500). A global catalog — one mesh size's
     * bag_kg applies to every raw material it's used with, matching the frontend.
     */
    public function up(): void
    {
        Schema::create('mesh_sizes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->decimal('bag_kg', 10, 3);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mesh_sizes');
    }
};
