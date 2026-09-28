<?php

namespace App\Providers;

use App\Services\SessionPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Every bearer token is checked against the sign-in session policy
        // (8-hour absolute lifetime, 60-minute idle timeout) before Sanctum
        // accepts it — see SessionPolicy. Evaluated first so an expired
        // token is deleted and audited even when Sanctum's own `expires_at`
        // check had already rejected it.
        Sanctum::authenticateAccessTokensUsing(
            fn (PersonalAccessToken $token, bool $isValid) => app(SessionPolicy::class)->validate($token) && $isValid,
        );

        // Keyed on the email being tried plus the caller's IP, so several
        // managers behind one office IP are not locked out by one person's
        // typos. Also bounds how many LOGIN_FAILED audit rows an anonymous
        // caller can write.
        RateLimiter::for('login', fn (Request $request) => Limit::perMinute(10)->by(
            Str::lower((string) $request->input('email')).'|'.$request->ip(),
        ));
    }
}
