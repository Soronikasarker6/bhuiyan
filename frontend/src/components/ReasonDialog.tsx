import { useEffect, useState, type ReactNode } from 'react'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/Field'

const STATE = { destructive: 'Negative', success: 'Positive', default: 'None' } as const

/**
 * `ConfirmDialog` plus one question: *why?*
 *
 * Used wherever an action is recorded in the audit trail and the reason is the
 * part a person will actually want months later — voiding a financial entry,
 * removing a payment. The reason is stored on the audit event only, never on
 * the ledger row, so the register itself stays clean (§15).
 *
 * The reason is optional by default: forcing a sentence out of someone in a
 * hurry produces "asdf", not an explanation. Pass `requireReason` where an
 * empty one genuinely isn't acceptable.
 *
 * Same busy contract as `ConfirmDialog`: `onConfirm` may return a promise, and
 * while it is pending the confirm button shows the house loader and both
 * buttons are disabled, so a slow request cannot be double-submitted. The
 * dialog closes only once that promise settles — on failure it stays open with
 * what was typed still in the box.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  reasonLabel = 'Reason',
  reasonHint = 'Recorded in the audit history — what went wrong, in a few words.',
  placeholder = 'e.g. Wrong entry',
  requireReason = false,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'default' | 'success'
  reasonLabel?: string
  reasonHint?: string
  placeholder?: string
  requireReason?: boolean
  onConfirm: (reason: string | undefined) => void | Promise<unknown>
  /** Extra detail — a summary of exactly what is about to be removed. */
  children?: ReactNode
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)

  // A fresh box every time it opens — the previous action's reason has
  // nothing to do with this one.
  useEffect(() => {
    if (open) {
      setReason('')
      setTouched(false)
    }
  }, [open])

  const missing = requireReason && reason.trim() === ''

  const confirm = async () => {
    setTouched(true)
    if (missing) return

    setBusy(true)
    try {
      await onConfirm(reason.trim() || undefined)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      headerText={title}
      state={STATE[variant]}
      onClose={() => !busy && onOpenChange(false)}
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                {cancelLabel}
              </Button>
              <Button variant={variant === 'default' ? 'default' : variant} loading={busy} onClick={confirm}>
                {confirmLabel}
              </Button>
            </>
          }
        />
      }
    >
      <div className="min-w-[19rem] max-w-[26rem] space-y-3 p-1">
        <div className="text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</div>
        {children}

        <Field
          label={requireReason ? reasonLabel : `${reasonLabel} (optional)`}
          htmlFor="reason-dialog-reason"
          hint={reasonHint}
          error={touched && missing ? 'Please say why.' : undefined}
        >
          <textarea
            id="reason-dialog-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={255}
            disabled={busy}
            placeholder={placeholder}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-[0.8125rem] outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-60"
          />
        </Field>
      </div>
    </Dialog>
  )
}
