<?php

namespace Database\Seeders;

use App\Models\MeshSize;
use Illuminate\Database\Seeder;

class MeshSizeSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['250', '400', '500', '800', '1000'] as $name) {
            MeshSize::firstOrCreate(['name' => $name], ['bag_kg' => 50, 'active' => true]);
        }
    }
}
