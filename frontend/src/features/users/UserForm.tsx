import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import type { AppUser, Role } from '@/types'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/misc'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'

const NONE = '__none__'

/**
 * Add or edit a user. Password/confirm only apply on create — changing an
 * existing user's password goes through the separate Reset Password action
 * (`ResetPasswordDialog`), the same split V12 keeps between the profile form
 * and its own password-reset flow. One schema shape either way (password
 * fields always present in the type) so the form's value type never varies
 * by mode — only whether they're *required* does, via `superRefine`.
 *
 * The role field is sent regardless of who's looking at this form, but is
 * only ever effective when the signed-in user holds
 * USERS_ROLE_ASSIGNMENT_EDIT — the backend silently ignores it otherwise.
 * Disabling the field here too means someone without that permission isn't
 * shown a control that would quietly do nothing.
 */
function buildSchema(isCreate: boolean) {
  return z
    .object({
      name: z.string().min(1, 'Give the user a name.'),
      email: z.string().min(1, 'Enter an email address.').email('Enter a valid email address.'),
      role: z.string().optional(),
      isActive: z.boolean(),
      password: z.string().optional(),
      passwordConfirmation: z.string().optional(),
    })
    .superRefine((values, ctx) => {
      if (!isCreate) return

      if (!values.password || values.password.length < 8) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least 8 characters.', path: ['password'] })
      }
      if (values.password !== values.passwordConfirmation) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Passwords do not match.', path: ['passwordConfirmation'] })
      }
    })
}

type FormValues = z.input<ReturnType<typeof buildSchema>>

export interface UserFormSubmit {
  name: string
  email: string
  isActive: boolean
  role?: string
  password?: string
  passwordConfirmation?: string
}

export function UserForm({
  open,
  onOpenChange,
  editing,
  roles,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: AppUser | null
  roles: Role[]
  onSubmit: (values: UserFormSubmit) => void
}) {
  const canAssignRole = usePermission(PERMISSIONS.USERS_ROLE_ASSIGNMENT_EDIT)
  const schema = useMemo(() => buildSchema(!editing), [editing])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', role: NONE, isActive: true, password: '', passwordConfirmation: '' },
  })

  useEffect(() => {
    if (open) {
      reset({
        name: editing?.name ?? '',
        email: editing?.email ?? '',
        role: editing?.roles[0] ?? NONE,
        isActive: editing?.isActive ?? true,
        password: '',
        passwordConfirmation: '',
      })
    }
  }, [open, editing, reset])

  const isActive = watch('isActive')
  const role = watch('role')

  const submit = handleSubmit((values) => {
    onSubmit({
      name: values.name,
      email: values.email,
      isActive: values.isActive,
      role: values.role === NONE ? undefined : values.role,
      ...(!editing ? { password: values.password, passwordConfirmation: values.passwordConfirmation } : {}),
    })
    onOpenChange(false)
  })

  return (
    <Dialog
      open={open}
      headerText={editing ? `Edit ${editing.name}` : 'Add a user'}
      onClose={() => onOpenChange(false)}
      className="w-[calc(100vw-2rem)] max-w-lg"
    >
      <form id="user-form" onSubmit={submit} noValidate className="space-y-3 py-1">
        <Field label="Full name" error={errors.name?.message} htmlFor="user-name">
          <Input id="user-name" placeholder="Jane Rahman" {...register('name')} autoFocus />
        </Field>

        <Field label="Email" error={errors.email?.message} htmlFor="user-email">
          <Input id="user-email" type="email" placeholder="jane@bhuiyan-industry.test" {...register('email')} />
        </Field>

        {!editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Password" error={errors.password?.message} htmlFor="user-password">
              <Input id="user-password" type="password" autoComplete="new-password" {...register('password')} />
            </Field>
            <Field label="Confirm password" error={errors.passwordConfirmation?.message} htmlFor="user-password-confirm">
              <Input
                id="user-password-confirm"
                type="password"
                autoComplete="new-password"
                {...register('passwordConfirmation')}
              />
            </Field>
          </div>
        )}

        <Field
          label="Role"
          htmlFor="user-role"
          hint={!canAssignRole ? "You don't have permission to change role assignment." : undefined}
        >
          <Select value={role} onValueChange={(v) => setValue('role', v)} disabled={!canAssignRole}>
            <SelectTrigger id="user-role">
              <SelectValue placeholder="No role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No role</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.name}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
          <div>
            <p className="text-[0.8125rem] font-medium">Active</p>
            <p className="text-2xs text-muted-foreground">An inactive user cannot sign in.</p>
          </div>
          <Switch checked={isActive} onCheckedChange={(v) => setValue('isActive', v)} aria-label="Active" />
        </div>
      </form>

      <Bar
        slot="footer"
        design="Footer"
        endContent={
          <>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="user-form" variant="success" loading={isSubmitting}>
              {editing ? 'Save changes' : 'Add user'}
            </Button>
          </>
        }
      />
    </Dialog>
  )
}
