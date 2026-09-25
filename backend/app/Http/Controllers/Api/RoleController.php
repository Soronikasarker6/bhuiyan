<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRoleRequest;
use App\Services\AuditLogger;
use App\Support\AuditAction;
use App\Support\AuditEntity;
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
    public function __construct(private AuditLogger $audit) {}

    public function index()
    {
        return Role::with('permissions')->orderBy('name')->get()->map(fn (Role $r) => $this->present($r));
    }

    public function store(StoreRoleRequest $request)
    {
        $data = $request->validated();
        $role = Role::create(['name' => $data['name'], 'guard_name' => 'api']);
        $role->syncPermissions($data['permissions'] ?? []);

        $this->audit->record(AuditEntity::ROLE, $role->id, AuditAction::PERMISSION_CHANGE, [
            'record' => $role->name,
            'after' => $this->auditSnapshot($role->load('permissions')),
            'summary' => sprintf(
                'Created role %s with %d permissions',
                $role->name,
                count($data['permissions'] ?? []),
            ),
        ]);

        return response()->json($this->present($role->load('permissions')), 201);
    }

    public function update(StoreRoleRequest $request, Role $role)
    {
        $data = $request->validated();
        $before = $this->auditSnapshot($role->load('permissions'));

        $role->update(['name' => $data['name']]);
        $role->syncPermissions($data['permissions'] ?? []);

        // What a role may do is what everyone holding it may do, so this is
        // recorded as a permission change rather than a plain edit (§21) —
        // which is also why it does not go through `recordUpdate`, whose
        // action is always UPDATE.
        $after = $this->auditSnapshot($role->fresh('permissions'));

        if ($this->audit->changedKeys($before, $after) !== []) {
            $this->audit->record(AuditEntity::ROLE, $role->id, AuditAction::PERMISSION_CHANGE, [
                'record' => $role->name,
                'before' => $before,
                'after' => $after,
                'summary' => $this->describePermissionChange($role->name, $before, $after),
            ]);
        }

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

        $before = $this->auditSnapshot($role->load('permissions'));
        $name = $role->name;

        $role->delete();

        $this->audit->record(AuditEntity::ROLE, $role->id, AuditAction::DELETE, [
            'record' => $name,
            'before' => $before,
            'summary' => "Deleted role {$name}",
        ]);

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

    /** Sorted so a diff shows what was granted or revoked, not a reordering. */
    private function auditSnapshot(Role $role): array
    {
        return [
            'name' => $role->name,
            'permissions' => $role->permissions->pluck('name')->sort()->values()->all(),
        ];
    }

    private function describePermissionChange(string $name, array $before, array $after): string
    {
        $granted = array_diff($after['permissions'], $before['permissions']);
        $revoked = array_diff($before['permissions'], $after['permissions']);

        $parts = [];
        if ($before['name'] !== $after['name']) {
            $parts[] = "renamed from {$before['name']}";
        }
        if ($granted !== []) {
            $parts[] = count($granted).' permission(s) granted';
        }
        if ($revoked !== []) {
            $parts[] = count($revoked).' permission(s) revoked';
        }

        return "Role {$name}: ".(implode(', ', $parts) ?: 'no effective change');
    }
}
