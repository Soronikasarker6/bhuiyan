<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->enum('direction', ['in', 'out']);
            $table->timestamps();
            // Soft-deleted (not hard-deleted) so a `transactions.category_id` FK never
            // dangles; the transaction also snapshots the category name at write time.
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
