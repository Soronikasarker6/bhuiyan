<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;
use Illuminate\Support\Str;

/**
 * The one audit service. Every module calls this; no module writes to
 * `audit_logs` itself and no module has an audit service of its own.
 *
 *     $this->audit->record(AuditEntity::CASH_TRANSACTION, $id, AuditAction::UPDATE, [
 *         'record' => 'TX-000123',
 *         'before' => $before,
 *         'after'  => $after,
 *         'reason' => $reason,
 *     ]);
 *
 * SECURITY — the caller can never say who did it or when.
 * `performed_by_user_id`, `performed_by_user_name` and `performed_at` are
 * resolved here, from the authenticated Sanctum user and the server clock.
 * There is no option to override them from a request payload; the only
 * `actor` override that exists is for the login/logout events, which happen
 * either side of the guard being populated, and it takes a User model the
 * backend has already authenticated -- never an id off the wire.
 *
 * `before`/`after` are snapshots of the row, run through {@see redact()} so a
 * password hash or token can never be stored in history. `reason` is the one
 * field that legitimately comes from the user: it is their explanation, not a
 * claim about their identity.
 */
class AuditLogger
{
    /**
     * Never stored in before/after, at any nesting depth -- an audit trail is
     * read by humans on a screen and must not become a second place secrets
     * live.
     */
    private const REDACTED_KEYS = [
        'password', 'password_confirmation', 'current_password', 'new_password',
        'remember_token', 'token', 'plain_text_token', 'api_token', 'secret',
    ];

    /** Noise on every row, and never what someone is looking for in a diff. */
    private const IGNORED_KEYS = ['created_at', 'updated_at', 'deleted_at'];

    /**
     * @param  array{
     *     before?: array<string, mixed>|Model|null,
     *     after?: array<string, mixed>|Model|null,
     *     reason?: string|null,
     *     metadata?: array<string, mixed>|null,
     *     record?: string|null,
     *     summary?: string|null,
     *     module?: string|null,
     *     actor?: User|null,
     * }  $options
     */
    public function record(
        string $entityType,
        string|int|null $entityId,
        string $action,
        array $options = [],
    ): AuditLog {
        $before = $this->snapshot($options['before'] ?? null);
        $after = $this->snapshot($options['after'] ?? null);
        $actor = $options['actor'] ?? Auth::user();

        return AuditLog::create([
            'entity_type' => $entityType,
            'entity_id' => $entityId === null ? null : (string) $entityId,
            'action' => $action,
            'module' => $options['module'] ?? AuditEntity::moduleFor($entityType),
            'record_label' => $options['record'] ?? ($entityId === null ? null : '#'.$entityId),
            'summary' => Str::limit(
                $options['summary'] ?? $this->describe($action, $entityType, $before, $after),
                250,
            ),
            // Server-side identity, always. Never from the request payload.
            'performed_by_user_id' => $actor?->getKey(),
            'performed_by_user_name' => $actor?->name ?? 'System',
            'performed_at' => now(),
            'before_data' => $before,
            'after_data' => $after,
            'reason' => $this->trimmed($options['reason'] ?? null),
            'metadata' => $options['metadata'] ?? null,
            'ip_address' => Request::ip(),
        ]);
    }

    /**
     * An UPDATE that turns out to change nothing is not worth a row -- someone
     * opening a form and pressing Save is not an event. Anything that did
     * change is recorded exactly as {@see record()} would.
     */
    public function recordUpdate(
        string $entityType,
        string|int|null $entityId,
        array|Model|null $before,
        array|Model|null $after,
        array $options = [],
    ): ?AuditLog {
        $beforeData = $this->snapshot($before);
        $afterData = $this->snapshot($after);

        if ($this->changedKeys($beforeData, $afterData) === []) {
            return null;
        }

        return $this->record($entityType, $entityId, AuditAction::UPDATE, array_merge($options, [
            'before' => $beforeData,
            'after' => $afterData,
        ]));
    }

    /**
     * A plain, redacted array for one row -- the shape stored in before_data /
     * after_data. A model is read through `attributesToArray()` so casts
     * (dates, floats) apply and the stored snapshot matches what the API
     * would have returned at that moment.
     */
    public function snapshot(array|Model|null $subject): ?array
    {
        if ($subject === null) {
            return null;
        }

        $data = $subject instanceof Model ? $subject->attributesToArray() : $subject;

        return $this->redact(Arr::except($data, self::IGNORED_KEYS));
    }

    /** @return list<string> the keys whose value differs between two snapshots */
    public function changedKeys(?array $before, ?array $after): array
    {
        if ($before === null || $after === null) {
            return array_keys($after ?? $before ?? []);
        }

        $keys = array_unique([...array_keys($before), ...array_keys($after)]);

        return array_values(array_filter(
            $keys,
            // Compared through normalise() so 7000 and "7000.00" off a decimal
            // column don't read as a change nobody made.
            fn (string $key) => $this->normalise($before[$key] ?? null) !== $this->normalise($after[$key] ?? null),
        ));
    }

    private function normalise(mixed $value): string
    {
        if (is_numeric($value)) {
            return rtrim(rtrim(number_format((float) $value, 6, '.', ''), '0'), '.');
        }

        return json_encode($value) ?: '';
    }

    /** A one-line "what happened", for the Audit History table's Summary column. */
    private function describe(string $action, string $entityType, ?array $before, ?array $after): string
    {
        $label = Str::headline($entityType);

        return match ($action) {
            AuditAction::CREATE => "Created {$label}",
            AuditAction::UPDATE => $this->describeChanges($before, $after) ?? "Updated {$label}",
            AuditAction::DELETE => "Deleted {$label}",
            AuditAction::VOID => "Voided {$label}",
            AuditAction::RESTORE => "Restored {$label}",
            default => Str::headline(strtolower($action)).' - '.$label,
        };
    }

    private function describeChanges(?array $before, ?array $after): ?string
    {
        $changed = $this->changedKeys($before, $after);
        if ($changed === []) {
            return null;
        }

        $named = array_map(fn (string $key) => Str::headline($key), array_slice($changed, 0, 4));
        $extra = count($changed) - count($named);

        return 'Changed '.implode(', ', $named).($extra > 0 ? " and {$extra} more" : '');
    }

    /** @return array<string, mixed> */
    private function redact(array $data): array
    {
        foreach ($data as $key => $value) {
            if (in_array(strtolower((string) $key), self::REDACTED_KEYS, true)) {
                $data[$key] = '[redacted]';

                continue;
            }

            if (is_array($value)) {
                $data[$key] = $this->redact($value);
            }
        }

        return $data;
    }

    private function trimmed(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }
}
