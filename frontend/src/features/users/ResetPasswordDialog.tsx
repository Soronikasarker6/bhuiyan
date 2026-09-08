import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import type { AppUser } from '@/types'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const schema = z
  .object({
    password: z.string().min(8, 'At least 8 characters.'),
    passwordConfirmation: z.string().min(1, 'Confirm the new password.'),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    message: 'Passwords do not match.',
    path: ['passwordConfirmation'],
  })

type FormValues = z.input<typeof schema>

/**
 * An admin setting a new password for someone else — no current-password
 * check needed, matching the "Reset Password" action on the Users table
 * rather than a self-service forgot-password email flow (this project has
 * no mail infrastructure, unlike V12's — see the plan for why this is the
 * right-sized adaptation).
 */
export function ResetPasswordDialog({
  open,
  onOpenChange,
  user,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AppUser | null
  onSubmit: (password: string, passwordConfirmation: string) => void
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', passwordConfirmation: '' },
  })

  useEffect(() => {
    if (open) reset({ password: '', passwordConfirmation: '' })
  }, [open, reset])

  const submit = handleSubmit((values) => {
    onSubmit(values.password, values.passwordConfirmation)
    onOpenChange(false)
  })

  return (
    <Dialog
      open={open}
      headerText={user ? `Reset password for ${user.name}` : 'Reset password'}
      onClose={() => onOpenChange(false)}
      className="w-[calc(100vw-2rem)] max-w-sm"
    >
      <form id="reset-password-form" onSubmit={submit} noValidate className="space-y-3 py-1">
        <p className="text-2xs text-muted-foreground">
          This immediately signs {user?.name ?? 'the user'} out everywhere — they'll need the new password next time.
        </p>
        <Field label="New password" error={errors.password?.message} htmlFor="reset-password">
          <Input id="reset-password" type="password" autoComplete="new-password" autoFocus {...register('password')} />
        </Field>
        <Field label="Confirm new password" error={errors.passwordConfirmation?.message} htmlFor="reset-password-confirm">
          <Input id="reset-password-confirm" type="password" autoComplete="new-password" {...register('passwordConfirmation')} />
        </Field>
      </form>

      <Bar
        slot="footer"
        design="Footer"
        endContent={
          <>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="reset-password-form" variant="success" loading={isSubmitting}>
              Reset password
            </Button>
          </>
        }
      />
    </Dialog>
  )
}
