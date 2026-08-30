import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import type { Customer, MeshSize, Product } from '@/types'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Money } from '@/components/Money'
import { saleItemAmount } from '@/utils/sales'
import { formatCurrency, todayISO } from '@/utils/format'

/**
 * Record a sale — one header, one or more items.
 *
 * A customer buying two products (or two mesh sizes of the same product) in
 * one visit is one invoice with two items, never two invoices — this is the
 * one form that has to hold both, which is why it is built around a
 * repeatable row rather than a flat set of fields.
 */

const itemSchema = z.object({
  productId: z.string().min(1, 'Choose a product.'),
  meshSizeId: z.string().optional(),
  weightTon: z.coerce
    .number({ invalid_type_error: 'Enter the weight.' })
    .positive('Weight must be more than zero.'),
  ratePerTon: z.coerce
    .number({ invalid_type_error: 'Enter the rate.' })
    .positive('Rate must be more than zero.'),
})

const schema = z
  .object({
    date: z.string().min(1, 'Pick the date.'),
    customerId: z.string().min(1, 'Choose a customer.'),
    truckNo: z.string().max(40).optional(),
    notes: z.string().max(300).optional(),
    paidAtSale: z.coerce.number().min(0, 'Cannot be negative.').optional(),
    items: z.array(itemSchema).min(1, 'Add at least one item.'),
  })
  .superRefine((values, ctx) => {
    const total = values.items.reduce((sum, item) => sum + item.weightTon * item.ratePerTon, 0)
    if ((values.paidAtSale ?? 0) > total) {
      ctx.addIssue({
        code: 'custom',
        path: ['paidAtSale'],
        message: 'Cannot collect more than the invoice total.',
      })
    }
  })

export type SaleFormValues = z.input<typeof schema>
export type SaleSubmit = z.output<typeof schema>

const NONE = '__none__'

