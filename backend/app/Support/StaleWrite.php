<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;

/**
 * Optimistic concurrency for the screens several managers work on at once (§28).
 *
 * Every table this guards already keeps millisecond `updated_at` timestamps
 * (`$table->timestamps(3)`), so there is no version column to add and no new
 * concept to maintain: the client sends back the `updated_at` it loaded, and a
 * write is refused if the row has moved on since.
 *
 * Deliberately opt-in per request — a client that sends no
 * `expected_updated_at` behaves exactly as it did before, so nothing that
 * already worked starts failing.
 *
 * 409 Conflict rather than 422: the request is perfectly valid, it is the
 * *state* that has changed underneath it.
 */
class StaleWrite
{
    public const MESSAGE = 'This record was updated by another user. Please reload the latest version before editing.';

    /** @return JsonResponse|null the response to return immediately, or null to carry on */
    public static function check(Model $model, ?string $expectedUpdatedAt): ?JsonResponse
    {
        if (blank($expectedUpdatedAt)) {
            return null;
        }

        $current = $model->updated_at;
        if ($current === null) {
            return null;
        }

        // Compared as instants, not as strings: the same moment can be spelled
        // several ways once it has been through JSON and a browser.
        try {
            $expected = Carbon::parse($expectedUpdatedAt);
        } catch (\Throwable) {
            return null;
        }

        if ($expected->equalTo($current)) {
            return null;
        }

        return response()->json([
            'message' => self::MESSAGE,
            'current_updated_at' => $current->toJSON(),
        ], 409);
    }
}
