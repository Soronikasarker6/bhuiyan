<?php

namespace Database\Seeders;

use App\Models\Account;
use Illuminate\Database\Seeder;

class AccountSeeder extends Seeder
{
    public function run(): void
    {
        Account::firstOrCreate(['name' => 'Cash'], ['kind' => 'cash', 'system' => true]);

        foreach (['UCB', 'Dutch Bangla', 'South East', 'Janata'] as $name) {
            Account::firstOrCreate(['name' => $name], ['kind' => 'bank', 'system' => false]);
        }
    }
}
