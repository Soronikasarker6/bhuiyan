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

/**
 * Record today's bagging for one product and mesh size.
 *
 * There is no "sell" field here on purpose — Today's Sell in the stock
 * ledger is always read from actual sales, never typed alongside
 * production, which is what keeps the two from silently disagreeing.
 */

const schema = z.object({
  date: z.string().min(1, 'Pick the date.'),
  productId: z.string().min(1, 'Choose a product.'),
  meshId: z.string().min(1, 'Choose a mesh size.'),
  bags: z.coerce
    .number({ invalid_type_error: 'Enter the number of bags.' })
    .int('Bags must be a whole number.')
    .positive('Bags must be more than zero.'),
  notes: z.string().max(300).optional(),
})

export type ProductionFormValues = z.input<typeof schema>
export type ProductionSubmit = z.output<typeof schema>

export function ProductionEntryForm({
  products,
  meshSizes,
  onSubmit,
}: {
  products: Product[]
  meshSizes: MeshSize[]
  onSubmit: (values: ProductionSubmit) => void
}) {
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

  const submit = handleSubmit((values) => {
    onSubmit(values as ProductionSubmit)
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
              <SelectTrigger id="prodstk-product">
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
              <SelectTrigger id="prodstk-mesh">
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
