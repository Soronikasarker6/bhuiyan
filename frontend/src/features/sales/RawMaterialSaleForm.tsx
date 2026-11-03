import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Receipt, Scale } from 'lucide-react'
import type { Account, Customer, Product } from '@/types'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { NumberInput } from '@/components/ui/number-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Money } from '@/components/Money'
import { SaleTotalsSummary } from '@/features/sales/SaleTotalsSummary'
import { saleItemAmount } from '@/utils/sales'
import { kgToTons } from '@/utils/imports'
import { defaultCashAccountId } from '@/utils/ledger'
import { customerDisplayLabel } from '@/utils/customerLedger'
import { formatCurrency, formatTons, todayISO } from '@/utils/format'

/**
 * Record a raw material sale — raw limestone sold straight from the yard,
 * never through production.
 *
 *     Net Weight (KG)  — entered directly, and editable at billing
 *     Net Weight (TON) = Net Weight (KG) ÷ 1000
 *     Total Amount     = Net Weight (TON) × Rate / TON
 *
 * Unlike a finished-product sale there are no bags and no mesh: the net
 * weight *is* what is billed (it becomes the line's billable ton) and what
 * leaves raw stock. The form
 * checks it against the material's current raw stock as you type; the server
 * re-checks it inside the same database transaction that saves the sale.
 */

function buildSchema(availableTon: (productId: string) => number) {
  return z
    .object({
      date: z.string().min(1, 'Pick the date.'),
      customerId: z.string().min(1, 'Choose a customer.'),
      productId: z.string().min(1, 'Choose the raw material.'),
      truckNo: z.string().max(40).optional(),
      netWeightKg: z.coerce
        .number({ invalid_type_error: 'Enter the net weight in kg.' })
        .positive('Net weight must be more than zero.'),
      ratePerTon: z.coerce.number({ invalid_type_error: 'Enter the rate.' }).positive('Rate must be more than zero.'),
      paidAtSale: z.coerce.number().min(0, 'Cannot be negative.').optional(),
      accountId: z.string().optional(),
      notes: z.string().max(300).optional(),
    })
    .superRefine((values, ctx) => {
      const netKg = values.netWeightKg
      const available = availableTon(values.productId)
      if (kgToTons(netKg) > available + 1e-9) {
        ctx.addIssue({
          code: 'custom',
          path: ['netWeightKg'],
          message: `Insufficient raw stock. Only ${formatTons(available)} Ton is currently available.`,
        })
      }

      if ((values.paidAtSale ?? 0) > saleItemAmount(kgToTons(netKg), values.ratePerTon)) {
        ctx.addIssue({ code: 'custom', path: ['paidAtSale'], message: 'Cannot collect more than the invoice total.' })
      }
    })
}

export type RawMaterialSaleValues = {
  date: string
  customerId: string
  productId: string
  truckNo?: string
  /** Net weight in kg as entered at billing — becomes the line's billable ton. */
  netWeightKg: number
  ratePerTon: number
  paidAtSale?: number
  accountId?: string
  notes?: string
}

