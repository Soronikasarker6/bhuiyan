<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

/** Reads credentials from .env (ADMIN_NAME/ADMIN_EMAIL/ADMIN_PASSWORD) — never hardcoded. */
class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::firstOrCreate(
            ['email' => env('ADMIN_EMAIL', 'admin@bhuiyan-industry.test')],
            [
                'name' => env('ADMIN_NAME', 'Office Admin'),
                'password' => env('ADMIN_PASSWORD', 'change-me-please'),
                'is_active' => true,
            ]
        );

        if (! $user->hasRole('Admin')) {
            $user->assignRole('Admin');
        }
    }
}
