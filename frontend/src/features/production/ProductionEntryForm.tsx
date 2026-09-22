import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Boxes, Plus } from 'lucide-react'
import type { MeshSize, Product } from '@/types'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { bagKgOf } from '@/utils/products'
import { bagsToKg } from '@/utils/productionStock'
import { kgToTons } from '@/utils/imports'
import { formatNumber, formatTons, todayISO } from '@/utils/format'
import { cn } from '@/utils/cn'

/**
 * Record today's bagging for one product and mesh size.
 *
 * There is no "sell" field here on purpose — Today's Sell in the stock
 * ledger is always read from actual sales, never typed alongside
 * production, which is what keeps the two from silently disagreeing.
 *
 * Bagging is also what consumes raw material (`utils/rawMaterial.ts`), so the
 * same tonnage leaves that material's Current Raw Stock as arrives in this
 * mesh's finished stock — shown on the form rather than left to be discovered
 * elsewhere after saving. Two rules are checked here the same way `SaleForm`
 * checks bag stock: this can never take a material's raw stock negative, and
 * it can never land inside a shipment cycle that has already closed.
 */

function buildSchema(
  availableTon: (productId: string) => number,
  cycleClosed: (productId: string, date: string) => boolean,
  productName: (productId: string) => string,
  bagKg: (meshId: string) => number,
) {
  return z
    .object({
      date: z.string().min(1, 'Pick the date.'),
      productId: z.string().min(1, 'Choose a product.'),
      meshId: z.string().min(1, 'Choose a mesh size.'),
      bags: z.coerce
        .number({ invalid_type_error: 'Enter the number of bags.' })
        .int('Bags must be a whole number.')
        .positive('Bags must be more than zero.'),
      notes: z.string().max(300).optional(),
    })
    .superRefine((values, ctx) => {
      if (!values.productId || !values.date) return

      if (cycleClosed(values.productId, values.date)) {
        ctx.addIssue({
          code: 'custom',
          path: ['date'],
          message: `This falls inside a closed shipment cycle for ${productName(values.productId)}. Reopen that shipment first if this entry must be added.`,
        })
        return
      }

      const available = availableTon(values.productId)
      const requestedTon = kgToTons((Number(values.bags) || 0) * bagKg(values.meshId))
      if (requestedTon > available) {
        ctx.addIssue({
          code: 'custom',
          path: ['bags'],
          message: `This would take ${productName(values.productId)} raw material stock negative. Only ${formatTons(available)} Ton is currently available.`,
        })
      }
    })
}

export type ProductionFormValues = z.input<ReturnType<typeof buildSchema>>
export type ProductionSubmit = z.output<ReturnType<typeof buildSchema>>

export function ProductionEntryForm({
  products,
  meshSizes,
  availableTon,
  cycleClosed,
  onSubmit,
}: {
  products: Product[]
  meshSizes: MeshSize[]
  /** The material's Current Raw Stock in tons — imported, less production and wastage. */
  availableTon: (productId: string) => number
  /** Whether a date, for a product, falls inside an already-closed shipment cycle. */
  cycleClosed: (productId: string, date: string) => boolean
  onSubmit: (values: ProductionSubmit) => void | Promise<void>
}) {
  const productName = (productId: string) => products.find((p) => p.id === productId)?.name ?? 'this product'
  const schema = buildSchema(availableTon, cycleClosed, productName, (meshId) => bagKgOf(meshSizes, meshId))

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayISO(),
      productId: products[0]?.id ?? '',
      meshId: meshSizes[0]?.id ?? '',
      bags: '' as unknown as number,
      notes: '',
    },
  })

  useEffect(() => {
    if (!products.some((p) => p.id === watch('productId'))) {
      setValue('productId', products[0]?.id ?? '')
    }
    if (!meshSizes.some((m) => m.id === watch('meshId'))) {
      setValue('meshId', meshSizes[0]?.id ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, meshSizes])

  const productId = watch('productId')
  const meshId = watch('meshId')
  const bags = Number(watch('bags')) || 0
  const bagKg = bagKgOf(meshSizes, meshId)
  const kg = bagsToKg(bags, bagKg)

  const tonsRequested = kgToTons(kg)
  const rawStockNow = productId ? availableTon(productId) : 0
  const rawStockAfter = rawStockNow - tonsRequested

  const submit = handleSubmit(async (values) => {
    await onSubmit(values as ProductionSubmit)
    reset({ date: values.date, productId: values.productId, meshId: values.meshId, bags: '' as unknown as number, notes: '' })
  })

  return (
    <Section title="New production entry" description="Today's bagging, mesh by mesh — kg and tons are worked out for you.">
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" error={errors.date?.message} htmlFor="prodstk-date">
            <DatePicker id="prodstk-date" max={todayISO()} value={watch('date')} onChange={(v) => setValue('date', v)} />
          </Field>

          <Field label="Limestone / Product" error={errors.productId?.message} htmlFor="prodstk-product">
            <Select value={productId} onValueChange={(value) => setValue('productId', value)}>
              <SelectTrigger id="prodstk-product" className="field-highlight">
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

          <Field label="Mesh" error={errors.meshId?.message} htmlFor="prodstk-mesh">
            <Select value={meshId} onValueChange={(value) => setValue('meshId', value)}>
              <SelectTrigger id="prodstk-mesh" className="field-highlight">
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

        <div className="mt-4">
          <Field label="Today's production (bags)" error={errors.bags?.message} htmlFor="prodstk-bags">
            <Input
              id="prodstk-bags"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              placeholder="400"
              {...register('bags')}
            />
          </Field>
        </div>

        <div
          className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-success-200 bg-success-100/60 px-4 py-3"
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

        {/* §2/§3 — the same tonnage leaves raw stock and arrives in this mesh's
            finished stock, so the form shows the raw side moving rather than
            leaving it to be discovered on another page after saving. */}
        {productId && (
          <div className="mt-3 rounded-lg border border-border bg-secondary/40 px-4 py-3" aria-live="polite">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              {productName(productId)} raw stock
            </p>
            <div className="mt-1.5 flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="text-muted-foreground">Available now</span>
              <span className="font-mono tabular font-semibold text-foreground">
                {formatTons(rawStockNow)} Ton
              </span>
            </div>
            {tonsRequested > 0 && (
              <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-1.5 text-[0.8125rem]">
                <span className="text-muted-foreground">After this entry</span>
                <span
                  className={cn(
                    'font-mono tabular font-bold',
                    rawStockAfter < 0 ? 'text-destructive' : 'text-foreground',
                  )}
                >
                  {formatTons(rawStockAfter)} Ton
                </span>
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <Field label="Notes (optional)" htmlFor="prodstk-notes">
            <Textarea id="prodstk-notes" rows={2} {...register('notes')} />
          </Field>
        </div>

        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full"
          loading={isSubmitting}
          disabled={products.length === 0 || meshSizes.length === 0}
        >
          <Plus />
          Record production
        </Button>

        {meshSizes.length === 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Add a mesh size in Products &amp; Mesh Sizes before recording production.
          </p>
        )}
      </form>
    </Section>
  )
}
