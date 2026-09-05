import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Banknote } from 'lucide-react'
import type { Account, Customer } from '@/types'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { Money } from '@/components/Money'
import { formatCurrency, todayISO } from '@/utils/format'
import { PAYMENT_METHODS } from '@/constants/paymentMethods'

const NONE = '__none__'

const schema = z.object({
  customerId: z.string().min(1, 'Choose a customer.'),
  date: z.string().min(1, 'Pick the date.'),
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount.' }).positive('Amount must be more than zero.'),
  method: z.string().optional(),
  accountId: z.string().optional(),
  notes: z.string().max(300).optional(),
})

export type PaymentFormValues = z.input<typeof schema>
export type PaymentSubmit = z.output<typeof schema>

/**
 * Cash In — money received from a customer.
 *
 * It never targets a specific invoice: it is simply a credit against the
 * customer's one running balance (§4). Whatever that balance currently is —
 * Due or Advance — is shown here so the amount typed can be compared against
 * it, but the payment itself is unconditional; `buildPayment` in
 * `utils/customerLedger.ts` posts it and the ledger's own running balance
 * decides afterwards whether the customer still owes or is now ahead.
 */
export function PaymentForm({
  customers,
  balanceOf,
  accounts,
  onSubmit,
}: {
  customers: Customer[]
  balanceOf: (customerId: string) => number
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
      date: todayISO(),
      amount: '' as unknown as number,
      method: PAYMENT_METHODS[0],
      accountId: NONE,
      notes: '',
    },
  })

  const customerId = watch('customerId')
  const accountId = watch('accountId')
  const method = watch('method')
  const amount = Number(watch('amount')) || 0

  const currentBalance = useMemo(() => (customerId ? balanceOf(customerId) : 0), [balanceOf, customerId])
  const currentDue = Math.max(0, currentBalance)
  const currentAdvance = Math.max(0, -currentBalance)
  const balanceAfter = currentBalance - amount

  const submit = handleSubmit((values) => {
    onSubmit({
      ...(values as PaymentSubmit),
      accountId: values.accountId === NONE ? undefined : values.accountId,
    })
    reset({
      customerId: values.customerId,
      date: values.date,
      amount: '' as unknown as number,
      method: values.method,
      accountId: NONE,
      notes: '',
    })
  })

  return (
    <Section title="Cash In" description="Money received from a customer — reduces due, or adds to Advance.">
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" error={errors.customerId?.message} htmlFor="pay-customer">
            <Select value={customerId} onValueChange={(v) => setValue('customerId', v)}>
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

          <Field label="Date" error={errors.date?.message} htmlFor="pay-date">
            <DatePicker id="pay-date" max={todayISO()} value={watch('date')} onChange={(v) => setValue('date', v)} />
          </Field>
        </div>

        {customerId && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
            <span className="text-[0.8125rem] font-medium text-muted-foreground">
              {currentBalance > 0 ? 'Currently due' : currentBalance < 0 ? 'Currently in advance' : "Customer's balance"}
            </span>
            <Money
              value={currentDue > 0 ? currentDue : currentAdvance}
              size="lg"
              weight="bold"
              tone={currentDue > 0 ? 'negative' : 'positive'}
            />
          </div>
        )}

        <div className="mt-4">
          <Field label="Amount (৳)" error={errors.amount?.message} htmlFor="pay-amount">
            <Input id="pay-amount" type="number" min={0} step="1" inputMode="numeric" {...register('amount')} />
          </Field>
        </div>

        {amount > 0 && (
          <p className="mt-2 text-2xs text-muted-foreground">
            {balanceAfter > 0
              ? `Due drops to ${formatCurrency(balanceAfter)} after this payment.`
              : balanceAfter < 0
                ? `Due is fully cleared, with ${formatCurrency(-balanceAfter)} left over as Advance.`
                : 'Due is fully cleared after this payment.'}
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
          <Field label="Notes (optional)" htmlFor="pay-notes">
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
