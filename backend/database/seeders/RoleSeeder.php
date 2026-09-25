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

        // Every business-module permission, but none of Settings/Users/Roles
        // — and never AUDIT_VIEW. A Manager's own actions are recorded in the
        // audit trail (the backend does that regardless of who they are), but
        // reading that trail means reading every other module's before/after
        // values, which is Admin-only by design (see Permissions::AUDIT_VIEW).
        $manager = Role::firstOrCreate(['name' => 'Manager', 'guard_name' => 'api']);
        $manager->syncPermissions(array_values(array_filter(
            $all,
            fn (string $name) => ! str_starts_with($name, 'SETTINGS_')
                && ! str_starts_with($name, 'USERS_')
                && ! str_starts_with($name, 'ROLES_')
                && $name !== Permissions::AUDIT_VIEW,
        )));

        // View + create only, no edit/delete, no Settings/Users/Roles/Closing.
        // SALES_RATE_VIEW is deliberately withheld — Rate/TON is confidential
        // and only Admin/Manager (finance-level roles) may see it.
        $staff = Role::firstOrCreate(['name' => 'Staff', 'guard_name' => 'api']);
        $staff->syncPermissions(array_values(array_filter(
            $all,
            fn (string $name) => (str_ends_with($name, '_VIEW') || str_ends_with($name, '_CREATE'))
                && ! str_starts_with($name, 'SETTINGS_')
                && ! str_starts_with($name, 'USERS_')
                && ! str_starts_with($name, 'ROLES_')
                && ! str_starts_with($name, 'CLOSING_')
                && $name !== Permissions::SALES_RATE_VIEW
                && $name !== Permissions::AUDIT_VIEW,
        )));
    }
}
