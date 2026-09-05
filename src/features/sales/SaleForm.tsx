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
import { DatePicker } from '@/components/ui/date-picker'
import { Money } from '@/components/Money'
import { bagKgOf, meshSizeNameOf } from '@/utils/products'
import { saleItemAmount, saleItemWeightTon } from '@/utils/sales'
import { formatCurrency, formatNumber, todayISO } from '@/utils/format'

/**
 * Record a sale — one header, one or more items.
 *
 * A customer buying two products (or two mesh sizes of the same product) in
 * one visit is one invoice with two items, never two invoices — this is the
 * one form that has to hold both, which is why it is built around a
 * repeatable row rather than a flat set of fields.
 *
 * Bags is what a person actually counts and what stock is deducted by —
 * weight and amount are always derived from it (§10/§17: never let a sale
 * exceed available stock). `availableBags` is the same function the
 * Production & Stock page's cards use, so this form can never show a
 * different number than the stock it's checking against.
 */

const itemSchema = z.object({
  productId: z.string().min(1, 'Choose a product.'),
  meshSizeId: z.string().min(1, 'Choose a mesh size.'),
  bags: z.coerce
    .number({ invalid_type_error: 'Enter the number of bags.' })
    .int('Bags must be a whole number.')
    .positive('Bags must be more than zero.'),
  ratePerTon: z.coerce
    .number({ invalid_type_error: 'Enter the rate.' })
    .positive('Rate must be more than zero.'),
})

function buildSchema(
  availableBags: (productId: string, meshSizeId: string) => number,
  bagKg: (meshSizeId: string) => number,
  meshName: (meshSizeId: string) => string,
) {
  return z
    .object({
      date: z.string().min(1, 'Pick the date.'),
      customerId: z.string().min(1, 'Choose a customer.'),
      truckNo: z.string().max(40).optional(),
      notes: z.string().max(300).optional(),
      paidAtSale: z.coerce.number().min(0, 'Cannot be negative.').optional(),
      items: z.array(itemSchema).min(1, 'Add at least one item.'),
    })
    .superRefine((values, ctx) => {
      // §7: never allow a sale to exceed available stock. Bags requested
      // against the same (product, mesh) accumulate across lines in this one
      // invoice — two lines selling the same grade must be checked together,
      // not each against the full stock independently.
      const requested = new Map<string, number>()
      values.items.forEach((item, index) => {
        if (!item.productId || !item.meshSizeId) return
        const key = `${item.productId}::${item.meshSizeId}`
        const after = (requested.get(key) ?? 0) + (Number(item.bags) || 0)
        requested.set(key, after)

        const available = availableBags(item.productId, item.meshSizeId)
        if (after > available) {
          ctx.addIssue({
            code: 'custom',
            path: ['items', index, 'bags'],
            message: `Insufficient stock. Only ${formatNumber(available)} bags are currently available for Mesh ${meshName(item.meshSizeId)}.`,
          })
        }
      })

      const total = values.items.reduce(
        (sum, item) => sum + saleItemAmount(saleItemWeightTon(item.bags, bagKg(item.meshSizeId)), item.ratePerTon),
        0,
      )
      if ((values.paidAtSale ?? 0) > total) {
        ctx.addIssue({
          code: 'custom',
          path: ['paidAtSale'],
          message: 'Cannot collect more than the invoice total.',
        })
      }
    })
}

export type SaleFormValues = {
  date: string
  customerId: string
  truckNo?: string
  notes?: string
  paidAtSale?: number
  items: Array<{ productId: string; meshSizeId: string; bags: number; ratePerTon: number }>
}
export type SaleSubmit = SaleFormValues

