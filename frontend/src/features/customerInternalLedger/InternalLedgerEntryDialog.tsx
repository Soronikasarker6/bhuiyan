import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import type { Customer, InternalLedgerEntryInput, InternalLedgerRow } from '@/types'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { ComboBox } from '@/components/ui/combobox'
import { DatePicker } from '@/components/ui/date-picker'
import { todayISO } from '@/utils/format'

/**
 * Add or correct one line of the owner's private book.
 *
 * One form for both, because an entry and a correction to it ask exactly the
 * same six questions — the only difference is what the fields start with and
 * what the buttons say.
 *
 * The rule the form exists to enforce is accounting's oldest: a line is a
 * debit *or* a credit, never both, never neither. It is checked here so the
 * person typing finds out immediately, and again in the service behind the
 * API so nothing can write a two-sided line whatever calls it.
 */

const schema = z
  .object({
    customerId: z.string().min(1, 'Choose the customer or party.'),
    date: z.string().min(1, 'Pick the date.'),
    details: z.string().trim().min(1, 'Say what this entry is for.').max(255),
    reference: z.string().max(80).optional(),
    // Kept as strings so an empty box stays empty rather than coercing to 0,
    // which is what makes "one side or the other" checkable below.
    debit: z.string().optional(),
    credit: z.string().optional(),
    reason: z.string().max(255).optional(),
  })
  .superRefine((values, ctx) => {
    const debit = toAmount(values.debit)
    const credit = toAmount(values.credit)

    if (debit !== null && credit !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['credit'],
        message: 'An entry is either a debit or a credit, not both.',
      })
      return
    }

    if (debit === null && credit === null) {
      ctx.addIssue({ code: 'custom', path: ['debit'], message: 'Enter an amount in Debit or Credit.' })
      return
    }

    for (const [side, amount] of [['debit', debit], ['credit', credit]] as const) {
      if (amount !== null && amount <= 0) {
        ctx.addIssue({ code: 'custom', path: [side], message: 'The amount must be more than zero.' })
      }
    }
  })

type FormValues = z.input<typeof schema>

/** `''`, whitespace or an unparseable figure all mean "this side is blank". */
function toAmount(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

export function InternalLedgerEntryDialog({
  open,
  row,
  customers,
  defaultCustomerId,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  /** The entry being corrected, or null when adding a new one. */
  row: InternalLedgerRow | null
  customers: Customer[]
  /** Pre-selects the party currently being viewed, so adding to an open book needs one field fewer. */
  defaultCustomerId?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (values: InternalLedgerEntryInput) => void | Promise<void>
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
    defaultValues: { customerId: '', date: todayISO(), details: '', reference: '', debit: '', credit: '' },
  })

  // Re-seed each time the dialog opens, for whichever entry (or none) it opened on.
  useEffect(() => {
    if (!open) return

    reset(
      row
        ? {
            customerId: row.customerId,
            date: row.date,
            details: row.details,
            reference: row.reference ?? '',
            debit: row.debit > 0 ? String(row.debit) : '',
            credit: row.credit > 0 ? String(row.credit) : '',
            reason: '',
          }
        : {
            customerId: defaultCustomerId ?? '',
            date: todayISO(),
            details: '',
            reference: '',
            debit: '',
            credit: '',
            reason: '',
          },
    )
  }, [open, row, defaultCustomerId, reset])

  const submit = handleSubmit(async (values) => {
    const debit = toAmount(values.debit)
    const credit = toAmount(values.credit)

    await onSubmit({
      customerId: values.customerId,
      date: values.date,
      details: values.details.trim(),
      reference: values.reference?.trim() || undefined,
      debit: debit ?? 0,
      credit: credit ?? 0,
      reason: values.reason?.trim() || undefined,
    })
  })

  const options = customers.map((customer) => ({
    value: customer.id,
    label: customer.name,
    description: customer.company || customer.phone || undefined,
  }))

  return (
    <Dialog
      open={open}
      headerText={row ? `Edit entry · ${row.entryNo}` : 'Add ledger entry'}
      onClose={() => !isSubmitting && onOpenChange(false)}
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="success" loading={isSubmitting} onClick={submit}>
                {row ? 'Save changes' : 'Add entry'}
              </Button>
            </>
          }
        />
      }
    >
      <form onSubmit={submit} noValidate className="min-w-[21rem] max-w-[27rem] space-y-3.5 p-1">
        <Field label="Customer / Party" error={errors.customerId?.message} htmlFor="ilg-customer">
          <ComboBox
            id="ilg-customer"
            value={watch('customerId')}
            options={options}
            onChange={(value) => setValue('customerId', value, { shouldValidate: true })}
            placeholder="Type to search"
            aria-label="Customer or party"
          />
        </Field>

        <Field label="Date" error={errors.date?.message} htmlFor="ilg-date">
          <DatePicker id="ilg-date" value={watch('date') ?? ''} onChange={(value) => setValue('date', value)} />
        </Field>

        <Field label="Details" error={errors.details?.message} htmlFor="ilg-details">
          <Input id="ilg-details" {...register('details')} placeholder="e.g. Goods supplied" />
        </Field>

        <Field
          label="Reference / Note"
          error={errors.reference?.message}
          htmlFor="ilg-reference"
          hint="Your own reference — an invoice or cheque number, whatever you filed it under."
        >
          <Input id="ilg-reference" {...register('reference')} placeholder="e.g. INV-102" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Debit (৳)" error={errors.debit?.message} htmlFor="ilg-debit">
            <Input
              id="ilg-debit"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              {...register('debit')}
              placeholder="0.00"
            />
          </Field>

          <Field label="Credit (৳)" error={errors.credit?.message} htmlFor="ilg-credit">
            <Input
              id="ilg-credit"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              {...register('credit')}
              placeholder="0.00"
            />
          </Field>
        </div>

        <p className="text-2xs text-muted-foreground">
          Fill in one side only. A debit increases what the party owes you; a credit reduces it.
        </p>

        {row && (
          <Field
            label="Reason for the change (optional)"
            htmlFor="ilg-reason"
            hint="Recorded in the audit history next to the old and new figures."
          >
            <Textarea id="ilg-reason" rows={2} {...register('reason')} placeholder="e.g. Corrected the invoice total" />
          </Field>
        )}
      </form>
    </Dialog>
  )
}