export function RawMaterialSaleForm({
  customers,
  products,
  accounts,
  nextInvoiceNo,
  availableRawTon,
  customerAdvance,
  onSubmit,
  initialValues,
  onCancel,
}: {
  customers: Customer[]
  /** The raw material master — every limestone type, from the same product list imports use. */
  products: Product[]
  accounts: Account[]
  nextInvoiceNo: string
  /** Current raw stock for one material — see `currentRawStockTon`. While editing, this sale's own tons must already count as available. */
  availableRawTon: (productId: string) => number
  /** Credit the customer already holds, for the due/advance line. */
  customerAdvance: (customerId: string) => number
  onSubmit: (values: RawMaterialSaleValues) => void | Promise<void>
  /** Editing an existing sale: prefilled, no card wrapper, Save/Cancel instead of Record, and no reset after saving. */
  initialValues?: RawMaterialSaleValues
  onCancel?: () => void
}) {
  const editing = initialValues !== undefined
  const idPrefix = editing ? 'edit-raw-sale' : 'raw-sale'
  const defaultAccountId = defaultCashAccountId(accounts) ?? accounts[0]?.id ?? ''

  const blank = (): RawMaterialSaleValues => ({
    date: todayISO(),
    customerId: customers[0]?.id ?? '',
    productId: products[0]?.id ?? '',
    truckNo: '',
    netWeightKg: '' as unknown as number,
    ratePerTon: '' as unknown as number,
    paidAtSale: '' as unknown as number,
    accountId: defaultAccountId,
    notes: '',
  })

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RawMaterialSaleValues>({
    resolver: zodResolver(buildSchema(availableRawTon)),
    defaultValues: initialValues ?? blank(),
  })

  const customerId = watch('customerId')
  const productId = watch('productId')
  const accountId = watch('accountId')
  const paidAtSale = Number(watch('paidAtSale')) || 0
  const rate = Number(watch('ratePerTon')) || 0

  const netKg = Number(watch('netWeightKg')) || 0
  const netTon = netKg > 0 ? kgToTons(netKg) : 0
  const total = saleItemAmount(netTon, rate)
  const available = productId ? availableRawTon(productId) : 0

  const submit = handleSubmit(async (values) => {
    await onSubmit(values)
    if (editing) return
    reset({ ...blank(), date: values.date, customerId: values.customerId, productId: values.productId })
  })

  const readout = 'flex h-[1.625rem] items-center rounded-md border border-transparent bg-card px-2.5 text-[0.8125rem] font-mono tabular'

  const form = (
    <form onSubmit={submit} noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Sale date" error={errors.date?.message} htmlFor={`${idPrefix}-date`}>
          <DatePicker id={`${idPrefix}-date`} max={todayISO()} value={watch('date')} onChange={(v) => setValue('date', v)} />
        </Field>

        <Field label="Customer" error={errors.customerId?.message} htmlFor={`${idPrefix}-customer`}>
          <Select value={customerId} onValueChange={(value) => setValue('customerId', value)}>
            <SelectTrigger id={`${idPrefix}-customer`}>
              <SelectValue placeholder="Choose a customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((customer) => (
                <SelectItem key={customer.id} value={customer.id}>
                  {customerDisplayLabel(customer)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Truck number (optional)" htmlFor={`${idPrefix}-truck`}>
          <Input id={`${idPrefix}-truck`} placeholder="DHA-1234" {...register('truckNo')} />
        </Field>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Raw material type" error={errors.productId?.message} htmlFor={`${idPrefix}-material`}>
          <Select value={productId} onValueChange={(value) => setValue('productId', value, { shouldValidate: true })}>
            <SelectTrigger id={`${idPrefix}-material`}>
              <SelectValue placeholder="Choose the raw material" />
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

        <Field label="Available raw stock" hint="Imported − production − wastage − raw sold">
          <div className={readout} aria-live="polite">
            <span className={available <= 0 ? 'text-destructive' : undefined}>{formatTons(available)} Ton</span>
          </div>
        </Field>

        <Field label="Rate / Ton (৳)" error={errors.ratePerTon?.message} htmlFor={`${idPrefix}-rate`}>
          <Controller
            control={control}
            name="ratePerTon"
            render={({ field: f }) => (
              <NumberInput
                id={`${idPrefix}-rate`}
                value={f.value as unknown as number}
                onChange={f.onChange}
                placeholder="0"
                invalid={Boolean(errors.ratePerTon)}
              />
            )}
          />
        </Field>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-secondary/30 p-3">
        <p className="mb-2.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Scale className="h-3.5 w-3.5" aria-hidden />
          Weight
        </p>
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Net weight (kg)" error={errors.netWeightKg?.message} htmlFor={`${idPrefix}-net`} hint="Edit to the final billing quantity.">
            <Input
              id={`${idPrefix}-net`}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="20000"
              {...register('netWeightKg')}
            />
          </Field>

          <Field label="Net weight (Ton)" hint="Billed and deducted from raw stock">
            <div className={readout}>{netTon > 0 ? formatTons(netTon) : '—'}</div>
          </Field>

          <Field label="Total amount">
            <div className="flex h-[1.625rem] items-center rounded-md border border-transparent bg-card px-2.5">
              <Money value={total} size="sm" weight="semibold" />
            </div>
          </Field>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Paid at sale (৳)" error={errors.paidAtSale?.message} htmlFor={`${idPrefix}-paid`} hint="Leave blank if this is fully on credit.">
          <Controller
            control={control}
            name="paidAtSale"
            render={({ field: f }) => (
              <NumberInput
                id={`${idPrefix}-paid`}
                value={f.value as unknown as number}
                onChange={f.onChange}
                placeholder="0"
                invalid={Boolean(errors.paidAtSale)}
              />
            )}
          />
        </Field>

        {paidAtSale > 0 && (
          <Field label="Payment account" htmlFor={`${idPrefix}-account`} hint="This amount is recorded on the Cash & Bank Ledger too.">
            <Select value={accountId} onValueChange={(value) => setValue('accountId', value)}>
              <SelectTrigger id={`${idPrefix}-account`}>
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

        <Field label="Notes (optional)" htmlFor={`${idPrefix}-notes`}>
          <Textarea id={`${idPrefix}-notes`} rows={1} placeholder="Anything worth noting on this sale" {...register('notes')} />
        </Field>
      </div>

      <SaleTotalsSummary total={total} paidAtSale={paidAtSale} customerAdvance={customerAdvance(customerId)} />

      {editing ? (
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="success" loading={isSubmitting}>
            Save changes — {formatCurrency(total)}
          </Button>
        </div>
      ) : (
        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full"
          loading={isSubmitting}
          disabled={customers.length === 0 || products.length === 0}
        >
          <Receipt />
          Record raw material sale — {formatCurrency(total)}
        </Button>
      )}

      {(customers.length === 0 || products.length === 0) && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Add {customers.length === 0 ? 'a customer' : 'a raw material type'} before recording a sale.
        </p>
      )}
    </form>
  )

  if (editing) return form

  return (
    <Section
      title={`New raw material sale — ${nextInvoiceNo}`}
      description="Raw limestone sold straight from the yard, by net weight. Deducted from raw stock, not from bagged stock."
    >
      {form}
    </Section>
  )
}
