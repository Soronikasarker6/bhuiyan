import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Banknote } from 'lucide-react'
import type { Account, Customer, SaleSummary } from '@/types'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Money } from '@/components/Money'
import { formatCurrency, todayISO } from '@/utils/format'

const NONE = '__none__'
const ON_ACCOUNT = '__on_account__'

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Cheque', 'Mobile Banking', 'Other']

const schema = z.object({
  customerId: z.string().min(1, 'Choose a customer.'),
  saleId: z.string().optional(),
  date: z.string().min(1, 'Pick the date.'),
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount.' }).positive('Amount must be more than zero.'),
  method: z.string().optional(),
  accountId: z.string().optional(),
  notes: z.string().max(300).optional(),
})

export type PaymentFormValues = z.input<typeof schema>
export type PaymentSubmit = z.output<typeof schema>

/**
 * Cash In — money received from a customer, against one invoice or applied
 * on account.
 *
 * "On account" doesn't mean untracked: the page behind this form allocates
 * it oldest-due-first across every invoice the customer actually owes on
 * (`allocateCashIn` in `utils/customerLedger.ts`), so due drops for real, and
 * anything left over becomes tracked Advance rather than a negative due
 * (§12/§13). The current due shown here is what that allocation is about to
 * settle, not a decorative figure.
 */
export function PaymentForm({
  customers,
  dueSales,
  accounts,
  onSubmit,
}: {
  customers: Customer[]
  dueSales: SaleSummary[]
  accounts: Account[]
  onSubmit: (values: PaymentSubmit) => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: customers[0]?.id ?? '',
      saleId: ON_ACCOUNT,
      date: todayISO(),
      amount: '' as unknown as number,
      method: PAYMENT_METHODS[0],
      accountId: NONE,
      notes: '',
    },
  })

  const customerId = watch('customerId')
  const saleId = watch('saleId')
  const accountId = watch('accountId')
  const method = watch('method')
  const amount = Number(watch('amount')) || 0

  const customerDue = useMemo(() => dueSales.filter((s) => s.customerId === customerId), [dueSales, customerId])
  const currentDue = useMemo(() => customerDue.reduce((sum, s) => sum + s.amountDue, 0), [customerDue])
  const selectedSale = customerDue.find((s) => s.id === saleId)
  const targetDue = selectedSale ? selectedSale.amountDue : currentDue
  const remainingAfter = Math.max(0, targetDue - amount)
  const overpayment = Math.max(0, amount - targetDue)

  const submit = handleSubmit((values) => {
    onSubmit({
      ...(values as PaymentSubmit),
      saleId: values.saleId === ON_ACCOUNT ? undefined : values.saleId,
      accountId: values.accountId === NONE ? undefined : values.accountId,
    })
    reset({
      customerId: values.customerId,
      saleId: ON_ACCOUNT,
      date: values.date,
      amount: '' as unknown as number,
      method: values.method,
      accountId: NONE,
      notes: '',
    })
  })

  return (
    <Section title="Cash In" description="Money received from a customer — against a due invoice, or on account.">
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" error={errors.customerId?.message} htmlFor="pay-customer">
            <Select
              value={customerId}
              onValueChange={(v) => {
                setValue('customerId', v)
                setValue('saleId', ON_ACCOUNT)
              }}
            >
              <SelectTrigger id="pay-customer">
                <SelectValue placeholder="Choose a customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Against invoice" htmlFor="pay-sale" hint={customerDue.length === 0 ? 'No due invoices for this customer.' : undefined}>
            <Select value={saleId} onValueChange={(v) => setValue('saleId', v)}>
              <SelectTrigger id="pay-sale">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ON_ACCOUNT}>On account — settles oldest due first</SelectItem>
                {customerDue.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.invoiceNo} — due {formatCurrency(s.amountDue)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {customerId && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
            <span className="text-[0.8125rem] font-medium text-muted-foreground">
              {selectedSale ? `Due on ${selectedSale.invoiceNo}` : "Customer's current total due"}
            </span>
            <Money value={targetDue} size="lg" weight="bold" tone={targetDue > 0 ? 'negative' : 'positive'} />
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Date" error={errors.date?.message} htmlFor="pay-date">
            <Input id="pay-date" type="date" max={todayISO()} {...register('date')} />
          </Field>

          <Field label="Amount (৳)" error={errors.amount?.message} htmlFor="pay-amount">
            <Input id="pay-amount" type="number" min={0} step="1" inputMode="numeric" className="h-11 text-base" {...register('amount')} />
          </Field>
        </div>

        {amount > 0 && (
          <p className="mt-2 text-2xs text-muted-foreground">
            {overpayment > 0
              ? `${formatCurrency(targetDue)} settles the due shown above; the remaining ${formatCurrency(overpayment)} is recorded as Advance.`
              : `Due drops to ${formatCurrency(remainingAfter)} after this payment.`}
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Payment method" htmlFor="pay-method">
            <Select value={method} onValueChange={(v) => setValue('method', v)}>
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Deposit into (optional)" htmlFor="pay-account" hint="Also records this as money in on the Cash & Bank Ledger.">
            <Select value={accountId} onValueChange={(v) => setValue('accountId', v)}>
              <SelectTrigger id="pay-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Don't record on the cash ledger</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Notes / Reference (optional)" htmlFor="pay-notes">
            <Textarea id="pay-notes" rows={2} {...register('notes')} />
          </Field>
        </div>

        <Button type="submit" size="lg" variant="success" className="mt-4 w-full" loading={isSubmitting} disabled={customers.length === 0}>
          <Banknote />
          Record Cash In
        </Button>
      </form>
    </Section>
  )
}
