<?php

namespace App\Support;

/**
 * The entity types the audit trail knows about, and the human module name each
 * one belongs to.
 *
 * `entity_type` is the stable machine key stored on every audit row (and the
 * one the Module filter queries by); `MODULES` is only the label the Audit
 * History screen prints, so renaming a screen never invalidates history.
 *
 * Deliberately *not* model class names: a class can be moved or renamed, and
 * two audit rows written years apart must still describe the same thing.
 */
class AuditEntity
{
    public const CASH_TRANSACTION = 'CashTransaction';

    public const TRANSFER = 'Transfer';

    public const CUSTOMER_PAYMENT = 'CustomerPayment';

    public const CUSTOMER = 'Customer';

    public const SALE = 'Sale';

    public const RAW_MATERIAL_IMPORT = 'RawMaterialImport';

    public const SHIPMENT_CYCLE = 'ShipmentCycle';

    public const PRODUCTION_ENTRY = 'ProductionEntry';

    public const WASTAGE_ENTRY = 'WastageEntry';

    public const LEDGER_CLOSING = 'LedgerClosing';

    public const USER = 'User';

    public const ROLE = 'Role';

    public const COMPANY_PROFILE = 'CompanyProfile';

    public const ACCOUNT = 'Account';

    public const CATEGORY = 'Category';

    public const AUTH = 'Auth';

    public const SYSTEM = 'System';

    /** entity_type => the module label the Audit History screen shows. */
    public const MODULES = [
        self::CASH_TRANSACTION => 'Cash & Bank Ledger',
        self::TRANSFER => 'Cash & Bank Ledger',
        self::CUSTOMER_PAYMENT => 'Customer Payment',
        self::CUSTOMER => 'Customers',
        self::SALE => 'Sales',
        self::RAW_MATERIAL_IMPORT => 'Raw Material Import',
        self::SHIPMENT_CYCLE => 'Shipment Cycle',
        self::PRODUCTION_ENTRY => 'Production',
        self::WASTAGE_ENTRY => 'Wastage',
        self::LEDGER_CLOSING => 'Monthly Closing',
        self::USER => 'Users',
        self::ROLE => 'Roles',
        self::COMPANY_PROFILE => 'Company Profile',
        self::ACCOUNT => 'Settings — Accounts',
        self::CATEGORY => 'Settings — Categories',
        self::AUTH => 'Authentication',
        self::SYSTEM => 'System',
    ];

    public static function moduleFor(string $entityType): string
    {
        return self::MODULES[$entityType] ?? $entityType;
    }

    /** @return list<string> */
    public static function all(): array
    {
        return array_keys(self::MODULES);
    }
}
