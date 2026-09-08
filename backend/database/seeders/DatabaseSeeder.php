<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Default seed: master/config data + the one admin login. Configurable
     * catalogs (products, mesh sizes, ...) stay editable afterwards via the API.
     *
     * For a realistic dev dataset with sample shipments/production/sales, also run:
     *   php artisan db:seed --class="Database\Seeders\DemoDataSeeder"
     */
    public function run(): void
    {
        $this->call([
            ProductSeeder::class,
            MeshSizeSeeder::class,
            UnitOfMeasureSeeder::class,
            AccountSeeder::class,
            CategorySeeder::class,
            PermissionSeeder::class,
            RoleSeeder::class,
            AdminUserSeeder::class,
        ]);
    }
}
