<?php

namespace Database\Seeders;

use App\Models\Category;
use Illuminate\Database\Seeder;

class CategorySeeder extends Seeder
{
    public function run(): void
    {
        $in = ['Customer Payment', 'Bank Loan', 'Cash to Bank', 'Bank to Cash', 'Opening Balance', 'Others'];

        // Cash Out categories that are a transfer or a repayment rather than
        // a real operating expense — excluded from Profit & Loss's "Company
        // Costs" by default, same as the backfill for pre-existing data
        // (see the add_expense_type_to_categories_table migration).
        $excludedOut = ['Bank Loan Repayment', 'Cash to Bank', 'Bank to Cash'];
        $out = [
            'Labour Bill', 'Electricity Bill', 'Freight & Transport', 'Office Cost', 'Rent',
            'Bank Loan Repayment', 'Cash to Bank', 'Bank to Cash', 'Others',
        ];

        foreach ($in as $name) {
            Category::firstOrCreate(['name' => $name, 'direction' => 'in']);
        }
        foreach ($out as $name) {
            Category::firstOrCreate(
                ['name' => $name, 'direction' => 'out'],
                ['expense_type' => in_array($name, $excludedOut, true) ? 'excluded' : 'company_expense'],
            );
        }
    }
}
