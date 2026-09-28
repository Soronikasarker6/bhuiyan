<?php

use App\Exceptions\BusinessRuleException;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\ShipmentClosedException;
use App\Services\SessionPolicy;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Spatie\Permission\Exceptions\UnauthorizedException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [
            \Illuminate\Http\Middleware\HandleCors::class,
        ]);

        // Spatie's own route middleware — present in the package but never
        // registered in the V12 project this pattern is adapted from; wiring
        // it up here is what makes backend authorization real instead of
        // just a client-side hint (see routes/api.php).
        $middleware->alias([
            'role' => \Spatie\Permission\Middleware\RoleMiddleware::class,
            'permission' => \Spatie\Permission\Middleware\PermissionMiddleware::class,
            'role_or_permission' => \Spatie\Permission\Middleware\RoleOrPermissionMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Business-rule violations from the Service layer render as 422s with a
        // plain message, the same shape validation errors already take.
        $exceptions->render(function (InsufficientStockException|ShipmentClosedException|BusinessRuleException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => $e->getMessage()], 422);
            }
        });

        // Always a JSON 401 for the API — never the default redirect to a
        // `login` route this backend doesn't have — carrying why, when the
        // session policy was what refused the token, so the client can say
        // "your session has expired" rather than a bare "unauthenticated".
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            if ($request->is('api/*')) {
                $reason = $request->attributes->get(SessionPolicy::REQUEST_ATTRIBUTE);

                return response()->json([
                    'message' => match ($reason) {
                        null => 'Unauthenticated.',
                        SessionPolicy::REASON_DEACTIVATED => 'This account has been deactivated. Contact an administrator.',
                        default => 'Your session has expired. Please log in again.',
                    },
                    'reason' => $reason ?? 'unauthenticated',
                ], 401);
            }
        });

        // Spatie's own permission middleware throws this on a denied route —
        // render it as plain JSON like every other API error, not its default
        // HTML page.
        $exceptions->render(function (UnauthorizedException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => $e->getMessage()], 403);
            }
        });
    })->create();
