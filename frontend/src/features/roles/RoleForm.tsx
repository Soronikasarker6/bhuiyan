import { useEffect, useState } from 'react'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import type { Role } from '@/types'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PERMISSION_GROUPS } from '@/constants/permissions'

/**
 * Add or edit a role — a name plus a permission checklist grouped by module,
 * synced wholesale on save. Mirrors V12's own per-role checkbox list (see
 * `frontend-sap`'s user/role component) rather than a single-select of
 * "levels" — a role really is just an arbitrary, freely-editable permission
 * set, nothing more.
 */
export function RoleForm({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: Role | null
  onSubmit: (values: { name: string; permissions: string[] }) => void
}) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [nameError, setNameError] = useState<string | undefined>()

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '')
      setSelected(new Set(editing?.permissions ?? []))
      setNameError(undefined)
    }
  }, [open, editing])

  const toggle = (permission: string, checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(permission)
      else next.delete(permission)
      return next
    })
  }

  const toggleGroup = (permissions: string[], checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current)
      for (const p of permissions) {
        if (checked) next.add(p)
        else next.delete(p)
      }
      return next
    })
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Give the role a name.')
      return
    }
    onSubmit({ name: trimmed, permissions: Array.from(selected) })
    onOpenChange(false)
  }

  const isAdmin = editing?.name === 'Admin'

  return (
    <Dialog
      open={open}
      headerText={editing ? `Edit ${editing.name}` : 'Add a role'}
      onClose={() => onOpenChange(false)}
      className="w-[calc(100vw-2rem)] max-w-xl"
    >
      <form id="role-form" onSubmit={submit} noValidate className="space-y-3 py-1">
        <Field label="Role name" error={nameError} htmlFor="role-name">
          <Input
            id="role-name"
            placeholder="Manager"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isAdmin}
            autoFocus
          />
        </Field>

        <div>
          <p className="mb-1.5 text-[0.8125rem] font-medium text-foreground/90">Permissions</p>
          <div className="max-h-[22rem] space-y-3 overflow-y-auto rounded-lg border border-border p-3">
            {PERMISSION_GROUPS.map((group) => {
              const allChecked = group.permissions.every((p) => selected.has(p))
              return (
                <div key={group.label}>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-border accent-primary-700"
                      checked={allChecked}
                      onChange={(e) => toggleGroup(group.permissions, e.target.checked)}
                    />
                    {group.label}
                  </label>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 pl-5">
                    {group.permissions.map((permission) => (
                      <label key={permission} className="flex items-center gap-2 text-xs text-foreground/90">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-border accent-primary-700"
                          checked={selected.has(permission)}
                          onChange={(e) => toggle(permission, e.target.checked)}
                        />
                        {permission}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </form>

      <Bar
        slot="footer"
        design="Footer"
        endContent={
          <>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="role-form" variant="success">
              {editing ? 'Save changes' : 'Add role'}
            </Button>
          </>
        }
      />
    </Dialog>
  )
}
