import type { ReactNode } from 'react'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import { Button } from '@/components/ui/button'

const STATE = { destructive: 'Negative', success: 'Positive', default: 'None' } as const

/**
 * Confirmation for anything that cannot be undone.
 *
 * The body says what will actually happen, in the user's terms — "this will
 * create a permanent monthly snapshot", not "are you sure?". A dialog that
 * only asks whether you are sure teaches people to click through it.
 *
 * A thin wrapper around UI5's own `Dialog` (see the architecture plan) —
 * `state="Negative"` is what gives a destructive confirm its red accent and
 * "alertdialog" accessibility role natively, matching V12's own
 * `delete-dialog` component exactly.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
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
  onConfirm: () => void
  /** Extra detail — a summary of exactly what is about to be frozen or lost. */
  children?: ReactNode
}) {
  return (
    <Dialog
      open={open}
      headerText={title}
      state={STATE[variant]}
      onClose={() => onOpenChange(false)}
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {cancelLabel}
              </Button>
              <Button
                variant={variant === 'default' ? 'default' : variant}
                onClick={() => {
                  onConfirm()
                  onOpenChange(false)
                }}
              >
                {confirmLabel}
              </Button>
            </>
          }
        />
      }
    >
      <div className="text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</div>
      {children}
    </Dialog>
  )
}
