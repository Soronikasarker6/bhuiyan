<?php

namespace Database\Seeders;

use App\Support\Permissions;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role;

/**
 * Starting roles only — like V12, roles are freely created/edited/deleted at
 * runtime afterwards through the Roles screen; nothing here is a fixed
 * structure the app depends on beyond "Admin" always existing.
 */
class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $all = Permissions::all();

        $admin = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'api']);
        $admin->syncPermissions($all);

        // Every business-module permission, but none of Settings/Users/Roles.
        $manager = Role::firstOrCreate(['name' => 'Manager', 'guard_name' => 'api']);
        $manager->syncPermissions(array_values(array_filter(
            $all,
            fn (string $name) => ! str_starts_with($name, 'SETTINGS_')
                && ! str_starts_with($name, 'USERS_')
                && ! str_starts_with($name, 'ROLES_'),
        )));

        // View + create only, no edit/delete, no Settings/Users/Roles/Closing.
        $staff = Role::firstOrCreate(['name' => 'Staff', 'guard_name' => 'api']);
        $staff->syncPermissions(array_values(array_filter(
            $all,
            fn (string $name) => (str_ends_with($name, '_VIEW') || str_ends_with($name, '_CREATE'))
                && ! str_starts_with($name, 'SETTINGS_')
                && ! str_starts_with($name, 'USERS_')
                && ! str_starts_with($name, 'ROLES_')
                && ! str_starts_with($name, 'CLOSING_'),
        )));
    }
}
