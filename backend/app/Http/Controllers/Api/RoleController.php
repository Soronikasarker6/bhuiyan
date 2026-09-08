<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRoleRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;

/**
 * Roles are freely created/edited/deleted here at runtime — same as V12's
 * RoleController — the seeded Admin/Manager/Staff (RoleSeeder) are only a
 * starting point, not a fixed structure.
 */
class RoleController extends Controller
{
    public function index()
    {
        return Role::with('permissions')->orderBy('name')->get()->map(fn (Role $r) => $this->present($r));
    }

    public function store(StoreRoleRequest $request)
    {
        $data = $request->validated();
        $role = Role::create(['name' => $data['name'], 'guard_name' => 'api']);
        $role->syncPermissions($data['permissions'] ?? []);

        return response()->json($this->present($role->load('permissions')), 201);
    }

    public function update(StoreRoleRequest $request, Role $role)
    {
        $data = $request->validated();
        $role->update(['name' => $data['name']]);
        $role->syncPermissions($data['permissions'] ?? []);

        return $this->present($role->fresh('permissions'));
    }

    public function destroy(Request $request, Role $role)
    {
        if ($role->name === 'Admin') {
            return response()->json(['message' => 'The Admin role cannot be deleted.'], 422);
        }

        // Spatie's role_id foreign keys cascade-delete on the pivot tables
        // rather than restrict, so a role assigned to users would otherwise
        // vanish from those users silently instead of blocking the delete.
        $assigned = DB::table('model_has_roles')->where('role_id', $role->id)->exists();
        if ($assigned) {
            return response()->json(['message' => 'This role is still assigned to one or more users — reassign them first.'], 422);
        }

        $role->delete();

        return response()->json(null, 204);
    }

    private function present(Role $role): array
    {
        return [
            'id' => (string) $role->id,
            'name' => $role->name,
            'permissions' => $role->permissions->pluck('name')->values(),
            'createdAt' => $role->created_at,
        ];
    }
}
