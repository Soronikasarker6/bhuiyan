import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import { ArrowRightLeft, Link2 } from 'lucide-react'
import type { Account, Category, LedgerRow } from '@/types'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { todayISO } from '@/utils/format'
import { transferCategory } from '@/utils/ledger'
import type { TransactionUpdateInput, TransferUpdateInput } from '@/hooks/useAppData'

/**
 * Editing a Cash & Bank entry already recorded (§13).
 *
 * The entry is corrected in place — it is not deleted and re-entered — so
 * TX-000123 stays TX-000123 and anything already citing it still points at the
 * same event. What changed, from what to what, and the reason given, all land
 * in the Audit History; the register itself keeps showing only the corrected
 * figures (§15).
 *
 * A transfer leg opens a different form: a transfer is one operation with two
 * entries, so the fields are From / To / Amount and both legs move together.
 * Editing one side alone would leave the two accounts disagreeing about how
 * much was moved (§17).
 */

const entrySchema = z.object({
  date: z.string().min(1, 'Pick the date.'),
  details: z.string().max(200).optional(),
  accountId: z.string().min(1, 'Which account was this?'),
  direction: z.enum(['in', 'out']),
  category: z.string().min(1, 'Choose a category.'),
  amount: z.coerce
    .number({ invalid_type_error: 'Enter an amount.' })
    .positive('The amount must be more than zero.')
    .max(1_000_000_000, 'That amount looks wrong — check the figure.'),
  reason: z.string().max(255).optional(),
})

const transferSchema = z
  .object({
    date: z.string().min(1, 'Pick the date.'),
    details: z.string().max(200).optional(),
    fromAccountId: z.string().min(1, 'Choose the account the money leaves.'),
    toAccountId: z.string().min(1, 'Choose the account the money arrives in.'),
    amount: z.coerce
      .number({ invalid_type_error: 'Enter an amount.' })
      .positive('The amount must be more than zero.'),
    reason: z.string().max(255).optional(),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, {
    path: ['toAccountId'],
    message: 'Pick a different account — money cannot move to where it already is.',
  })

type EntryValues = z.input<typeof entrySchema>
type TransferValues = z.input<typeof transferSchema>

export function EditTransactionDialog({
  row,
  accounts,
  categories,
  transactions,
  onOpenChange,
  onSubmit,
}: {
  /** The entry being edited, or null when the dialog is closed. */
  row: LedgerRow | null
  accounts: Account[]
  categories: Category[]
  /** Needed only to find a transfer's other leg, so the From/To fields start correct. */
  transactions: Array<{ id: string; transferId?: string; direction: 'in' | 'out'; accountId: string }>
  onOpenChange: (open: boolean) => void
  onSubmit: (values: TransactionUpdateInput | TransferUpdateInput) => void | Promise<void>
}) {
  const isTransfer = Boolean(row?.transferId)

  return isTransfer ? (
    <TransferForm
      row={row}
      accounts={accounts}
      transactions={transactions}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  ) : (
    <EntryForm
      row={row}
      accounts={accounts}
      categories={categories}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />
  )
}

function EntryForm({
  row,
  accounts,
  categories,
  onOpenChange,
  onSubmit,
}: {
  row: LedgerRow | null
  accounts: Account[]
  categories: Category[]
  onOpenChange: (open: boolean) => void
  onSubmit: (values: TransactionUpdateInput) => void | Promise<void>
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EntryValues>({
    resolver: zodResolver(entrySchema),
    defaultValues: { date: todayISO(), direction: 'out', amount: '' as unknown as number },
  })

  // Re-seed every time a different entry is opened for editing.
  useEffect(() => {
    if (row) {
      reset({
        date: row.date,
        details: row.details ?? '',
        accountId: row.accountId,
        direction: row.direction,
        category: row.category,
        amount: row.amount,
        reason: '',
      })
    }
  }, [row, reset])

  const direction = watch('direction')
  // Only categories valid for the direction currently chosen — the backend
  // rejects a mismatch, so offering one would only produce an error later.
  const available = categories.filter((c) => c.direction === direction)

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      date: values.date,
      details: values.details?.trim() || undefined,
      accountId: values.accountId,
      direction: values.direction,
      category: values.category,
      amount: Number(values.amount),
      reason: values.reason?.trim() || undefined,
    })
  })

  return (
    <Dialog
      open={row !== null}
      headerText={row?.reference ? `Edit entry · ${row.reference}` : 'Edit entry'}
      onClose={() => onOpenChange(false)}
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
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
        <form onSubmit={submit} noValidate className="min-w-[21rem] max-w-[26rem] space-y-3.5 p-1">
          <p className="text-2xs text-muted-foreground">
            The entry is corrected in place — it keeps its reference and its place in the register. The
            change is recorded in the audit history.
          </p>

          <Field label="Date" error={errors.date?.message} htmlFor="edit-tx-date">
            <DatePicker id="edit-tx-date" max={todayISO()} value={watch('date') ?? ''} onChange={(v) => setValue('date', v)} />
          </Field>

          <Field label="Direction" error={errors.direction?.message} htmlFor="edit-tx-direction">
            <Select
              value={direction}
              onValueChange={(v) => {
                setValue('direction', v as 'in' | 'out')
                // The old category almost certainly belongs to the other
                // direction, so it is cleared rather than left invalid.
                setValue('category', '')
              }}
            >
              <SelectTrigger id="edit-tx-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Money in</SelectItem>
                <SelectItem value="out">Money out</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Account" error={errors.accountId?.message} htmlFor="edit-tx-account">
            <Select value={watch('accountId') ?? ''} onValueChange={(v) => setValue('accountId', v)}>
              <SelectTrigger id="edit-tx-account">
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

          <Field label="Category" error={errors.category?.message} htmlFor="edit-tx-category">
            <Select value={watch('category') ?? ''} onValueChange={(v) => setValue('category', v)}>
              <SelectTrigger id="edit-tx-category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {available.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Amount (৳)" error={errors.amount?.message} htmlFor="edit-tx-amount">
            <Input id="edit-tx-amount" type="number" min={0} step="1" inputMode="numeric" {...register('amount')} />
          </Field>

          <Field label="Details" error={errors.details?.message} htmlFor="edit-tx-details">
            <Input id="edit-tx-details" {...register('details')} placeholder="What was this for?" />
          </Field>

          <Field
            label="Reason for the change (optional)"
            htmlFor="edit-tx-reason"
            hint="Recorded in the audit history next to the old and new figures."
          >
            <Textarea id="edit-tx-reason" rows={2} {...register('reason')} placeholder="e.g. Corrected wrong amount" />
          </Field>
        </form>
      )}
    </Dialog>
  )
}