export function SaleForm({
  customers,
  products,
  meshSizes,
  nextInvoiceNo,
  onSubmit,
}: {
  customers: Customer[]
  products: Product[]
  meshSizes: MeshSize[]
  nextInvoiceNo: string
  onSubmit: (values: SaleSubmit) => void
}) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SaleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayISO(),
      customerId: customers[0]?.id ?? '',
      truckNo: '',
      notes: '',
      paidAtSale: '' as unknown as number,
      items: [{ productId: products[0]?.id ?? '', meshSizeId: NONE, weightTon: '' as unknown as number, ratePerTon: '' as unknown as number }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const customerId = watch('customerId')
  const items = watch('items')
  const paidAtSale = Number(watch('paidAtSale')) || 0

  const total = items.reduce((sum, item) => sum + saleItemAmount({ weightTon: Number(item?.weightTon) || 0, ratePerTon: Number(item?.ratePerTon) || 0 }), 0)
  const due = Math.max(0, total - paidAtSale)

  const submit = handleSubmit((values) => {
    const cleaned: SaleSubmit = {
      ...(values as SaleSubmit),
      paidAtSale: Number(values.paidAtSale) || 0,
      items: values.items.map((item) => ({
        ...item,
        meshSizeId: item.meshSizeId === NONE ? undefined : item.meshSizeId,
      })),
    }
    onSubmit(cleaned)
    reset({
      date: values.date,
      customerId: values.customerId,
      truckNo: '',
      notes: '',
      paidAtSale: '' as unknown as number,
      items: [{ productId: products[0]?.id ?? '', meshSizeId: NONE, weightTon: '' as unknown as number, ratePerTon: '' as unknown as number }],
    })
  })

  return (
    <Section
      title={`New sale — ${nextInvoiceNo}`}
      description="One invoice can hold several products or mesh sizes — add a line for each."
    >
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date" error={errors.date?.message} htmlFor="sale-date">
            <Input id="sale-date" type="date" max={todayISO()} {...register('date')} />
          </Field>

          <Field label="Customer" error={errors.customerId?.message} htmlFor="sale-customer">
            <Select value={customerId} onValueChange={(value) => setValue('customerId', value)}>
              <SelectTrigger id="sale-customer">
                <SelectValue placeholder="Choose a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Truck number (optional)" htmlFor="sale-truck">
            <Input id="sale-truck" placeholder="DHA-1234" {...register('truckNo')} />
          </Field>
        </div>

        <div className="mt-5 space-y-3">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Items</p>

          {fields.map((field, index) => {
            const item = items[index]
            const amount = saleItemAmount({
              weightTon: Number(item?.weightTon) || 0,
              ratePerTon: Number(item?.ratePerTon) || 0,
            })
            const itemErrors = errors.items?.[index]

            return (
              <div key={field.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr_0.8fr_0.9fr_1fr_auto] sm:items-end">
                  <Field label="Product" error={itemErrors?.productId?.message}>
                    <Controller
                      control={control}
                      name={`items.${index}.productId`}
                      render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>

                  <Field label="Mesh / size">
                    <Controller
                      control={control}
                      name={`items.${index}.meshSizeId`}
                      render={({ field: f }) => (
                        <Select value={f.value || NONE} onValueChange={f.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>None</SelectItem>
                            {meshSizes.map((mesh) => (
                              <SelectItem key={mesh.id} value={mesh.id}>
                                {mesh.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>

                  <Field label="Weight (Ton)" error={itemErrors?.weightTon?.message}>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" placeholder="0" {...register(`items.${index}.weightTon`)} />
                  </Field>

                  <Field label="Rate / Ton (৳)" error={itemErrors?.ratePerTon?.message}>
                    <Input type="number" min={0} step="1" inputMode="numeric" placeholder="0" {...register(`items.${index}.ratePerTon`)} />
                  </Field>

                  <Field label="Amount">
                    <div className="flex h-9 items-center rounded-md border border-transparent bg-card px-3">
                      <Money value={amount} size="sm" weight="semibold" />
                    </div>
                  </Field>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                    aria-label="Remove item"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            )
          })}

          {typeof errors.items?.message === 'string' && (
            <p className="text-2xs font-medium text-destructive">{errors.items.message}</p>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ productId: products[0]?.id ?? '', meshSizeId: NONE, weightTon: '' as unknown as number, ratePerTon: '' as unknown as number })}
          >
            <Plus />
            Add item
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Paid at sale (৳)" error={errors.paidAtSale?.message} htmlFor="sale-paid" hint="Leave blank if this is fully on credit.">
            <Input id="sale-paid" type="number" min={0} step="1" inputMode="numeric" placeholder="0" {...register('paidAtSale')} />
          </Field>

          <Field label="Notes (optional)" htmlFor="sale-notes">
            <Textarea id="sale-notes" rows={1} placeholder="Anything worth noting on this invoice" {...register('notes')} />
          </Field>
        </div>

        <div className="mt-4 space-y-1.5 rounded-lg border border-border bg-secondary/40 p-3.5">
          <div className="flex items-center justify-between text-[0.8125rem]">
            <span className="text-muted-foreground">Invoice total</span>
            <Money value={total} weight="bold" />
          </div>
          <div className="flex items-center justify-between text-[0.8125rem]">
            <span className="text-muted-foreground">Paid at sale</span>
            <Money value={paidAtSale} tone="positive" />
          </div>
          <div className="flex items-center justify-between border-t border-border pt-1.5 text-[0.8125rem] font-semibold">
            <span>Due</span>
            <Money value={due} tone={due > 0 ? 'negative' : 'positive'} weight="bold" />
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full"
          loading={isSubmitting}
          disabled={customers.length === 0 || products.length === 0}
        >
          <Receipt />
          Record sale — {formatCurrency(total)}
        </Button>

        {(customers.length === 0 || products.length === 0) && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Add {customers.length === 0 ? 'a customer' : 'a product'} before recording a sale.
          </p>
        )}
      </form>
    </Section>
  )
}
