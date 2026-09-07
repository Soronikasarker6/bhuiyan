<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $in = ['Customer Payment', 'Bank Loan', 'Cash to Bank', 'Bank to Cash', 'Opening Balance', 'Others'];
        $out = [
            'Labour Bill', 'Electricity Bill', 'Freight & Transport', 'Office Cost', 'Rent',
            'Bank Loan Repayment', 'Cash to Bank', 'Bank to Cash', 'Others',
        ];

        foreach ($in as $name) {
            Category::firstOrCreate(['name' => $name, 'direction' => 'in']);
        }
        foreach ($out as $name) {
            Category::firstOrCreate(['name' => $name, 'direction' => 'out']);
        }
    }
}