export function SaleForm({
  customers,
  products,
  meshSizes,
  nextInvoiceNo,
  availableBags,
  onSubmit,
}: {
  customers: Customer[]
  products: Product[]
  meshSizes: MeshSize[]
  nextInvoiceNo: string
  /** Stock currently available for one (product, mesh) — see `utils/productionStock.ts`. */
  availableBags: (productId: string, meshSizeId: string) => number
  onSubmit: (values: SaleSubmit) => void
}) {
  const schema = buildSchema(
    availableBags,
    (meshSizeId) => bagKgOf(meshSizes, meshSizeId),
    (meshSizeId) => meshSizeNameOf(meshSizes, meshSizeId),
  )

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
      items: [{ productId: products[0]?.id ?? '', meshSizeId: meshSizes[0]?.id ?? '', bags: '' as unknown as number, ratePerTon: '' as unknown as number }],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const customerId = watch('customerId')
  const items = watch('items')
  const paidAtSale = Number(watch('paidAtSale')) || 0

  const itemAmount = (bags: number, meshSizeId: string, ratePerTon: number) => {
    const bagKg = bagKgOf(meshSizes, meshSizeId)
    const weightTon = saleItemWeightTon(Number(bags) || 0, bagKg)
    return { weightTon, amount: saleItemAmount(weightTon, Number(ratePerTon) || 0) }
  }

  const total = items.reduce((sum, item) => sum + itemAmount(item?.bags, item?.meshSizeId, item?.ratePerTon).amount, 0)
  const due = Math.max(0, total - paidAtSale)

  const submit = handleSubmit((values) => {
    onSubmit(values)
    reset({
      date: values.date,
      customerId: values.customerId,
      truckNo: '',
      notes: '',
      paidAtSale: '' as unknown as number,
      items: [{ productId: products[0]?.id ?? '', meshSizeId: meshSizes[0]?.id ?? '', bags: '' as unknown as number, ratePerTon: '' as unknown as number }],
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
            <DatePicker id="sale-date" max={todayISO()} value={watch('date')} onChange={(v) => setValue('date', v)} />
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
            const { weightTon, amount } = itemAmount(item?.bags, item?.meshSizeId, item?.ratePerTon)
            const itemErrors = errors.items?.[index]
            const available = item?.productId && item?.meshSizeId ? availableBags(item.productId, item.meshSizeId) : 0

            return (
              <div key={field.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_0.8fr_0.9fr_1fr_auto] sm:items-end">
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

                  <Field label="Mesh / size" error={itemErrors?.meshSizeId?.message}>
                    <Controller
                      control={control}
                      name={`items.${index}.meshSizeId`}
                      render={({ field: f }) => (
                        <Select value={f.value} onValueChange={f.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Mesh" />
                          </SelectTrigger>
                          <SelectContent>
                            {meshSizes.map((mesh) => (
                              <SelectItem key={mesh.id} value={mesh.id}>
                                {mesh.name} · {mesh.bagKg}kg
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>

                  <Field
                    label="Bags"
                    error={itemErrors?.bags?.message}
                    hint={item?.productId && item?.meshSizeId ? `Available: ${formatNumber(available)}` : undefined}
                  >
                    <Input type="number" min={0} step="1" inputMode="numeric" placeholder="0" {...register(`items.${index}.bags`)} />
                  </Field>

                  <Field label="Rate / Ton (৳)" error={itemErrors?.ratePerTon?.message}>
                    <Input type="number" min={0} step="1" inputMode="numeric" placeholder="0" {...register(`items.${index}.ratePerTon`)} />
                  </Field>

                  <Field label="Amount" hint={weightTon > 0 ? `${formatNumber(weightTon)} Ton` : undefined}>
                    <div className="flex h-[1.625rem] items-center rounded-md border border-transparent bg-card px-2.5">
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
            onClick={() =>
              append({
                productId: products[0]?.id ?? '',
                meshSizeId: meshSizes[0]?.id ?? '',
                bags: '' as unknown as number,
                ratePerTon: '' as unknown as number,
              })
            }
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
          disabled={customers.length === 0 || products.length === 0 || meshSizes.length === 0}
        >
          <Receipt />
          Record sale — {formatCurrency(total)}
        </Button>

        {(customers.length === 0 || products.length === 0 || meshSizes.length === 0) && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Add {customers.length === 0 ? 'a customer' : products.length === 0 ? 'a product' : 'a mesh size'} before recording a sale.
          </p>
        )}
      </form>
    </Section>
  )
}
