import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import type { InternalLedgerOpening } from '@/types'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { formatCurrencyExact } from '@/utils/format'

/**
 * A party's opening balance in the owner's private book.
 *
 * Kept apart from the entry form because it is a different kind of thing: a
 * starting position rather than something that happened. It has no debit and
 * credit sides — it is one signed figure, stated as of a date.
 *
 * It is also *not* the customer's `opening_balance` on the Customers screen.
 * That one belongs to the operational receivables ledger and moves the
 * customer's real due; this one is private and moves nothing but this book.
 * The dialog says so, because the two would otherwise be easy to confuse.
 */

const schema = z.object({
  amount: z.coerce
    .number({ invalid_type_error: 'Enter an amount.' })
    .min(0, 'Enter the amount as a positive figure and pick the side below.')
    .max(999_999_999_999),
  side: z.enum(['dr', 'cr']),
  asOf: z.string().optional(),
  notes: z.string().max(255).optional(),
})

type FormValues = z.input<typeof schema>

export function OpeningBalanceDialog({
  open,
  customerName,
  opening,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  customerName: string
  opening: InternalLedgerOpening | null
  onOpenChange: (open: boolean) => void
  onSubmit: (values: { openingBalance: number; asOf?: string; notes?: string }) => void | Promise<void>
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
    defaultValues: { amount: '' as unknown as number, side: 'dr', asOf: '', notes: '' },
  })

  useEffect(() => {
    if (!open) return

    const stored = opening?.openingBalance ?? 0
    reset({
      // Stored signed, entered as a positive figure plus a side — which is
      // how an accountant states it, and removes any chance of a stray minus
      // sign flipping the whole book.
      amount: stored === 0 ? ('' as unknown as number) : Math.abs(stored),
      side: stored < 0 ? 'cr' : 'dr',
      asOf: opening?.asOf ?? '',
      notes: opening?.notes ?? '',
    })
  }, [open, opening, reset])

  const amount = Number(watch('amount')) || 0
  const side = watch('side')
  const signed = side === 'cr' ? -amount : amount

  const submit = handleSubmit(async (values) => {
    const magnitude = Number(values.amount) || 0
    await onSubmit({
      openingBalance: values.side === 'cr' ? -magnitude : magnitude,
      asOf: values.asOf || undefined,
      notes: values.notes?.trim() || undefined,
    })
  })

  return (
    <Dialog
      open={open}
      headerText={`Opening balance · ${customerName}`}
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
                Save opening balance
              </Button>
            </>
          }
        />
      }
    >
      <form onSubmit={submit} noValidate className="min-w-[20rem] max-w-[25rem] space-y-3.5 p-1">
        <p className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-2xs leading-relaxed text-muted-foreground">
          This is the starting position for <span className="font-medium text-foreground">{customerName}</span> in
          your private book only. It does not change their due, their advance, or anything on the Customers or Cash In
          screens.
        </p>

        <Field label="Amount (৳)" error={errors.amount?.message} htmlFor="ilg-opening-amount">
          <Input
            id="ilg-opening-amount"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            {...register('amount')}
            placeholder="0.00"
          />
        </Field>

        <Field label="Side" htmlFor="ilg-opening-side" hint="Dr — they owe you. Cr — you owe them, or they are ahead.">
          <div className="flex gap-2" id="ilg-opening-side">
            {(['dr', 'cr'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={side === value ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setValue('side', value)}
                aria-pressed={side === value}
              >
                {value === 'dr' ? 'Dr — they owe you' : 'Cr — they are ahead'}
              </Button>
            ))}
          </div>
        </Field>

        <Field label="As of (optional)" htmlFor="ilg-opening-asof" hint="The date this figure is stated from.">
          <DatePicker id="ilg-opening-asof" value={watch('asOf') ?? ''} onChange={(value) => setValue('asOf', value)} />
        </Field>

        <Field label="Note (optional)" error={errors.notes?.message} htmlFor="ilg-opening-notes">
          <Input id="ilg-opening-notes" {...register('notes')} placeholder="e.g. Carried over from the old book" />
        </Field>

        {amount > 0 && (
          <p className="text-2xs text-muted-foreground">
            The book will open at{' '}
            <span className="font-mono tabular font-semibold text-foreground">
              {formatCurrencyExact(Math.abs(signed))} {signed < 0 ? 'Cr' : 'Dr'}
            </span>
            .
          </p>
        )}
      </form>
    </Dialog>
  )
}
