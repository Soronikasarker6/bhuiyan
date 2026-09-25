<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogger;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private AuditLogger $audit) {}

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        /** @var User $user */
        $user = Auth::user();

        if (! $user->is_active) {
            Auth::logout();
            throw ValidationException::withMessages([
                'email' => ['This account has been deactivated. Contact an administrator.'],
            ]);
        }

        $token = $user->createToken('bhuiyan-industry')->plainTextToken;

        // `actor` is passed explicitly here (the only place it is): a token
        // has just been minted but this request was never authenticated
        // through the guard, so `Auth::user()` inside the logger would be
        // empty. The User handed over is the one the backend itself just
        // verified the password against — never an id off the wire.
        $this->audit->record(AuditEntity::AUTH, $user->id, AuditAction::LOGIN, [
            'record' => $user->email,
            'actor' => $user,
            'summary' => "{$user->name} signed in",
        ]);

        return response()->json(['token' => $token, 'user' => $this->present($user)]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        $user->currentAccessToken()->delete();

        $this->audit->record(AuditEntity::AUTH, $user->id, AuditAction::LOGOUT, [
            'record' => $user->email,
            'actor' => $user,
            'summary' => "{$user->name} signed out",
        ]);

        return response()->json(['message' => 'Logged out.']);
    }

    public function me(Request $request)
    {
        return response()->json($this->present($request->user()));
    }

    /**
     * Shapes the session user like V12's login/getUserByToken responses: the
     * user's own fields plus a flat `permissions` name list
     * (`getAllPermissions()` already resolves permissions granted directly
     * *or* through any assigned role) and the role names for display.
     */
    private function present(User $user): array
    {
        return array_merge($user->toArray(), [
            'roles' => $user->getRoleNames()->values(),
            'permissions' => $user->getAllPermissions()->pluck('name')->values(),
        ]);
    }
}
