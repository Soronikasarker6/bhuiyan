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
import { todayISO } from '@/utils/format'

/**
 * Wastage (§1) — raw material lost to handling, spillage or breakage before
 * it ever became a bag. It is deducted from raw material stock the same way
 * a bagging entry is, but tracked and reported on separately: `Imported →
 * Available → Wastage → Sold → Remaining`.
 */

const schema = z.object({
  date: z.string().min(1, 'Pick the date.'),
  productId: z.string().min(1, 'Choose a product.'),
  quantityKg: z.coerce
    .number({ invalid_type_error: 'Enter the quantity.' })
    .positive('Quantity must be more than zero.'),
  reason: z.string().max(200).optional(),
})

export type WastageFormValues = z.input<typeof schema>
export type WastageSubmit = z.output<typeof schema>

export function WastageForm({
  products,
  onSubmit,
}: {
  products: Product[]
  onSubmit: (values: WastageSubmit) => void
}) {
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
