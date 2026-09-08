<?php

namespace Database\Seeders;

use App\Support\Permissions;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        foreach (Permissions::all() as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'api']);
        }
    }
}
