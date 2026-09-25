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
    /**
     * Permissions no seeded role but Admin ever receives, listed once so a new
     * one cannot be added to Permissions.php and quietly land in Manager's
     * set through a prefix rule that happens to match it.
     */
    private const ADMIN_ONLY = [
        Permissions::AUDIT_VIEW,
        Permissions::CUSTOMER_INTERNAL_LEDGER_VIEW,
    ];

    public function run(): void
    {
        $all = Permissions::all();

        $admin = Role::firstOrCreate(['name' => 'Admin', 'guard_name' => 'api']);
        $admin->syncPermissions($all);

        // Every business-module permission, but none of Settings/Users/Roles
        // — and none of the two Admin-only ones.
        //
        // AUDIT_VIEW: a Manager's own actions are recorded in the audit trail
        // (the backend does that regardless of who they are), but reading that
        // trail means reading every other module's before/after values.
        //
        // CUSTOMER_INTERNAL_LEDGER_VIEW: the owner's private book. Note this
        // is *not* CUSTOMER_LEDGER_VIEW, which Managers keep — they still need
        // the operational receivables ledger to do their job.
        $manager = Role::firstOrCreate(['name' => 'Manager', 'guard_name' => 'api']);
        $manager->syncPermissions(array_values(array_filter(
            $all,
            fn (string $name) => ! str_starts_with($name, 'SETTINGS_')
                && ! str_starts_with($name, 'USERS_')
                && ! str_starts_with($name, 'ROLES_')
                && ! in_array($name, self::ADMIN_ONLY, true),
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
                && ! in_array($name, self::ADMIN_ONLY, true),
        )));
    }
}
