<?php

namespace App\Http\Controllers;

use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;

abstract class Controller
{
    /**
     * Run a delete (or any write) and turn a FK "restrict" violation into a plain
     * 422 instead of a raw 500 — used wherever a master-data row (product, mesh
     * size, customer, ...) is still referenced by transactional records.
     */
    protected function guardedDelete(callable $action, string $inUseMessage): JsonResponse
    {
        try {
            $action();
        } catch (QueryException $e) {
            if ((int) $e->getCode() === 23000) {
                return response()->json(['message' => $inUseMessage], 422);
            }
            throw $e;
        }

        return response()->json(null, 204);
    }
}
