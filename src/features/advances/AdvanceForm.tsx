import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PiggyBank } from 'lucide-react'
import type { Account, Customer } from '@/types'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { todayISO } from '@/utils/format'

const NONE = '__none__'

const schema = z.object({
  customerId: z.string().min(1, 'Choose a customer.'),
  date: z.string().min(1, 'Pick the date.'),
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount.' }).positive('Amount must be more than zero.'),
  accountId: z.string().optional(),
  notes: z.string().max(300).optional(),
})

export type AdvanceFormValues = z.input<typeof schema>
export type AdvanceSubmit = z.output<typeof schema>

/**
 * Record an advance received.
 *
 * Its own transaction type, never folded into an ordinary payment (§11) —
 * this is what lets "available advance" stay a figure of its own rather than
 * disappearing into the general balance the moment it is recorded.
 */
export function AdvanceForm({
  customers,
  accounts,
  onSubmit,
}: {
  customers: Customer[]
  accounts: Account[]
  onSubmit: (values: AdvanceSubmit) => void
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AdvanceFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerId: customers[0]?.id ?? '',
      date: todayISO(),
      amount: '' as unknown as number,
      accountId: NONE,
      notes: '',
    },
  })

  const customerId = watch('customerId')
  const accountId = watch('accountId')

  const submit = handleSubmit((values) => {
    onSubmit({ ...(values as AdvanceSubmit), accountId: values.accountId === NONE ? undefined : values.accountId })
    reset({ customerId: values.customerId, date: values.date, amount: '' as unknown as number, accountId: NONE, notes: '' })
  })

  return (
    <Section title="Record an advance" description="Money received from a customer before any sale.">
      <form onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer" error={errors.customerId?.message} htmlFor="adv-customer">
            <Select value={customerId} onValueChange={(v) => setValue('customerId', v)}>
              <SelectTrigger id="adv-customer">
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

          <Field label="Date" error={errors.date?.message} htmlFor="adv-date">
            <Input id="adv-date" type="date" max={todayISO()} {...register('date')} />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Amount (৳)" error={errors.amount?.message} htmlFor="adv-amount">
            <Input id="adv-amount" type="number" min={0} step="1" inputMode="numeric" className="h-11 text-base" {...register('amount')} />
          </Field>

          <Field label="Deposit into (optional)" htmlFor="adv-account" hint="Also records this as money in on the Cash & Bank Ledger.">
            <Select value={accountId} onValueChange={(v) => setValue('accountId', v)}>
              <SelectTrigger id="adv-account">
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
          <Field label="Notes (optional)" htmlFor="adv-notes">
            <Textarea id="adv-notes" rows={2} {...register('notes')} />
          </Field>
        </div>

        <Button type="submit" size="lg" variant="success" className="mt-4 w-full" loading={isSubmitting} disabled={customers.length === 0}>
          <PiggyBank />
          Record advance
        </Button>
      </form>
    </Section>
  )
}
