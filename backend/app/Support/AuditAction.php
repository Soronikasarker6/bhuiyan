<?php

namespace App\Support;

/**
 * Every action the central audit trail can record — the one list both the
 * backend and the Audit History filter read from, mirrored on the frontend at
 * src/constants/audit.ts.
 *
 * Named the same SCREAMING_SNAKE_CASE way {@see Permissions} is, for the same
 * reason: a typo becomes a missing constant rather than a silently unfilterable
 * row in the audit log.
 */
class AuditAction
{
    public const CREATE = 'CREATE';

    public const UPDATE = 'UPDATE';

    /** A hard delete — the row is gone; only this audit record's before_data survives it. */
    public const DELETE = 'DELETE';

    /** A soft delete — the row leaves the active ledger but is still there, recoverable. */
    public const VOID = 'VOID';

    public const RESTORE = 'RESTORE';

    /** A Cash→Bank / Bank→Cash / Bank→Bank move, audited as the one logical operation both legs are. */
    public const TRANSFER = 'TRANSFER';

    public const CLOSE_SHIPMENT = 'CLOSE_SHIPMENT';

    public const REOPEN_SHIPMENT = 'REOPEN_SHIPMENT';

    public const CLOSE_MONTH = 'CLOSE_MONTH';

    public const REOPEN_MONTH = 'REOPEN_MONTH';

    public const LOGIN = 'LOGIN';

    public const LOGOUT = 'LOGOUT';

    public const PASSWORD_CHANGE = 'PASSWORD_CHANGE';

    /** A role assignment or a role's permission set changing — who can do what. */
    public const PERMISSION_CHANGE = 'PERMISSION_CHANGE';

    /** Backup restore / "clear all entries" — system-wide destructive operations. */
    public const DATA_RESET = 'DATA_RESET';

    /** @return list<string> */
    public static function all(): array
    {
        return array_values((new \ReflectionClass(self::class))->getConstants());
    }
}
