<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogger;
use App\Services\SessionPolicy;
use App\Support\AuditAction;
use App\Support\AuditEntity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function __construct(private AuditLogger $audit, private SessionPolicy $sessions) {}

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials)) {
            $this->recordFailedLogin($credentials['email'], 'invalid_credentials');

            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        /** @var User $user */
        $user = Auth::user();

        if (! $user->is_active) {
            Auth::logout();
            $this->recordFailedLogin($user->email, 'account_deactivated', $user->id);

            throw ValidationException::withMessages([
                'email' => ['This account has been deactivated. Contact an administrator.'],
            ]);
        }

        // A brand-new random token per sign-in — the client never supplies
        // one beforehand, so there is no session to fixate — stamped with the
        // absolute expiry SessionPolicy enforces on every later request.
        $newToken = $user->createToken('bhuiyan-industry', ['*'], $this->sessions->newTokenExpiry());
        $token = $newToken->plainTextToken;

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

        return response()->json([
            'token' => $token,
            'user' => $this->present($user),
            'session' => $this->sessions->describe($newToken->accessToken),
        ]);
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

    /**
     * `session` sits alongside the user's own fields so a page reload learns
     * the remaining lifetime in the same round trip that restores the user.
     */
    public function me(Request $request)
    {
        return response()->json(array_merge(
            $this->present($request->user()),
            ['session' => $this->describeSession($request)],
        ));
    }

    /**
     * "Continue session". Reaching this action at all is what renews the idle
     * timer — Sanctum stamps `last_used_at` on every authenticated request —
     * and it can never move the absolute limit, which is fixed at sign-in.
     */
    public function keepAlive(Request $request)
    {
        return response()->json(['session' => $this->describeSession($request)]);
    }

    private function describeSession(Request $request): ?array
    {
        $token = $request->user()->currentAccessToken();

        return $token instanceof PersonalAccessToken ? $this->sessions->describe($token) : null;
    }

    /**
     * Recorded without an actor: nobody was authenticated, and naming the
     * account whose email was typed would let anyone put words in that
     * user's mouth. The attempted email is the record label instead.
     */
    private function recordFailedLogin(string $email, string $reason, ?int $userId = null): void
    {
        $this->audit->record(AuditEntity::AUTH, $userId, AuditAction::LOGIN_FAILED, [
            'record' => $email,
            'summary' => $reason === 'account_deactivated'
                ? "Sign-in refused for deactivated account {$email}"
                : "Failed sign-in attempt for {$email}",
            'metadata' => ['reason' => $reason],
        ]);
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
