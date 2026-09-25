<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use RuntimeException;

/**
 * One recorded action. Append-only by construction.
 *
 * An audit record is a statement about what already happened, so there is no
 * legitimate way to change one: the `updating`/`deleting` guards below make
 * that a hard error rather than a convention, even from tinker or a future
 * controller that forgets. Nothing in the API exposes a write either — the
 * only routes are the Admin-only reads in routes/api.php.
 *
 * `performed_at` is the business timestamp (always server clock, never a
 * client-supplied value); `created_at` is simply when the row was inserted.
 * They are normally identical and differ only if an action is ever recorded
 * after the fact.
 */
class AuditLog extends Model
{
    /** performed_at carries the meaning; a mutable updated_at would be a lie on an immutable row. */
    public const UPDATED_AT = null;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'performed_at' => 'datetime',
            'before_data' => 'array',
            'after_data' => 'array',
            'metadata' => 'array',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (): never {
            throw new RuntimeException('Audit log records are immutable and cannot be modified.');
        });

        static::deleting(function (): never {
            throw new RuntimeException('Audit log records are immutable and cannot be deleted.');
        });
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by_user_id');
    }

    /** Every audit row for one record, oldest first — the "history of TX-000123" view. */
    public function scopeForEntity(Builder $query, string $entityType, string|int $entityId): Builder
    {
        return $query->where('entity_type', $entityType)->where('entity_id', (string) $entityId);
    }
}
