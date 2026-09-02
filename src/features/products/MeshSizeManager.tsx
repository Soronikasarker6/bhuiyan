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
 * Mesh / size — a global catalog, not scoped to any one product.
 *
 * Any product can be produced or sold against any mesh size, each with its
 * own configurable bag weight — Production and Sales both convert bags to kg
 * and tons through the same number set here. Adding "1200" or changing what
 * "250" weighs is a form here, never a code change.
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
  const [bagKg, setBagKg] = useState('50')
  const [pendingDelete, setPendingDelete] = useState<MeshSize | null>(null)

  const add = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    const weight = Number(bagKg)

    if (!trimmed) {
      toast.error('Give the mesh size a name')
      return
    }
    if (meshSizes.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('That mesh size already exists')
      return
    }
    if (!weight || weight <= 0) {
      toast.error('Enter a bag weight greater than zero')
      return
    }

    onChange([...meshSizes, { id: uid(), name: trimmed, bagKg: weight, active: true, createdAt: now() }])
    setName('')
    setBagKg('50')
    toast.success(`${trimmed} added`)
  }

  const updateBagKg = (mesh: MeshSize, value: string) => {
    const weight = Number(value)
    if (!Number.isFinite(weight) || weight < 0) return
    onChange(meshSizes.map((m) => (m.id === mesh.id ? { ...m, bagKg: weight } : m)))
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
      description="A shared catalog every product produces and sells against — 250, 400, 500, 800, 1000, or whatever the business introduces next. Each carries its own bag weight."
    >
      {meshSizes.length === 0 ? (
        <EmptyState
          icon={Scale}
          size="sm"
          title="No mesh sizes yet"
          description="Add the mesh sizes your yard bags into."
        />
      ) : (
        <ul className="mb-4 space-y-2">
          {meshSizes.map((mesh) => {
            const used = usageOf(mesh.id)

            return (
              <li
                key={mesh.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
              >
                <span className="min-w-[4rem] text-[0.8125rem] font-semibold">{mesh.name}</span>

                <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  Bag weight
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={mesh.bagKg}
                    onChange={(e) => updateBagKg(mesh, e.target.value)}
                    className="h-7 w-20 px-2 text-xs"
                    aria-label={`Bag weight for ${mesh.name}`}
                  />
                  kg
                </label>

                {!mesh.active && <Badge variant="outline">Inactive</Badge>}
                {used > 0 && (
                  <span className="text-2xs text-muted-foreground">
                    {used} record{used === 1 ? '' : 's'}
                  </span>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    checked={mesh.active}
                    onCheckedChange={() => toggleActive(mesh)}
                    aria-label={`${mesh.active ? 'Deactivate' : 'Activate'} ${mesh.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => setPendingDelete(mesh)}
                    className="grid h-6 w-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${mesh.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 1200" aria-label="New mesh size" className="max-w-[10rem]" />
        <Input
          type="number"
          min={0}
          step="1"
          value={bagKg}
          onChange={(e) => setBagKg(e.target.value)}
          placeholder="Bag weight (kg)"
          aria-label="Bag weight (kg)"
          className="max-w-[10rem]"
        />
        <Button type="submit" variant="success">
          + Add mesh size
        </Button>
      </form>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Remove "${pendingDelete.name}"?` : ''}
        description={
          pendingDelete && usageOf(pendingDelete.id) > 0
            ? `${usageOf(pendingDelete.id)} past production or sale records use this mesh size. They keep it — this only stops it appearing on new forms.`
            : 'Nothing uses this mesh size yet, so nothing is affected.'
        }
        confirmLabel="Remove mesh size"
        onConfirm={() => pendingDelete && remove(pendingDelete)}
      />
    </Section>
  )
}
