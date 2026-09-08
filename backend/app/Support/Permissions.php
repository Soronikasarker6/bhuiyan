<?php

namespace App\Support;

/**
 * The single source of truth for every permission name in the system —
 * mirrored verbatim on the frontend at src/constants/permissions.ts.
 *
 * Naming convention adapted from the V12 project (D:\shopfloor-suite):
 * MODULE_RESOURCE_ACTION in SCREAMING_SNAKE_CASE, seeded via
 * Permission::firstOrCreate(). `USERS_EDIT` (profile fields) and
 * `USERS_ROLE_ASSIGNMENT_EDIT` (which roles a user holds) are deliberately
 * split, exactly as V12 splits them — that split is what stops a user who
 * can edit users from also being able to grant themselves a higher role.
 */
class Permissions
{
    public const DASHBOARD_VIEW = 'DASHBOARD_VIEW';

    public const RAW_MATERIAL_VIEW = 'RAW_MATERIAL_VIEW';
    public const RAW_MATERIAL_CREATE = 'RAW_MATERIAL_CREATE';
    public const RAW_MATERIAL_EDIT = 'RAW_MATERIAL_EDIT';
    public const RAW_MATERIAL_DELETE = 'RAW_MATERIAL_DELETE';

    public const PRODUCTION_VIEW = 'PRODUCTION_VIEW';
    public const PRODUCTION_CREATE = 'PRODUCTION_CREATE';
    public const PRODUCTION_EDIT = 'PRODUCTION_EDIT';
    public const PRODUCTION_DELETE = 'PRODUCTION_DELETE';

    public const SALES_VIEW = 'SALES_VIEW';
    public const SALES_CREATE = 'SALES_CREATE';
    public const SALES_EDIT = 'SALES_EDIT';
    public const SALES_DELETE = 'SALES_DELETE';

    public const CUSTOMERS_VIEW = 'CUSTOMERS_VIEW';
    public const CUSTOMERS_CREATE = 'CUSTOMERS_CREATE';
    public const CUSTOMERS_EDIT = 'CUSTOMERS_EDIT';
    public const CUSTOMERS_DELETE = 'CUSTOMERS_DELETE';

    public const CUSTOMER_LEDGER_VIEW = 'CUSTOMER_LEDGER_VIEW';

    public const CASH_IN_VIEW = 'CASH_IN_VIEW';
    public const CASH_IN_CREATE = 'CASH_IN_CREATE';

    public const LEDGER_VIEW = 'LEDGER_VIEW';
    public const LEDGER_CREATE = 'LEDGER_CREATE';
    public const LEDGER_DELETE = 'LEDGER_DELETE';

    public const CLOSING_VIEW = 'CLOSING_VIEW';
    public const CLOSING_CREATE = 'CLOSING_CREATE';

    public const PROFIT_VIEW = 'PROFIT_VIEW';

    public const REPORTS_VIEW = 'REPORTS_VIEW';

    public const SETTINGS_VIEW = 'SETTINGS_VIEW';
    public const SETTINGS_EDIT = 'SETTINGS_EDIT';

    public const USERS_VIEW = 'USERS_VIEW';
    public const USERS_CREATE = 'USERS_CREATE';
    public const USERS_EDIT = 'USERS_EDIT';
    public const USERS_DELETE = 'USERS_DELETE';
    public const USERS_ROLE_ASSIGNMENT_EDIT = 'USERS_ROLE_ASSIGNMENT_EDIT';

    public const ROLES_VIEW = 'ROLES_VIEW';
    public const ROLES_EDIT = 'ROLES_EDIT';

    /** @return list<string> every permission name, for seeding and the role editor's checklist. */
    public static function all(): array
    {
        $reflection = new \ReflectionClass(self::class);

        return array_values($reflection->getConstants());
    }
}