function TransferForm({
  row,
  accounts,
  transactions,
  onOpenChange,
  onSubmit,
}: {
  row: LedgerRow | null
  accounts: Account[]
  transactions: Array<{ id: string; transferId?: string; direction: 'in' | 'out'; accountId: string }>
  onOpenChange: (open: boolean) => void
  onSubmit: (values: TransferUpdateInput) => void | Promise<void>
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransferValues>({
    resolver: zodResolver(transferSchema),
    defaultValues: { date: todayISO(), amount: '' as unknown as number },
  })

  useEffect(() => {
    if (!row) return

    const legs = transactions.filter((t) => t.transferId && t.transferId === row.transferId)
    reset({
      date: row.date,
      details: row.details ?? '',
      fromAccountId: legs.find((l) => l.direction === 'out')?.accountId ?? '',
      toAccountId: legs.find((l) => l.direction === 'in')?.accountId ?? '',
      amount: row.amount,
      reason: '',
    })
  }, [row, transactions, reset])

  const from = accounts.find((a) => a.id === watch('fromAccountId'))
  const to = accounts.find((a) => a.id === watch('toAccountId'))

  const submit = handleSubmit(async (values) => {
    await onSubmit({
      date: values.date,
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      amount: Number(values.amount),
      details: values.details?.trim() || undefined,
      reason: values.reason?.trim() || undefined,
    })
  })

  return (
    <Dialog
      open={row !== null}
      headerText="Edit transfer"
      onClose={() => onOpenChange(false)}
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="success" loading={isSubmitting} onClick={submit}>
                Save both legs
              </Button>
            </>
          }
        />
      }
    >
      {row && (
        <form onSubmit={submit} noValidate className="min-w-[21rem] max-w-[26rem] space-y-3.5 p-1">
          <p className="flex items-start gap-2 rounded-lg border border-brass-200 bg-brass-50/60 px-3 py-2 text-2xs text-brass-800">
            <Link2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              This is one transfer with two entries. Both legs are updated together, so the two accounts can
              never disagree about how much was moved.
            </span>
          </p>

          <Field label="Date" error={errors.date?.message} htmlFor="edit-tr-date">
            <DatePicker id="edit-tr-date" max={todayISO()} value={watch('date') ?? ''} onChange={(v) => setValue('date', v)} />
          </Field>

          <Field label="From" error={errors.fromAccountId?.message} htmlFor="edit-tr-from">
            <Select value={watch('fromAccountId') ?? ''} onValueChange={(v) => setValue('fromAccountId', v)}>
              <SelectTrigger id="edit-tr-from">
                <SelectValue placeholder="Money leaves" />
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

          <Field label="To" error={errors.toAccountId?.message} htmlFor="edit-tr-to">
            <Select value={watch('toAccountId') ?? ''} onValueChange={(v) => setValue('toAccountId', v)}>
              <SelectTrigger id="edit-tr-to">
                <SelectValue placeholder="Money arrives" />
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

          {from && to && (
            <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <ArrowRightLeft className="h-3 w-3" aria-hidden />
              Filed as <span className="font-medium text-foreground">{transferCategory(from, to)}</span>
            </p>
          )}

          <Field label="Amount (৳)" error={errors.amount?.message} htmlFor="edit-tr-amount">
            <Input id="edit-tr-amount" type="number" min={0} step="1" inputMode="numeric" {...register('amount')} />
          </Field>

          <Field
            label="Reason for the change (optional)"
            htmlFor="edit-tr-reason"
            hint="Recorded in the audit history next to the old and new figures."
          >
            <Textarea id="edit-tr-reason" rows={2} {...register('reason')} placeholder="e.g. Wrong figure entered" />
          </Field>
        </form>
      )}
    </Dialog>
  )
}
