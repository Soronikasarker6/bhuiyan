import { useState } from 'react'
import { Scale, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { MeshSize } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Switch } from '@/components/ui/misc'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { now, uid } from '@/utils/id'

/**
 * Mesh / size — a configurable sale attribute, not a product.
 *
 * Any product can be sold against any mesh size, so this list is independent
 * of the product list. Adding "40 Mesh" here is all it takes for it to show
 * up on the sales form — no code change, ever.
 */
export function MeshSizeManager({
  meshSizes,
  usageOf,
  onChange,
}: {
  meshSizes: MeshSize[]
  usageOf: (meshSizeId: string) => number
  onChange: (next: MeshSize[]) => void
}) {
  const [name, setName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<MeshSize | null>(null)

  const add = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Give the mesh size a name')
      return
    }
    if (meshSizes.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('That mesh size already exists')
      return
    }

    onChange([...meshSizes, { id: uid(), name: trimmed, active: true, createdAt: now() }])
    setName('')
    toast.success(`${trimmed} added`)
  }

  const toggleActive = (mesh: MeshSize) =>
    onChange(meshSizes.map((m) => (m.id === mesh.id ? { ...m, active: !m.active } : m)))

  const remove = (mesh: MeshSize) => {
    onChange(meshSizes.filter((m) => m.id !== mesh.id))
    setPendingDelete(null)
    toast.success(`${mesh.name} removed`)
  }

  return (
    <Section
      title="Mesh / size"
      description="A configurable attribute any product can be sold against — 10 Mesh, 20 Mesh, Powder, or whatever the business introduces next."
    >
      {meshSizes.length === 0 ? (
        <EmptyState
          icon={Scale}
          size="sm"
          title="No mesh sizes yet"
          description="Add the grades or sizes your sales are quoted in."
        />
      ) : (
        <ul className="mb-4 flex flex-wrap gap-2">
          {meshSizes.map((mesh) => {
            const used = usageOf(mesh.id)

            return (
              <li
                key={mesh.id}
                className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 py-1.5 pl-3 pr-1.5"
              >
                <span className="text-xs font-medium">{mesh.name}</span>
                {!mesh.active && <Badge variant="outline">Inactive</Badge>}
                {used > 0 && <span className="font-mono tabular text-2xs text-muted-foreground">{used}</span>}
                <Switch
                  checked={mesh.active}
                  onCheckedChange={() => toggleActive(mesh)}
                  aria-label={`${mesh.active ? 'Deactivate' : 'Activate'} ${mesh.name}`}
                />
                <button
                  type="button"
                  onClick={() => setPendingDelete(mesh)}
                  className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${mesh.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2 border-t border-border pt-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 40 Mesh" aria-label="New mesh size" />
        <Button type="submit" variant="success">
          + Add
        </Button>
      </form>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Remove "${pendingDelete.name}"?` : ''}
        description={
          pendingDelete && usageOf(pendingDelete.id) > 0
            ? `${usageOf(pendingDelete.id)} past sale items use this mesh size. They keep it — this only stops it appearing on new sales.`
            : 'No sales use this mesh size, so nothing is affected.'
        }
        confirmLabel="Remove mesh size"
        onConfirm={() => pendingDelete && remove(pendingDelete)}
      />
    </Section>
  )
}
