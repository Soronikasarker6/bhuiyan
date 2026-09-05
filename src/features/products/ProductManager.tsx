import { useState } from 'react'
import { Box, Package, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Product } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Badge, Switch } from '@/components/ui/misc'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { now, uid } from '@/utils/id'
import { cn } from '@/utils/cn'

/**
 * Products — the stone types the business trades in.
 *
 * Nothing downstream hard-codes a name: every product on every entry form
 * came from this list. Retiring one (the switch) removes it from new entry
 * forms while every past production and sale record keeps showing its name,
 * exactly like the cash ledger's accounts and categories.
 */
export function ProductManager({
  products,
  usageOf,
  onChange,
}: {
  products: Product[]
  usageOf: (productId: string) => number
  onChange: (next: Product[]) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null)
  const [form, setForm] = useState({ name: '', code: '', description: '', unit: 'Ton' })

  const resetForm = () => setForm({ name: '', code: '', description: '', unit: 'Ton' })

  const add = (event: React.FormEvent) => {
    event.preventDefault()
    const name = form.name.trim()
    const code = form.code.trim().toUpperCase()

    if (!name) {
      toast.error('Give the product a name')
      return
    }
    if (!code) {
      toast.error('Give the product a code / SKU')
      return
    }
    if (products.some((p) => p.code.toLowerCase() === code.toLowerCase())) {
      toast.error('That product code is already in use')
      return
    }

    onChange([
      ...products,
      {
        id: uid(),
        name,
        code,
        description: form.description.trim() || undefined,
        unit: form.unit.trim() || 'Ton',
        active: true,
        createdAt: now(),
      },
    ])

    resetForm()
    toast.success(`${name} added`)
  }

  const save = (product: Product, patch: Partial<Product>) => {
    onChange(products.map((p) => (p.id === product.id ? { ...p, ...patch } : p)))
  }

  const remove = (product: Product) => {
    onChange(products.filter((p) => p.id !== product.id))
    setPendingDelete(null)
    toast.success(`${product.name} removed`)
  }

  return (
    <Section
      title="Products"
      description="Every product on a production or sales form comes from this list. Add a new stone type any time — nothing here needs a code change."
    >
      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          size="sm"
          title="No products yet"
          description="Add your first stone type below to start recording production and sales."
        />
      ) : (
        <ul className="mb-4 space-y-2">
          {products.map((product) => {
            const used = usageOf(product.id)
            const editing = editingId === product.id

            return (
              <li
                key={product.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5 sm:flex-row sm:items-start"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={cn(
                      'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                      product.active ? 'bg-primary-50 text-primary-700' : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    <Box className="h-4 w-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <EditRow
                        product={product}
                        onCancel={() => setEditingId(null)}
                        onSave={(patch) => {
                          save(product, patch)
                          setEditingId(null)
                          toast.success('Product updated')
                        }}
                      />
                    ) : (
                      <>
                        <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-semibold">
                          {product.name}
                          <span className="rounded bg-card px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                            {product.code}
                          </span>
                          {!product.active && <Badge variant="outline">Inactive</Badge>}
                        </p>
                        {product.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{product.description}</p>
                        )}
                        <p className="mt-0.5 text-2xs text-muted-foreground">
                          Unit: {product.unit} · {used === 0 ? 'No records yet' : `${used} records`}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {!editing && (
                  <div className="flex shrink-0 items-center gap-2 self-start">
                    <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                      Active
                      <Switch
                        checked={product.active}
                        onCheckedChange={(checked) => save(product, { active: checked })}
                        aria-label={`${product.active ? 'Deactivate' : 'Activate'} ${product.name}`}
                      />
                    </label>
                    <Button size="icon-sm" variant="ghost" onClick={() => setEditingId(product.id)} aria-label={`Edit ${product.name}`}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete(product)}
                      aria-label={`Remove ${product.name}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={add} className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <Field label="Product name">
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Vietnam White Limestone"
          />
        </Field>
        <Field label="Code / SKU">
          <Input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder="e.g. VWL"
          />
        </Field>
        <Field label="Unit">
          <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="Ton" />
        </Field>
        <Field label="Description (optional)">
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Short note for the team"
          />
        </Field>
        <Button type="submit" variant="success" className="sm:col-span-2">
          + Add product
        </Button>
      </form>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Remove ${pendingDelete.name}?` : ''}
        description={
          pendingDelete && usageOf(pendingDelete.id) > 0
            ? `This product has ${usageOf(pendingDelete.id)} production or sales records against it. Those records are kept and will still show its name, but it will no longer appear on new entry forms.`
            : 'This product has no records against it, so nothing is lost.'
        }
        confirmLabel="Remove product"
        onConfirm={() => pendingDelete && remove(pendingDelete)}
      />
    </Section>
  )
}

function EditRow({
  product,
  onSave,
  onCancel,
}: {
  product: Product
  onSave: (patch: Partial<Product>) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(product.name)
  const [code, setCode] = useState(product.code)
  const [description, setDescription] = useState(product.description ?? '')
  const [unit, setUnit] = useState(product.unit)

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Product name" autoFocus />
        <Input value={code} onChange={(e) => setCode(e.target.value)} aria-label="Product code" />
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-label="Description"
          rows={1}
        />
      </div>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="success"
          onClick={() => {
            if (!name.trim() || !code.trim()) {
              toast.error('Name and code cannot be empty')
              return
            }
            onSave({ name: name.trim(), code: code.trim().toUpperCase(), description: description.trim() || undefined, unit: unit.trim() || 'Ton' })
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
