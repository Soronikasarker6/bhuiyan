<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Permissions;

/** Read-only — the fixed list of permission names, for the Roles editor's checklist. */
class PermissionController extends Controller
{
    public function index()
    {
        return response()->json(Permissions::all());
    }
}
