import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Scale } from 'lucide-react'
import type { Product } from '@/types'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { netWeightKg, kgToTons } from '@/utils/production'
import { formatNumber, formatTons, todayISO } from '@/utils/format'

/**
 * Record production: gross weight in, tare weight in, net weight worked out.
 *
 *     Net Weight = Gross Weight − Tare Weight
 *
 * computed live as the two figures are typed, so nobody reaches for a
 * calculator and nobody can type a net weight that disagrees with the two
 * weighbridge figures behind it — the field does not exist to type into.
 */

const schema = z
  .object({
    date: z.string().min(1, 'Pick the date.'),
    productId: z.string().min(1, 'Choose a product.'),
    grossWeightKg: z.coerce
      .number({ invalid_type_error: 'Enter the gross weight.' })
      .positive('Gross weight must be more than zero.'),
    tareWeightKg: z.coerce
      .number({ invalid_type_error: 'Enter the tare weight.' })
      .min(0, 'Tare weight cannot be negative.'),
    notes: z.string().max(300).optional(),
  })
  .refine((values) => values.tareWeightKg < values.grossWeightKg, {
    message: 'Tare weight must be less than gross weight — net weight cannot be zero or negative.',
    path: ['tareWeightKg'],
  })

export type ProductionFormValues = z.input<typeof schema>
export type ProductionSubmit = z.output<typeof schema>

export function ProductionEntryForm({
  products,
  onSubmit,
}: {
  products: Product[]
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
      grossWeightKg: '' as unknown as number,
      tareWeightKg: '' as unknown as number,
      notes: '',
    },
  })

  useEffect(() => {
    if (!products.some((p) => p.id === watch('productId'))) {
      setValue('productId', products[0]?.id ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products])

  const productId = watch('productId')
  const gross = Number(watch('grossWeightKg')) || 0
  const tare = Number(watch('tareWeightKg')) || 0
  const net = netWeightKg(gross, tare)
  const oversized = tare > 0 && gross > 0 && tare >= gross

  const submit = handleSubmit((values) => {
    onSubmit(values as ProductionSubmit)
    reset({
      date: values.date,
      productId: values.productId,
      grossWeightKg: '' as unknown as number,
      tareWeightKg: '' as unknown as number,
      notes: '',
    })
  })

  return (
    <Section title="New production entry" description="Weighbridge in, weighbridge out — net weight is worked out for you.">
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" error={errors.date?.message} htmlFor="prod-date">
            <Input id="prod-date" type="date" max={todayISO()} {...register('date')} />
          </Field>

          <Field label="Product" error={errors.productId?.message} htmlFor="prod-product">
            <Select value={productId} onValueChange={(value) => setValue('productId', value)}>
              <SelectTrigger id="prod-product">
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Gross weight (kg)" error={errors.grossWeightKg?.message} htmlFor="prod-gross">
            <Input
              id="prod-gross"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              placeholder="25000"
              className="h-11 text-base"
              {...register('grossWeightKg')}
            />
          </Field>

          <Field label="Tare weight (kg)" error={errors.tareWeightKg?.message} htmlFor="prod-tare">
            <Input
              id="prod-tare"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              placeholder="8000"
              className="h-11 text-base"
              {...register('tareWeightKg')}
            />
          </Field>
        </div>

        <div
          className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-success-200 bg-success-100/60 px-4 py-3"
          aria-live="polite"
        >
          <span className="flex items-center gap-2 text-[0.8125rem] font-medium text-success-800">
            <Scale className="h-4 w-4" aria-hidden />
            Net weight
          </span>
          <span className="text-right">
            <span className="block font-mono tabular text-lg font-bold text-success-800">
              {formatNumber(net)} kg
            </span>
            <span className="block font-mono tabular text-2xs text-success-700">{formatTons(kgToTons(net))} Ton</span>
          </span>
        </div>

        {oversized && !errors.tareWeightKg && (
          <p className="mt-2 text-2xs font-medium text-destructive">
            Tare weight looks too high for this gross weight — double check the weighbridge slip.
          </p>
        )}

        <div className="mt-4">
          <Field label="Notes (optional)" htmlFor="prod-notes">
            <Textarea id="prod-notes" rows={2} placeholder="Truck number, slip reference, anything worth noting" {...register('notes')} />
          </Field>
        </div>

        <Button type="submit" size="lg" className="mt-4 w-full" loading={isSubmitting} disabled={products.length === 0}>
          <Plus />
          Record production
        </Button>

        {products.length === 0 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Add a product in Products &amp; Mesh Sizes before recording production.
          </p>
        )}
      </form>
    </Section>
  )
}
