<?php

namespace App\Services;

use App\Models\User;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Guard;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * The one place that decides whether a sign-in is still alive.
 *
 * A sign-in here is one Sanctum personal access token. It is valid until the
 * EARLIER of:
 *
 *     created_at    + auth.session.max_lifetime   (absolute — activity never moves it)
 *     last activity + auth.session.idle_timeout   (idle — every request moves it)
 *
 * "Last activity" is Sanctum's own `last_used_at`, which its guard stamps on
 * every authenticated request — but only AFTER this policy has approved the
 * token (see {@see Guard::__invoke()}), so the idle check
 * always sees the previous request's time, never the current one's.
 *
 * Wired in through `Sanctum::authenticateAccessTokensUsing()` (see
 * AppServiceProvider), so every `auth:sanctum` route is covered without any
 * middleware of its own. A token that fails is deleted — it can never come
 * back to life by refreshing the browser — and the expiry is audited.
 */
class SessionPolicy
{
    public const REASON_IDLE = 'idle_timeout';

    public const REASON_ABSOLUTE = 'max_lifetime';

    public const REASON_DEACTIVATED = 'account_deactivated';

    /** Request attribute the 401 renderer reads to tell the client why. */
    public const REQUEST_ATTRIBUTE = 'session_expired_reason';

    public function __construct(private AuditLogger $audit) {}

    public function maxLifetimeMinutes(): int
    {
        return (int) config('auth.session.max_lifetime');
    }

    public function idleTimeoutMinutes(): int
    {
        return (int) config('auth.session.idle_timeout');
    }

    /** The `expires_at` a freshly minted token is stored with. */
    public function newTokenExpiry(): Carbon
    {
        return now()->addMinutes($this->maxLifetimeMinutes());
    }

    /**
     * Measured from `created_at`, not only `expires_at`, so tokens minted
     * before this policy existed (no `expires_at`) are held to it too.
     */
    public function absoluteExpiresAt(PersonalAccessToken $token): Carbon
    {
        $fromCreation = $token->created_at->copy()->addMinutes($this->maxLifetimeMinutes());

        return $token->expires_at && $token->expires_at->lt($fromCreation)
            ? $token->expires_at->copy()
            : $fromCreation;
    }

    public function idleExpiresAt(PersonalAccessToken $token): Carbon
    {
        return ($token->last_used_at ?? $token->created_at)->copy()->addMinutes($this->idleTimeoutMinutes());
    }

    public function expiresAt(PersonalAccessToken $token): Carbon
    {
        return $this->absoluteExpiresAt($token)->min($this->idleExpiresAt($token));
    }

    /** Why this token may no longer be used, or null while it is still good. */
    public function expiryReason(PersonalAccessToken $token): ?string
    {
        $now = now();

        if ($now->gte($this->absoluteExpiresAt($token))) {
            return self::REASON_ABSOLUTE;
        }

        if ($now->gte($this->idleExpiresAt($token))) {
            return self::REASON_IDLE;
        }

        $user = $token->tokenable;
        if ($user instanceof User && ! $user->is_active) {
            return self::REASON_DEACTIVATED;
        }

        return null;
    }

    /**
     * Sanctum's token-authentication hook. True lets the request through;
     * false makes `auth:sanctum` answer 401, after the token has been deleted
     * and the expiry recorded.
     */
    public function validate(PersonalAccessToken $token): bool
    {
        $reason = $this->expiryReason($token);

        if ($reason === null) {
            return true;
        }

        $this->expire($token, $reason);

        return false;
    }

    private function expire(PersonalAccessToken $token, string $reason): void
    {
        $user = $token->tokenable;
        $signedInAt = $token->created_at;
        $lastActivityAt = $token->last_used_at;

        // Only this one token — the same user's sign-ins in other browsers,
        // and every other user's, are untouched.
        $token->delete();

        request()->attributes->set(self::REQUEST_ATTRIBUTE, $reason);

        if (! $user instanceof User) {
            return;
        }

        $this->audit->record(AuditEntity::AUTH, $user->id, AuditAction::SESSION_EXPIRED, [
            'record' => $user->email,
            // The guard never populated a user for this request — it is the
            // request being refused — so the owner is named explicitly, from
            // the token row the backend itself looked up.
            'actor' => $user,
            'summary' => match ($reason) {
                self::REASON_ABSOLUTE => "{$user->name}'s session reached its {$this->hours()}-hour limit",
                self::REASON_IDLE => "{$user->name}'s session timed out after {$this->idleTimeoutMinutes()} minutes idle",
                default => "{$user->name}'s session was ended: account deactivated",
            },
            'metadata' => [
                'reason' => $reason,
                'signed_in_at' => $signedInAt?->toIso8601String(),
                'last_activity_at' => $lastActivityAt?->toIso8601String(),
            ],
        ]);
    }

    /**
     * What the client needs to warn the user in time. Durations are relative
     * seconds so a wrong clock on the office PC cannot shift the warning;
     * the absolute timestamps are informational.
     *
     * @return array<string, int|string>
     */
    public function describe(PersonalAccessToken $token): array
    {
        $now = now();
        $absolute = $this->absoluteExpiresAt($token);
        $effective = $this->expiresAt($token);

        return [
            'expires_at' => $effective->toIso8601String(),
            'absolute_expires_at' => $absolute->toIso8601String(),
            'expires_in' => max(0, (int) $now->diffInSeconds($effective, false)),
            'absolute_expires_in' => max(0, (int) $now->diffInSeconds($absolute, false)),
            'idle_timeout' => $this->idleTimeoutMinutes() * 60,
        ];
    }

    private function hours(): string
    {
        $hours = $this->maxLifetimeMinutes() / 60;

        return rtrim(rtrim(number_format($hours, 2, '.', ''), '0'), '.');
    }
}
