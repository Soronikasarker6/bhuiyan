import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import type { Account, CustomerLedgerRow } from '@/types'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { todayISO } from '@/utils/format'
import { PAYMENT_METHODS } from '@/constants/paymentMethods'
import type { PaymentUpdateInput } from '@/hooks/useAppData'

const NONE = '__none__'

const schema = z.object({
  date: z.string().min(1, 'Pick the date.'),
  amount: z.coerce.number({ invalid_type_error: 'Enter an amount.' }).positive('Amount must be more than zero.'),
  method: z.string().optional(),
  accountId: z.string().optional(),
  reason: z.string().max(255).optional(),
})

type FormValues = z.input<typeof schema>

/**
 * Editing a Cash In already recorded (§9).
 *
 * The customer it belongs to is fixed — shown as a label, never a field —
 * because changing whose payment this is would mean unwinding a credit from
 * one customer's balance and applying it to another's, which is really two
 * separate corrections wearing one form. Everything else about the event
 * (when, how much, how, where it landed) can change here.
 */
export function EditPaymentDialog({
  row,
  accounts,
  onOpenChange,
  onSubmit,
}: {
  row: (CustomerLedgerRow & { customerName?: string }) | null
  accounts: Account[]
  onOpenChange: (open: boolean) => void
  onSubmit: (values: PaymentUpdateInput) => void | Promise<void>
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: todayISO(), amount: '' as unknown as number, method: PAYMENT_METHODS[0], accountId: NONE },
  })

  // Re-seed the form every time a different row is opened for editing.
  useEffect(() => {
    if (row) {
      reset({
        date: row.date,
        amount: row.credit,
        method: row.method ?? PAYMENT_METHODS[0],
        accountId: row.linkedAccountId ?? NONE,
        reason: '',
      })
    }
  }, [row, reset])

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      date: values.date,
      amount: Number(values.amount),
      method: values.method,
      accountId: values.accountId === NONE ? undefined : values.accountId,
      reason: values.reason?.trim() || undefined,
    })
  })

  return (
    <Dialog
      open={row !== null}
      headerText={row ? `Edit payment · ${row.reference}` : 'Edit payment'}
      onClose={() => onOpenChange(false)}
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button variant="success" loading={isSubmitting} onClick={submit}>
                Save changes
              </Button>
            </>
          }
        />
      }
    >
      {row && (
        <form onSubmit={submit} noValidate className="min-w-[20rem] space-y-4 p-1">
          {row.customerName && (
            <p className="text-[0.8125rem] text-muted-foreground">
              Payment from <span className="font-medium text-foreground">{row.customerName}</span>
            </p>
          )}

          <Field label="Date" error={errors.date?.message} htmlFor="edit-pay-date">
            <DatePicker id="edit-pay-date" max={todayISO()} value={watch('date')} onChange={(v) => setValue('date', v)} />
          </Field>

          <Field label="Amount (৳)" error={errors.amount?.message} htmlFor="edit-pay-amount">
            <Input id="edit-pay-amount" type="number" min={0} step="1" inputMode="numeric" {...register('amount')} />
          </Field>

          <Field label="Payment method" htmlFor="edit-pay-method">
            <Select value={watch('method')} onValueChange={(v) => setValue('method', v)}>
              <SelectTrigger id="edit-pay-method">
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

          <Field
            label="Deposit into (optional)"
            htmlFor="edit-pay-account"
            hint="Also updates the linked Cash & Bank Ledger entry."
          >
            <Select value={watch('accountId')} onValueChange={(v) => setValue('accountId', v)}>
              <SelectTrigger id="edit-pay-account">
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

          <Field
            label="Reason for the change (optional)"
            htmlFor="edit-pay-reason"
            hint="Recorded in the audit history next to the old and new figures."
          >
            <Textarea id="edit-pay-reason" rows={2} {...register('reason')} placeholder="e.g. Overstated the amount" />
          </Field>
        </form>
      )}
    </Dialog>
  )
}
