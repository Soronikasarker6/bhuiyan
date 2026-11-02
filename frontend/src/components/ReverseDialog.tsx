import { useEffect, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Field } from '@/components/Field'
import { Textarea } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { todayISO } from '@/utils/format'

/**
 * The Admin correction for a record that can no longer be edited or deleted
 * because it sits in a closed shipment cycle — a raw material sale, a
 * production entry or a wastage entry. Shared so all three ask the same two
 * things: a required reason, and the date the reversal takes effect (which
 * the server requires to fall in an open cycle).
 *
 * The confirm shows the existing UI5 busy state while the request runs (see
 * ConfirmDialog), and stays disabled until a reason is given.
 */
export function ReverseDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onReverse,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** What the reversal will do, in the user's terms. */
  description: ReactNode
  confirmLabel: string
  onReverse: (input: { reason: string; date: string }) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayISO())

  // Each opening starts clean.
  useEffect(() => {
    if (open) {
      setReason('')
      setDate(todayISO())
    }
  }, [open])

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      confirmDisabled={reason.trim().length === 0 || !date}
      onConfirm={() => onReverse({ reason: reason.trim(), date })}
    >
      <div className="mt-3 grid gap-3">
        <Field label="Reversal date" htmlFor="reverse-date" hint="Must fall in an open shipment cycle.">
          <DatePicker id="reverse-date" max={todayISO()} value={date} onChange={setDate} />
        </Field>
        <Field label="Reason (required)" htmlFor="reverse-reason">
          <Textarea id="reverse-reason" rows={2} maxLength={255} placeholder="What was wrong with this entry" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </ConfirmDialog>
  )
}
