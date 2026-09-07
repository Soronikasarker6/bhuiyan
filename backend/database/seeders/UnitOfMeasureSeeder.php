<?php

namespace Database\Seeders;

use App\Models\UnitOfMeasure;
use Illuminate\Database\Seeder;

class UnitOfMeasureSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['Ton', 'KG', 'Bag', 'Piece'] as $name) {
            UnitOfMeasure::firstOrCreate(['name' => $name]);
        }
    }
}
