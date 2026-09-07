<?php

namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        foreach ([
            ['name' => 'Vietnam White Limestone', 'code' => 'VWL', 'unit' => 'Ton'],
            ['name' => 'Oman Red Limestone', 'code' => 'ORL', 'unit' => 'Ton'],
            ['name' => 'Grey Limestone', 'code' => 'GRL', 'unit' => 'Ton'],
        ] as $product) {
            Product::firstOrCreate(['code' => $product['code']], $product + ['active' => true]);
        }
    }
}
