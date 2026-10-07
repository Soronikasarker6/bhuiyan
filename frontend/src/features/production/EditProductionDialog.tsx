import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Boxes } from 'lucide-react'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import type { MeshSize, Product, ProductionEntry } from '@/types'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { buildSchema, type ProductionFormValues, type ProductionSubmit } from '@/features/production/ProductionEntryForm'
import { bagKgOf } from '@/utils/products'
import { bagsToKg } from '@/utils/productionStock'
import { kgToTons } from '@/utils/imports'
import { formatNumber, formatTons, todayISO } from '@/utils/format'

/**
 * Correcting an already-recorded production entry.
 *
 * Same rules as recording one, re-checked against the edited figures: the
 * raw-stock check counts this entry's own tonnage as available (it is being
 * replaced, not added to), and `soldShortfall` stops an edit that would
 * un-produce bags that have already been sold. The server re-checks both.
 */
export function EditProductionDialog({
  entry,
  products,
  meshSizes,
  availableTon,
  cycleClosed,
  soldShortfall,
  onOpenChange,
  onSubmit,
}: {
  entry: ProductionEntry | null
  products: Product[]
  meshSizes: MeshSize[]
  /** Raw stock available to this entry — current raw stock plus what this entry itself already uses. */
  availableTon: (productId: string) => number
  cycleClosed: (productId: string, date: string) => boolean
  /** Bags the edit would leave short against sales already made, or 0 when fine. */
  soldShortfall: (values: ProductionSubmit) => number
  onOpenChange: (open: boolean) => void
  onSubmit: (values: ProductionSubmit) => Promise<void>
}) {
  const productName = (productId: string) => products.find((p) => p.id === productId)?.name ?? 'this product'
  const schema = buildSchema(availableTon, cycleClosed, productName, (meshId) => bagKgOf(meshSizes, meshId)).superRefine(
    (values, ctx) => {
      const short = soldShortfall(values as ProductionSubmit)
      if (short > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['bags'],
          message: `These bags have already been sold — this would take bag stock negative by ${formatNumber(short)} bags.`,
        })
      }
    },
  )

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: todayISO(), productId: '', meshId: '', bags: '' as unknown as number, notes: '' },
  })

  // Re-seed every time a different entry is opened for editing.
  useEffect(() => {
    if (entry) {
      reset({ date: entry.date, productId: entry.productId, meshId: entry.meshId, bags: entry.bags, notes: entry.notes ?? '' })
    }
  }, [entry, reset])

  const productId = watch('productId')
  const meshId = watch('meshId')
  const kg = bagsToKg(Number(watch('bags')) || 0, bagKgOf(meshSizes, meshId))
  const rawAvailable = productId ? availableTon(productId) : 0

  const submit = handleSubmit(async (values) => {
    const out = values as ProductionSubmit
    await onSubmit({ ...out, notes: out.notes?.trim() || undefined })
  })

  return (
    <Dialog
      open={entry !== null}
      headerText="Edit production entry"
      onClose={() => !isSubmitting && onOpenChange(false)}
      className="w-[calc(100vw-2rem)] max-w-xl"
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="success" loading={isSubmitting} onClick={submit}>
                Save changes
              </Button>
            </>
          }
        />
      }
    >
      {entry && (
        <form onSubmit={submit} noValidate className="space-y-4 p-1">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" error={errors.date?.message} htmlFor="edit-prod-date">
              <DatePicker id="edit-prod-date" max={todayISO()} value={watch('date')} onChange={(v) => setValue('date', v)} />
            </Field>

            <Field label="Limestone / Product" error={errors.productId?.message} htmlFor="edit-prod-product">
              <Select value={productId} onValueChange={(value) => setValue('productId', value)}>
                <SelectTrigger id="edit-prod-product" className="field-highlight">
                  <SelectValue placeholder="Choose a product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Mesh" error={errors.meshId?.message} htmlFor="edit-prod-mesh">
              <Select value={meshId} onValueChange={(value) => setValue('meshId', value)}>
                <SelectTrigger id="edit-prod-mesh" className="field-highlight">
                  <SelectValue placeholder="Choose a mesh" />
                </SelectTrigger>
                <SelectContent>
                  {meshSizes.map((mesh) => (
                    <SelectItem key={mesh.id} value={mesh.id}>
                      {mesh.name} · {mesh.bagKg} kg/bag
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Production (bags)" error={errors.bags?.message} htmlFor="edit-prod-bags">
            <Input id="edit-prod-bags" type="number" min={0} step="1" inputMode="numeric" {...register('bags')} />
          </Field>

          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-success-200 bg-success-100/60 px-4 py-3"
            aria-live="polite"
          >
            <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-success-800">
              <Boxes className="h-4 w-4" aria-hidden />
              Production weight
            </span>
            <span className="text-right">
              <span className="block font-mono tabular text-lg font-bold text-success-800">{formatNumber(kg)} kg</span>
              <span className="block font-mono tabular text-2xs text-success-700">{formatTons(kgToTons(kg))} Ton</span>
            </span>
          </div>

          {productId && (
            <p className="text-2xs text-muted-foreground">
              {productName(productId)} raw stock available for this entry: {formatTons(rawAvailable)} Ton
            </p>
          )}

          <Field label="Notes (optional)" htmlFor="edit-prod-notes">
            <Textarea id="edit-prod-notes" rows={2} {...register('notes')} />
          </Field>
        </form>
      )}
    </Dialog>
  )
}
