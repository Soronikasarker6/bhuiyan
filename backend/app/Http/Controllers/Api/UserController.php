<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Http\Requests\ResetPasswordRequest;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
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

        return $this->present($user->fresh('roles'));
    }

    public function destroy(Request $request, User $user)
    {
        if ($request->user()->is($user)) {
            return response()->json(['message' => 'You cannot delete your own account.'], 422);
        }

        $user->delete();

        return response()->json(null, 204);
    }

    public function toggleActive(Request $request, User $user)
    {
        if ($request->user()->is($user)) {
            return response()->json(['message' => 'You cannot deactivate your own account.'], 422);
        }

        $user->update(['is_active' => ! $user->is_active]);

        return $this->present($user->fresh('roles'));
    }

    public function resetPassword(ResetPasswordRequest $request, User $user)
    {
        $user->update(['password' => $request->validated()['password']]);

        // Any tokens issued under the old password are revoked, matching the
        // spirit of a real password reset — the user must sign in again.
        $user->tokens()->delete();

        return response()->json(['message' => 'Password reset.']);
    }

    private function present(User $user): array
    {
        return array_merge($user->toArray(), [
            'roles' => $user->getRoleNames()->values(),
        ]);
    }
}
