import { useEffect } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import type { Account, Customer, MeshSize, Product } from '@/types'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Money } from '@/components/Money'
import { bagKgOf, meshSizeNameOf } from '@/utils/products'
import { billableWeightTon, saleItemAmount, saleItemWeightTon } from '@/utils/sales'
import { defaultCashAccountId } from '@/utils/ledger'
import { formatCurrency, formatNumber, formatTons, todayISO } from '@/utils/format'

/**
 * Record a sale — one header, one or more items.
 *
 * A customer buying two products (or two mesh sizes of the same product) in
 * one visit is one invoice with two items, never two invoices — this is the
 * one form that has to hold both, which is why it is built around a
 * repeatable row rather than a flat set of fields.
 *
 * Bags is what a person actually counts and what stock is deducted by, and
 * that is untouched by any of this. But real bags are rarely exactly their
 * configured weight — a "50kg" bag might scale at 50.2kg on the
 * weighbridge — so **Calculated Ton** (bags × bag weight, shown, never
 * entered) is only ever a starting point. **Actual/Billable Ton** is what
 * the invoice is actually billed on: it starts equal to the calculated
 * figure and stays in sync with it automatically as bags/mesh change, right
 * up until the user types a different number into it — from that point on
 * it's the truck's own figure, and nothing here silently recalculates over
 * it again (tracked via react-hook-form's own per-field `dirtyFields`, not
 * a separate flag).
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
  actualWeightTon: z.coerce
    .number({ invalid_type_error: 'Enter the actual/billable ton.' })
    .positive('Actual/Billable Ton must be more than zero.'),
})

function buildSchema(
  availableBags: (productId: string, meshSizeId: string) => number,
  meshName: (meshSizeId: string) => string,
) {
  return z
    .object({
      date: z.string().min(1, 'Pick the date.'),
      customerId: z.string().min(1, 'Choose a customer.'),
      truckNo: z.string().max(40).optional(),
      notes: z.string().max(300).optional(),
      paidAtSale: z.coerce.number().min(0, 'Cannot be negative.').optional(),
      /** Which Cash & Bank account a "paid at sale" amount lands in — only meaningful once paidAtSale > 0. */
      accountId: z.string().optional(),
      items: z.array(itemSchema).min(1, 'Add at least one item.'),
    })
    .superRefine((values, ctx) => {
      // §7: never allow a sale to exceed available stock. Bags requested
      // against the same (product, mesh) accumulate across lines in this one
      // invoice — two lines selling the same grade must be checked together,
      // not each against the full stock independently. Stock is always
      // checked in bags — the actual/billable ton override never touches it.
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

      // The invoice total the "paid at sale" cap checks against must be the
      // same billable amount the invoice is actually raised for — using the
      // calculated (pre-weighbridge) figure here would let someone collect
      // more than the real invoice once the actual ton comes in lower.
      // `actualWeightTon` is always populated (auto-synced to the calculated
      // figure until the user overrides it), so it's already the billable one.
      const total = values.items.reduce(
        (sum, item) => sum + saleItemAmount(Number(item.actualWeightTon) || 0, item.ratePerTon),
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
  accountId?: string
  items: Array<{ productId: string; meshSizeId: string; bags: number; ratePerTon: number; actualWeightTon: number }>
}
export type SaleSubmit = SaleFormValues

export function SaleForm({
  customers,
  products,
  meshSizes,
  accounts,
  nextInvoiceNo,
  availableBags,
  onSubmit,
}: {
  customers: Customer[]
  products: Product[]
  meshSizes: MeshSize[]
  accounts: Account[]
  nextInvoiceNo: string
  /** Stock currently available for one (product, mesh) — see `utils/productionStock.ts`. */
  availableBags: (productId: string, meshSizeId: string) => number
  onSubmit: (values: SaleSubmit) => void
}) {
  const schema = buildSchema(availableBags, (meshSizeId) => meshSizeNameOf(meshSizes, meshSizeId))
  const defaultAccountId = defaultCashAccountId(accounts) ?? accounts[0]?.id ?? ''

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<SaleFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayISO(),
      customerId: customers[0]?.id ?? '',
      truckNo: '',
      notes: '',
      paidAtSale: '' as unknown as number,
      accountId: defaultAccountId,
      items: [
        {
          productId: products[0]?.id ?? '',
          meshSizeId: meshSizes[0]?.id ?? '',
          bags: '' as unknown as number,
          ratePerTon: '' as unknown as number,
          actualWeightTon: '' as unknown as number,
        },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const customerId = watch('customerId')
  const accountId = watch('accountId')
  const items = watch('items')
  const paidAtSale = Number(watch('paidAtSale')) || 0

  // Keeps each row's Actual/Billable Ton tracking the calculated figure as
  // bags/mesh change — right up until the user edits that field themselves,
  // at which point react-hook-form marks it dirty and this stops touching it.
  useEffect(() => {
    items.forEach((item, index) => {
      if (!item) return
      const touched = Boolean(dirtyFields.items?.[index]?.actualWeightTon)
      if (touched) return

      const bagKg = bagKgOf(meshSizes, item.meshSizeId)
      const calculated = saleItemWeightTon(Number(item.bags) || 0, bagKg)
      if (Number(item.actualWeightTon) !== calculated) {
        setValue(`items.${index}.actualWeightTon`, calculated, { shouldDirty: false, shouldValidate: false })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items.map((i) => [i?.bags, i?.meshSizeId])), meshSizes])

  const itemCalcs = (item: SaleFormValues['items'][number] | undefined) => {
    const bagKg = bagKgOf(meshSizes, item?.meshSizeId ?? '')
    const calculatedWeightTon = saleItemWeightTon(Number(item?.bags) || 0, bagKg)
    const weightTon = billableWeightTon(calculatedWeightTon, item?.actualWeightTon)
    const amount = saleItemAmount(weightTon, Number(item?.ratePerTon) || 0)
    return { bagKg, calculatedWeightTon, weightTon, amount }
  }

  const total = items.reduce((sum, item) => sum + itemCalcs(item).amount, 0)
  const due = Math.max(0, total - paidAtSale)

  const submit = handleSubmit((values) => {
    onSubmit(values)
    reset({
      date: values.date,
      customerId: values.customerId,
      truckNo: '',
      notes: '',
      paidAtSale: '' as unknown as number,
      accountId: defaultAccountId,
      items: [
        {
          productId: products[0]?.id ?? '',
          meshSizeId: meshSizes[0]?.id ?? '',
          bags: '' as unknown as number,
          ratePerTon: '' as unknown as number,
          actualWeightTon: '' as unknown as number,
        },
      ],
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
            const { bagKg, calculatedWeightTon, weightTon, amount } = itemCalcs(item)
            const itemErrors = errors.items?.[index]
            const available = item?.productId && item?.meshSizeId ? availableBags(item.productId, item.meshSizeId) : 0

            return (
              <div key={field.id} className="rounded-lg border border-border bg-secondary/30 p-3">
                {fields.length > 1 && (
                  <p className="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Item {index + 1}
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_0.8fr_0.9fr_auto] sm:items-end">
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
                    <Controller
                      control={control}
                      name={`items.${index}.bags`}
                      render={({ field: f }) => (
                        <NumberInput
                          value={f.value as unknown as number}
                          onChange={f.onChange}
                          placeholder="0"
                          invalid={Boolean(itemErrors?.bags)}
                        />
                      )}
                    />
                  </Field>

                  <Field label="Rate / Ton (৳)" error={itemErrors?.ratePerTon?.message}>
                    <Controller
                      control={control}
                      name={`items.${index}.ratePerTon`}
                      render={({ field: f }) => (
                        <NumberInput
                          value={f.value as unknown as number}
                          onChange={f.onChange}
                          placeholder="0"
                          invalid={Boolean(itemErrors?.ratePerTon)}
                        />
                      )}
                    />
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

                <div className="mt-3 grid gap-3 border-t border-dashed border-border pt-3 sm:grid-cols-4">
                  <Field label="Bag weight">
                    <div className="flex h-[1.625rem] items-center rounded-md border border-transparent bg-card px-2.5 text-[0.8125rem] text-muted-foreground">
                      {bagKg > 0 ? `${bagKg} KG` : '—'}
                    </div>
                  </Field>

                  <Field label="Calculated Ton" hint="Bags × Bag Weight — never entered">
                    <div className="flex h-[1.625rem] items-center rounded-md border border-transparent bg-card px-2.5 text-[0.8125rem] font-mono tabular">
                      {formatTons(calculatedWeightTon)}
                    </div>
                  </Field>

                  <Field
                    label="Actual / Billable Ton"
                    error={itemErrors?.actualWeightTon?.message}
                    hint="From the weighbridge slip, if different"
                  >
                    <Controller
                      control={control}
                      name={`items.${index}.actualWeightTon`}
                      render={({ field: f }) => (
                        <NumberInput
                          value={f.value as unknown as number}
                          onChange={f.onChange}
                          placeholder="0.00"
                          invalid={Boolean(itemErrors?.actualWeightTon)}
                        />
                      )}
                    />
                  </Field>

                  <Field label="Amount">
                    <div className="flex h-[1.625rem] items-center rounded-md border border-transparent bg-card px-2.5">
                      <Money value={amount} size="sm" weight="semibold" />
                    </div>
                  </Field>
                </div>

                {weightTon !== calculatedWeightTon && (
                  <p className="mt-2 text-2xs text-muted-foreground">
                    Billed on {formatTons(weightTon)} Ton (weighbridge), not the calculated {formatTons(calculatedWeightTon)} Ton.
                  </p>
                )}
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
                actualWeightTon: '' as unknown as number,
              })
            }
          >
            <Plus />
            Add item
          </Button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Paid at sale (৳)" error={errors.paidAtSale?.message} htmlFor="sale-paid" hint="Leave blank if this is fully on credit.">
            <Controller
              control={control}
              name="paidAtSale"
              render={({ field: f }) => (
                <NumberInput
                  id="sale-paid"
                  value={f.value as unknown as number}
                  onChange={f.onChange}
                  placeholder="0"
                  invalid={Boolean(errors.paidAtSale)}
                />
              )}
            />
          </Field>

          {paidAtSale > 0 && (
            <Field
              label="Payment account"
              htmlFor="sale-account"
              hint="This amount is recorded on the Cash & Bank Ledger too."
            >
              <Select value={accountId} onValueChange={(value) => setValue('accountId', value)}>
                <SelectTrigger id="sale-account">
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

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
