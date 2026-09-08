import { useState } from 'react'
import { KeyRound, Pencil, Power, Search, Trash2, UserCog, Users as UsersIcon } from 'lucide-react'
import type { AppUser } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHead } from '@/components/SortableHead'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSortableSearch } from '@/hooks/useSortableSearch'
import { useAuth, usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDateTime } from '@/utils/format'

export function UserTable({
  users,
  onEdit,
  onToggleActive,
  onResetPassword,
  onDelete,
}: {
  users: AppUser[]
  onEdit: (user: AppUser) => void
  onToggleActive: (user: AppUser) => void
  onResetPassword: (user: AppUser) => void
  onDelete: (user: AppUser) => void
}) {
  const { user: currentUser } = useAuth()
  const canEdit = usePermission(PERMISSIONS.USERS_EDIT)
  const canDelete = usePermission(PERMISSIONS.USERS_DELETE)

  const [pendingDelete, setPendingDelete] = useState<AppUser | null>(null)

  const { search, setSearch, sortKey, direction, toggleSort, rows: sorted } = useSortableSearch({
    rows: users,
    searchText: (u) => `${u.name} ${u.email} ${u.roles.join(' ')}`,
    sorters: {
      name: (a, b) => a.name.localeCompare(b.name),
      created: (a, b) => a.createdAt.localeCompare(b.createdAt),
    },
    defaultSortKey: 'name',
    defaultDirection: 'asc',
  })

  return (
    <Section
      title="Users"
      description={`${users.length} users`}
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, role…"
            className="h-8 w-56 pl-8 text-xs"
          />
        </div>
      }
      noPadding
    >
      {users.length === 0 ? (
        <EmptyState icon={UsersIcon} size="sm" title="No users yet" description="Add the first user above." />
      ) : sorted.length === 0 ? (
        <EmptyState icon={Search} size="sm" title="No matches" description="Try a different search." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Name" sortKey="name" activeKey={sortKey} direction={direction} onSort={toggleSort} />
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <SortableHead label="Created" sortKey="created" activeKey={sortKey} direction={direction} onSort={toggleSort} />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((user) => {
              const isSelf = currentUser?.id === user.id
              return (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    {user.name}
                    {isSelf && <span className="ml-1.5 text-2xs text-muted-foreground">(you)</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    {user.roles.length > 0 ? (
                      user.roles.map((role) => (
                        <Badge key={role} variant="primary" className="mr-1">
                          {role}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-2xs text-muted-foreground">No role</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'success' : 'outline'}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(user.createdAt)}</TableCell>
                  <TableCell numeric>
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <Button size="icon-sm" variant="ghost" onClick={() => onEdit(user)} aria-label={`Edit ${user.name}`}>
                          <Pencil />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                          disabled={isSelf}
                          onClick={() => onToggleActive(user)}
                          aria-label={user.isActive ? `Deactivate ${user.name}` : `Activate ${user.name}`}
                        >
                          <Power />
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => onResetPassword(user)}
                          aria-label={`Reset password for ${user.name}`}
                        >
                          <KeyRound />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                          disabled={isSelf}
                          onClick={() => setPendingDelete(user)}
                          aria-label={`Remove ${user.name}`}
                        >
                          <Trash2 />
                        </Button>
                      )}
                      {!canEdit && !canDelete && (
                        <span className="text-2xs text-muted-foreground">
                          <UserCog className="inline h-3 w-3" aria-hidden />
                        </span>
                      )}
                    </div>
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
        description="They will no longer be able to sign in. This cannot be undone."
        confirmLabel="Remove user"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </Section>
  )
}
