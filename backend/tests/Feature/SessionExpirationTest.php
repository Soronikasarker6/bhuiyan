<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\User;
use App\Services\SessionPolicy;
use App\Support\AuditAction;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * The sign-in session policy — 8-hour absolute lifetime, 60-minute idle
 * timeout — exercised the way a browser meets it: real bearer tokens from
 * `/api/login`, against real protected routes, with the clock moved by
 * Laravel's time travel rather than by waiting.
 */
class SessionExpirationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
        $this->seed(RoleSeeder::class);

        config(['auth.session.max_lifetime' => 480, 'auth.session.idle_timeout' => 60]);
        $this->freezeSecond();
    }

    public function test_a_fresh_sign_in_reaches_protected_routes_and_reports_its_lifetime(): void
    {
        $token = $this->signIn($this->manager('Manager A'));

        $this->api($token, 'GET', '/api/app-data')->assertOk();

        $this->api($token, 'GET', '/api/me')
            ->assertOk()
            ->assertJsonPath('email', 'manager-a@example.test')
            ->assertJsonPath('session.idle_timeout', 3600)
            ->assertJsonPath('session.absolute_expires_in', 8 * 3600)
            ->assertJsonPath('session.expires_in', 3600);
    }

    public function test_login_stores_the_absolute_expiry_on_the_token(): void
    {
        $this->signIn($this->manager('Manager A'));

        $token = PersonalAccessToken::sole();
        $this->assertTrue($token->expires_at->equalTo(now()->addHours(8)));
    }

    public function test_session_expires_after_60_minutes_idle(): void
    {
        $token = $this->signIn($this->manager('Manager A'));

        $this->travel(59)->minutes();
        $this->api($token, 'GET', '/api/app-data')->assertOk();

        // 60 minutes after that last request — not after sign-in.
        $this->travel(60)->minutes();
        $this->api($token, 'GET', '/api/app-data')
            ->assertUnauthorized()
            ->assertExactJson([
                'message' => 'Your session has expired. Please log in again.',
                'reason' => SessionPolicy::REASON_IDLE,
            ]);

        $this->assertSame(0, PersonalAccessToken::count());
    }

    public function test_session_expires_8_hours_after_sign_in_however_active_the_user_is(): void
    {
        $token = $this->signIn($this->manager('Manager A'));

        // A request every 30 minutes — never idle — right up to the limit.
        for ($elapsed = 30; $elapsed < 480; $elapsed += 30) {
            $this->travel(30)->minutes();
            $this->api($token, 'GET', '/api/app-data')->assertOk();
        }

        $this->travel(30)->minutes(); // exactly 8h after sign-in
        $this->api($token, 'GET', '/api/app-data')
            ->assertUnauthorized()
            ->assertJsonPath('reason', SessionPolicy::REASON_ABSOLUTE);
    }

    public function test_continue_session_renews_idle_time_but_never_the_absolute_limit(): void
    {
        $token = $this->signIn($this->manager('Manager A'));

        $this->travel(50)->minutes();
        $this->api($token, 'POST', '/api/session/keep-alive')
            ->assertOk()
            ->assertJsonPath('session.expires_in', 3600);

        // Keep "continuing" every 55 minutes until 7h15m in.
        for ($i = 0; $i < 7; $i++) {
            $this->travel(55)->minutes();
            $this->api($token, 'POST', '/api/session/keep-alive')->assertOk();
        }

        // 7h55m: a full idle hour would run past 8h, so only 5 minutes remain.
        $this->travel(40)->minutes();
        $this->api($token, 'POST', '/api/session/keep-alive')
            ->assertOk()
            ->assertJsonPath('session.absolute_expires_in', 300)
            ->assertJsonPath('session.expires_in', 300);

        $this->travel(5)->minutes();
        $this->api($token, 'POST', '/api/session/keep-alive')
            ->assertUnauthorized()
            ->assertJsonPath('reason', SessionPolicy::REASON_ABSOLUTE);
    }

    public function test_logout_invalidates_the_token_immediately(): void
    {
        $token = $this->signIn($this->manager('Manager A'));

        $this->api($token, 'POST', '/api/logout')->assertOk();

        $this->assertSame(0, PersonalAccessToken::count());
        $this->api($token, 'GET', '/api/me')
            ->assertUnauthorized()
            ->assertJsonPath('reason', 'unauthenticated');
    }

    public function test_an_expired_token_gets_no_protected_data_and_stays_dead(): void
    {
        Customer::factory()->create(['name' => 'Confidential Customer Ltd']);
        $token = $this->signIn($this->manager('Manager A'));

        $this->api($token, 'GET', '/api/customers')->assertOk()->assertSee('Confidential Customer Ltd');

        $this->travel(61)->minutes();

        $expired = $this->api($token, 'GET', '/api/customers')->assertUnauthorized();
        $this->assertStringNotContainsString('Confidential Customer Ltd', $expired->getContent());

        // An old tab retrying, or a refresh, cannot revive it.
        $this->travelBack();
        $this->freezeSecond();
        $this->api($token, 'GET', '/api/customers')->assertUnauthorized();
        $this->api($token, 'POST', '/api/session/keep-alive')->assertUnauthorized();
        $this->api($token, 'GET', '/api/me')->assertUnauthorized();
    }

    public function test_tokens_minted_before_the_policy_existed_are_held_to_it(): void
    {
        $user = $this->manager('Manager A');
        $token = $user->createToken('legacy')->plainTextToken; // no expires_at
        PersonalAccessToken::query()->update(['last_used_at' => now()->addHours(8)->subMinutes(5)]);

        $this->travel(8)->hours();

        $this->api($token, 'GET', '/api/app-data')
            ->assertUnauthorized()
            ->assertJsonPath('reason', SessionPolicy::REASON_ABSOLUTE);
    }

    public function test_expiry_is_audited_against_the_session_owner(): void
    {
        $token = $this->signIn($this->manager('Manager A'));

        $this->travel(2)->hours();
        $this->api($token, 'GET', '/api/app-data')->assertUnauthorized();

        $log = AuditLog::where('action', AuditAction::SESSION_EXPIRED)->sole();
        $this->assertSame('Manager A', $log->performed_by_user_name);
        $this->assertSame('Authentication', $log->module);
        $this->assertSame(SessionPolicy::REASON_IDLE, $log->metadata['reason']);
    }

    public function test_each_sign_in_is_independent(): void
    {
        $a = $this->manager('Manager A');
        $b = $this->manager('Manager B');

        $aToken = $this->signIn($a);
        $bToken = $this->signIn($b);
        $aSecondBrowser = $this->signIn($a);

        // A signs out of one browser: B, and A's other browser, carry on.
        $this->api($aToken, 'POST', '/api/logout')->assertOk();
        $this->api($bToken, 'GET', '/api/app-data')->assertOk();
        $this->api($aSecondBrowser, 'GET', '/api/app-data')->assertOk();

        // A's other browser goes idle; B keeps working throughout.
        $this->travel(40)->minutes();
        $this->api($bToken, 'GET', '/api/app-data')->assertOk();
        $this->travel(40)->minutes();

        $this->api($aSecondBrowser, 'GET', '/api/app-data')->assertUnauthorized();
        $this->api($bToken, 'GET', '/api/app-data')->assertOk();

        $this->assertSame([$b->id], PersonalAccessToken::pluck('tokenable_id')->all());
    }

    public function test_signing_in_again_starts_a_fresh_lifetime(): void
    {
        $user = $this->manager('Manager A');
        $old = $this->signIn($user);

        $this->travel(8)->hours();
        $this->api($old, 'GET', '/api/app-data')->assertUnauthorized();

        $fresh = $this->signIn($user);
        $this->assertNotSame($old, $fresh);
        $this->api($fresh, 'GET', '/api/me')->assertOk()->assertJsonPath('session.absolute_expires_in', 8 * 3600);
    }

    public function test_permissions_are_still_enforced_within_a_valid_session(): void
    {
        $token = $this->signIn($this->manager('Manager A'));

        // Admin-only, whatever the session's state.
        $this->api($token, 'GET', '/api/audit-logs')->assertForbidden();
    }

    public function test_a_deactivated_users_open_session_is_ended(): void
    {
        $user = $this->manager('Manager A');
        $token = $this->signIn($user);

        $user->update(['is_active' => false]);

        $this->api($token, 'GET', '/api/app-data')
            ->assertUnauthorized()
            ->assertJsonPath('reason', SessionPolicy::REASON_DEACTIVATED);
    }

    public function test_the_lifetimes_come_from_configuration(): void
    {
        config(['auth.session.max_lifetime' => 120, 'auth.session.idle_timeout' => 15]);
        $token = $this->signIn($this->manager('Manager A'));

        $this->api($token, 'GET', '/api/me')
            ->assertJsonPath('session.idle_timeout', 15 * 60)
            ->assertJsonPath('session.absolute_expires_in', 120 * 60);

        $this->travel(15)->minutes();
        $this->api($token, 'GET', '/api/me')->assertUnauthorized();
    }

    public function test_failed_sign_ins_are_audited_and_throttled(): void
    {
        $user = $this->manager('Manager A');

        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/login', ['email' => $user->email, 'password' => 'wrong'])
                ->assertUnprocessable();
        }
        $this->postJson('/api/login', ['email' => $user->email, 'password' => 'wrong'])
            ->assertTooManyRequests();

        $failures = AuditLog::where('action', AuditAction::LOGIN_FAILED)->get();
        $this->assertCount(10, $failures);
        $this->assertSame('System', $failures->first()->performed_by_user_name);
        $this->assertSame($user->email, $failures->first()->record_label);
    }

    // ------------------------------------------------------------ helpers

    private function manager(string $name): User
    {
        $user = User::factory()->create([
            'name' => $name,
            'email' => str($name)->slug().'@example.test',
            'password' => 'secret-password',
        ]);
        $user->assignRole('Manager');

        return $user;
    }

    private function signIn(User $user): string
    {
        $token = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'secret-password',
        ])->assertOk()->json('token');

        return $token;
    }

    /** One request carrying only this bearer token, as a browser tab would send it. */
    private function api(string $token, string $method, string $uri): TestResponse
    {
        // `/api/login` also signs the in-process web guard in, and the test
        // app keeps that session between requests (a real `/api` request
        // has no session at all) — dropped so only the bearer token counts.
        $this->app['session']->driver()->flush();
        $this->app['auth']->forgetGuards();

        return $this->withToken($token)->json($method, $uri);
    }
}
