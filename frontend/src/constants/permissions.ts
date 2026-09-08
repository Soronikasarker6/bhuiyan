/**
 * Mirrors backend/app/Support/Permissions.php verbatim — one name per
 * permission, MODULE_ACTION in SCREAMING_SNAKE_CASE (the naming convention
 * carried over from the V12 project). Every check in the frontend goes
 * through `useAuth().isPermissionValid(...)` against these constants, never
 * a raw string, so a typo fails to compile rather than silently always
 * denying (or worse, always allowing) access.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'DASHBOARD_VIEW',

  RAW_MATERIAL_VIEW: 'RAW_MATERIAL_VIEW',
  RAW_MATERIAL_CREATE: 'RAW_MATERIAL_CREATE',
  RAW_MATERIAL_EDIT: 'RAW_MATERIAL_EDIT',
  RAW_MATERIAL_DELETE: 'RAW_MATERIAL_DELETE',

  PRODUCTION_VIEW: 'PRODUCTION_VIEW',
  PRODUCTION_CREATE: 'PRODUCTION_CREATE',
  PRODUCTION_EDIT: 'PRODUCTION_EDIT',
  PRODUCTION_DELETE: 'PRODUCTION_DELETE',

  SALES_VIEW: 'SALES_VIEW',
  SALES_CREATE: 'SALES_CREATE',
  SALES_EDIT: 'SALES_EDIT',
  SALES_DELETE: 'SALES_DELETE',

  CUSTOMERS_VIEW: 'CUSTOMERS_VIEW',
  CUSTOMERS_CREATE: 'CUSTOMERS_CREATE',
  CUSTOMERS_EDIT: 'CUSTOMERS_EDIT',
  CUSTOMERS_DELETE: 'CUSTOMERS_DELETE',

  CUSTOMER_LEDGER_VIEW: 'CUSTOMER_LEDGER_VIEW',

  CASH_IN_VIEW: 'CASH_IN_VIEW',
  CASH_IN_CREATE: 'CASH_IN_CREATE',

  LEDGER_VIEW: 'LEDGER_VIEW',
  LEDGER_CREATE: 'LEDGER_CREATE',
  LEDGER_DELETE: 'LEDGER_DELETE',

  CLOSING_VIEW: 'CLOSING_VIEW',
  CLOSING_CREATE: 'CLOSING_CREATE',

  PROFIT_VIEW: 'PROFIT_VIEW',

  REPORTS_VIEW: 'REPORTS_VIEW',

  SETTINGS_VIEW: 'SETTINGS_VIEW',
  SETTINGS_EDIT: 'SETTINGS_EDIT',

  USERS_VIEW: 'USERS_VIEW',
  USERS_CREATE: 'USERS_CREATE',
  USERS_EDIT: 'USERS_EDIT',
  USERS_DELETE: 'USERS_DELETE',
  USERS_ROLE_ASSIGNMENT_EDIT: 'USERS_ROLE_ASSIGNMENT_EDIT',

  ROLES_VIEW: 'ROLES_VIEW',
  ROLES_EDIT: 'ROLES_EDIT',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** All permission names, grouped by module — the shape the Role editor's checklist renders. */
export const PERMISSION_GROUPS: Array<{ label: string; permissions: Permission[] }> = [
  { label: 'Dashboard', permissions: [PERMISSIONS.DASHBOARD_VIEW] },
  {
    label: 'Raw Material',
    permissions: [
      PERMISSIONS.RAW_MATERIAL_VIEW,
      PERMISSIONS.RAW_MATERIAL_CREATE,
      PERMISSIONS.RAW_MATERIAL_EDIT,
      PERMISSIONS.RAW_MATERIAL_DELETE,
    ],
  },
  {
    label: 'Production',
    permissions: [
      PERMISSIONS.PRODUCTION_VIEW,
      PERMISSIONS.PRODUCTION_CREATE,
      PERMISSIONS.PRODUCTION_EDIT,
      PERMISSIONS.PRODUCTION_DELETE,
    ],
  },
  {
    label: 'Sales',
    permissions: [PERMISSIONS.SALES_VIEW, PERMISSIONS.SALES_CREATE, PERMISSIONS.SALES_EDIT, PERMISSIONS.SALES_DELETE],
  },
  {
    label: 'Customers',
    permissions: [
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.CUSTOMERS_EDIT,
      PERMISSIONS.CUSTOMERS_DELETE,
      PERMISSIONS.CUSTOMER_LEDGER_VIEW,
    ],
  },
  { label: 'Cash In', permissions: [PERMISSIONS.CASH_IN_VIEW, PERMISSIONS.CASH_IN_CREATE] },
  {
    label: 'Cash & Bank Ledger',
    permissions: [PERMISSIONS.LEDGER_VIEW, PERMISSIONS.LEDGER_CREATE, PERMISSIONS.LEDGER_DELETE],
  },
  { label: 'Monthly Closing', permissions: [PERMISSIONS.CLOSING_VIEW, PERMISSIONS.CLOSING_CREATE] },
  { label: 'Profit & Loss', permissions: [PERMISSIONS.PROFIT_VIEW] },
  { label: 'Reports', permissions: [PERMISSIONS.REPORTS_VIEW] },
  { label: 'Settings', permissions: [PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_EDIT] },
  {
    label: 'Users',
    permissions: [
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_EDIT,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.USERS_ROLE_ASSIGNMENT_EDIT,
    ],
  },
  { label: 'Roles', permissions: [PERMISSIONS.ROLES_VIEW, PERMISSIONS.ROLES_EDIT] },
]
