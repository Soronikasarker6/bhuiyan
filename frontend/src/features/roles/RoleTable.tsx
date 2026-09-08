import { useState } from 'react'
import { Lock, Pencil, Shield, Trash2 } from 'lucide-react'
import type { Role } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'

export function RoleTable({
  roles,
  onEdit,
  onDelete,
}: {
  roles: Role[]
  onEdit: (role: Role) => void
  onDelete: (role: Role) => void
}) {
  const canEdit = usePermission(PERMISSIONS.ROLES_EDIT)
  const [pendingDelete, setPendingDelete] = useState<Role | null>(null)

  return (
    <Section title="Roles" description={`${roles.length} roles — Role → Permissions → User Access`} noPadding>
      {roles.length === 0 ? (
        <EmptyState icon={Shield} size="sm" title="No roles yet" description="Add one to start assigning permissions." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((role) => {
              const isAdmin = role.name === 'Admin'
              return (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {role.name}
                      {isAdmin && (
                        <Badge variant="primary">
                          <Lock className="h-2.5 w-2.5" aria-hidden />
                          Protected
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {role.permissions.length === 0 ? 'No permissions' : `${role.permissions.length} permissions`}
                  </TableCell>
                  <TableCell numeric>
                    {canEdit && (
                      <div className="flex justify-end gap-1">
                        <Button size="icon-sm" variant="ghost" onClick={() => onEdit(role)} aria-label={`Edit ${role.name}`}>
                          <Pencil />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                          disabled={isAdmin}
                          onClick={() => setPendingDelete(role)}
                          aria-label={isAdmin ? `${role.name} cannot be removed` : `Remove ${role.name}`}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Remove ${pendingDelete.name}?` : ''}
        description="Any user currently holding this role loses every permission it granted. Reassign them first if that's not intended."
        confirmLabel="Remove role"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </Section>
  )
}
