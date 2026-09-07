import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import type { Product } from '@/types'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { formatTons, todayISO } from '@/utils/format'
import { kgToTons } from '@/utils/imports'

/**
 * Wastage (§1) — raw material lost to handling, spillage or breakage before
 * it ever became a bag. It is deducted from raw material stock the same way
 * a bagging entry is, but tracked and reported on separately: `Imported →
 * Available → Wastage → Sold → Remaining`.
 *
 * Two rules from §10, checked the same way `SaleForm` checks bag stock: this
 * can never take a material's *current* shipment cycle negative, and it can
 * never land inside a shipment cycle that has already been closed — both
 * checked live, against the same figures the stock cards show.
 */

function buildSchema(
  availableTon: (productId: string) => number,
  cycleClosed: (productId: string, date: string) => boolean,
  productName: (productId: string) => string,
) {
  return z
    .object({
      date: z.string().min(1, 'Pick the date.'),
      productId: z.string().min(1, 'Choose a product.'),
      quantityKg: z.coerce
        .number({ invalid_type_error: 'Enter the quantity.' })
        .positive('Quantity must be more than zero.'),
      reason: z.string().max(200).optional(),
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
      const requestedTon = kgToTons(Number(values.quantityKg) || 0)
      if (requestedTon > available) {
        ctx.addIssue({
          code: 'custom',
          path: ['quantityKg'],
          message: `This would take ${productName(values.productId)} stock negative. Only ${formatTons(available)} Ton is currently available.`,
        })
      }
    })
}

export type WastageFormValues = z.input<ReturnType<typeof buildSchema>>
export type WastageSubmit = z.output<ReturnType<typeof buildSchema>>

export function WastageForm({
  products,
  availableTon,
  cycleClosed,
  onSubmit,
}: {
  products: Product[]
  /** Current available tons for a product's *current* shipment cycle. */
  availableTon: (productId: string) => number
  /** Whether a date, for a product, falls inside an already-closed shipment cycle. */
  cycleClosed: (productId: string, date: string) => boolean
  onSubmit: (values: WastageSubmit) => void
}) {
  const productName = (productId: string) => products.find((p) => p.id === productId)?.name ?? 'this product'
  const schema = buildSchema(availableTon, cycleClosed, productName)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WastageFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayISO(),
      productId: products[0]?.id ?? '',
      quantityKg: '' as unknown as number,
      reason: '',
    },
  })

  useEffect(() => {
    if (!products.some((p) => p.id === watch('productId'))) {
      setValue('productId', products[0]?.id ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products])

  const productId = watch('productId')

  const submit = handleSubmit((values) => {
    onSubmit(values as WastageSubmit)
    reset({ date: values.date, productId: values.productId, quantityKg: '' as unknown as number, reason: '' })
  })

  return (
    <Section title="Record wastage" description="Raw material lost before it became a bag — deducted from stock, reported separately.">
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" error={errors.date?.message} htmlFor="wst-date">
            <DatePicker id="wst-date" max={todayISO()} value={watch('date')} onChange={(v) => setValue('date', v)} />
          </Field>

          <Field label="Limestone / Product" error={errors.productId?.message} htmlFor="wst-product">
            <Select value={productId} onValueChange={(value) => setValue('productId', value)}>
              <SelectTrigger id="wst-product">
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
        </div>

        <div className="mt-4">
          <Field label="Quantity wasted (kg)" error={errors.quantityKg?.message} htmlFor="wst-qty">
            <Input id="wst-qty" type="number" min={0} step="1" inputMode="numeric" {...register('quantityKg')} />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Reason (optional)" htmlFor="wst-reason">
            <Textarea id="wst-reason" rows={2} placeholder="Spillage, handling loss, breakage…" {...register('reason')} />
          </Field>
        </div>

        <Button type="submit" size="lg" variant="destructive" className="mt-4 w-full" loading={isSubmitting} disabled={products.length === 0}>
          <Plus />
          Record wastage
        </Button>
      </form>
    </Section>
  )
}
