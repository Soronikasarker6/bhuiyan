<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    /**
     * The Admin-only correction permissions — reversing a sale, production or
     * wastage entry, and reopening a closed shipment cycle — granted to the
     * Admin role on deploy.
     *
     * Production deploys run PermissionSeeder (creates any missing permission)
     * but deliberately not RoleSeeder (it would wipe role customisations made
     * on the Roles screen). Without this, the new permissions would exist and
     * belong to nobody, and since reopening moved from RAW_MATERIAL_EDIT to
     * RAW_MATERIAL_REOPEN, not even an Admin could reopen a cycle.
     *
     * Additive only: givePermissionTo() never removes anything, and no other
     * role is touched. A fresh install without roles yet is a no-op (the
     * seeders grant these there).
     */
    private const PERMISSIONS = ['SALES_REVERSE', 'PRODUCTION_REVERSE', 'RAW_MATERIAL_REVERSE', 'RAW_MATERIAL_REOPEN'];

    public function up(): void
    {
        $admin = Role::where('name', 'Admin')->where('guard_name', 'api')->first();
        if (! $admin) {
            return;
        }

        foreach (self::PERMISSIONS as $name) {
            Permission::firstOrCreate(['name' => $name, 'guard_name' => 'api']);
        }

        $admin->givePermissionTo(self::PERMISSIONS);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
    }

    public function down(): void
    {
        // Left in place: revoking on rollback could strip permissions an
        // Admin role relied on before this migration ran.
    }
};
