<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Http\Requests\ResetPasswordRequest;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    public function index()
    {
        return User::with('roles')->orderBy('name')->get()->map(fn (User $u) => $this->present($u));
    }

    /** Role assignment on create is bundled with USERS_CREATE — this is provisioning a new account, not elevating an existing one. */
    public function store(StoreUserRequest $request)
    {
        $data = $request->validated();

        $user = DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => $data['password'],
                'is_active' => $data['is_active'] ?? true,
            ]);

            if (! empty($data['roles'])) {
                $user->syncRoles($data['roles']);
            }

            return $user;
        });

        // The password never reaches the audit trail — AuditLogger redacts it,
        // and the snapshot is taken from the model's own serialisation, where
        // it is already hidden.
        $this->audit->record(AuditEntity::USER, $user->id, AuditAction::CREATE, [
            'record' => $user->name,
            'after' => $this->auditSnapshot($user->load('roles')),
            'summary' => sprintf(
                'Created user %s (%s)',
                $user->name,
                $user->getRoleNames()->implode(', ') ?: 'no role',
            ),
        ]);

        return response()->json($this->present($user->load('roles')), 201);
    }

    /**
     * Profile fields are editable by anyone holding USERS_EDIT. The `roles`
     * field is silently ignored unless the caller also holds
     * USERS_ROLE_ASSIGNMENT_EDIT — the split (adapted from V12) that stops a
     * user who can edit users from also being able to grant themselves or
     * anyone else a higher role.
     */
    public function update(UpdateUserRequest $request, User $user)
    {
        $data = $request->validated();
        $before = $this->auditSnapshot($user->load('roles'));

        DB::transaction(function () use ($request, $user, $data) {
            $user->update([
                'name' => $data['name'],
                'email' => $data['email'],
                'is_active' => $data['is_active'] ?? $user->is_active,
            ]);

            if (array_key_exists('roles', $data) && $request->user()->can(Permissions::USERS_ROLE_ASSIGNMENT_EDIT)) {
                $user->syncRoles($data['roles']);
            }
        });

        $after = $this->auditSnapshot($user->fresh('roles'));

        // A role change is a change to what someone is allowed to do, not a
        // profile edit, so it is recorded as PERMISSION_CHANGE (§21) — it is
        // the one edit on this screen an admin is most likely to be looking
        // for later.
        $rolesChanged = $before['roles'] !== $after['roles'];

        $this->audit->record(
            AuditEntity::USER,
            $user->id,
            $rolesChanged ? AuditAction::PERMISSION_CHANGE : AuditAction::UPDATE,
            [
                'record' => $after['name'],
                'before' => $before,
                'after' => $after,
                'summary' => $rolesChanged
                    ? sprintf(
                        '%s: role %s → %s',
                        $after['name'],
                        implode(', ', $before['roles']) ?: 'none',
                        implode(', ', $after['roles']) ?: 'none',
                    )
                    : null,
            ],
        );

        return $this->present($user->fresh('roles'));
    }

    public function destroy(Request $request, User $user)
    {
        if ($request->user()->is($user)) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }

        $before = $this->auditSnapshot($user->load('roles'));
        $name = $user->name;

        $user->delete();

        $this->audit->record(AuditEntity::USER, $user->id, AuditAction::DELETE, [
            'record' => $name,
            'before' => $before,
            'summary' => "Deleted user {$name}",
        ]);

        return response()->json(null, 204);
    }

    public function toggleActive(Request $request, User $user)
    {
        if ($request->user()->is($user)) {
            return response()->json(['message' => 'You cannot deactivate your own account.'], 422);
        }

        $before = $this->auditSnapshot($user->load('roles'));
        $user->update(['is_active' => ! $user->is_active]);
        $after = $this->auditSnapshot($user->fresh('roles'));

        $this->audit->record(AuditEntity::USER, $user->id, AuditAction::UPDATE, [
            'record' => $user->name,
            'before' => $before,
            'after' => $after,
            'summary' => sprintf('%s %s', $user->is_active ? 'Activated' : 'Deactivated', $user->name),
        ]);

        return $this->present($user->fresh('roles'));
    }

    public function resetPassword(ResetPasswordRequest $request, User $user)
    {
        $user->update(['password' => $request->validated()['password']]);

        // Any tokens issued under the old password are revoked, matching the
        // spirit of a real password reset — the user must sign in again.
        $user->tokens()->delete();

        // Recorded as an event only. There is deliberately no before/after
        // here: neither the old nor the new password belongs in a history
        // anyone can read, and "it was reset, by whom, when" is the whole of
        // what an audit needs (§21).
        $this->audit->record(AuditEntity::USER, $user->id, AuditAction::PASSWORD_CHANGE, [
            'record' => $user->name,
            'summary' => "Reset the password for {$user->name}",
            'metadata' => ['sessions_revoked' => true],
        ]);

        return response()->json(['message' => 'Password reset.']);
    }

    private function present(User $user): array
    {
        return array_merge($user->toArray(), [
            'roles' => $user->getRoleNames()->values(),
        ]);
    }

    /** Profile fields plus the role names — never the password hash or tokens. */
    private function auditSnapshot(User $user): array
    {
        return [
            'name' => $user->name,
            'email' => $user->email,
            'is_active' => (bool) $user->is_active,
            'roles' => $user->getRoleNames()->sort()->values()->all(),
        ];
    }
}
