import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Customer } from '@/types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field } from '@/components/Field'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'

/**
 * Add or edit a customer.
 *
 * Opening balance is captured here, at creation, exactly once — it becomes
 * that customer's first ledger row (see `buildOpeningBalance` in
 * `utils/customerLedger.ts`) rather than a field this form can silently
 * change later, which is why it is disabled once the customer already
 * exists.
 */

const schema = z.object({
  name: z.string().min(1, 'Give the customer a name.'),
  company: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  address: z.string().max(200).optional(),
  openingBalance: z.coerce.number().optional(),
  notes: z.string().max(300).optional(),
})

export type CustomerFormValues = z.input<typeof schema>
export type CustomerSubmit = z.output<typeof schema>

export function CustomerForm({
  open,
  onOpenChange,
  editing,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing?: Customer | null
  onSubmit: (values: CustomerSubmit) => void
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      company: '',
      phone: '',
      address: '',
      openingBalance: 0,
      notes: '',
    },
  })

  useEffect(() => {
    if (open) {
      reset({
        name: editing?.name ?? '',
        company: editing?.company ?? '',
        phone: editing?.phone ?? '',
        address: editing?.address ?? '',
        openingBalance: editing?.openingBalance ?? 0,
        notes: editing?.notes ?? '',
      })
    }
  }, [open, editing, reset])

  const submit = handleSubmit((values) => {
    onSubmit(values as CustomerSubmit)
    onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.name}` : 'Add a customer'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-3">
          <Field label="Name" error={errors.name?.message} htmlFor="cust-name">
            <Input id="cust-name" placeholder="ABC Trading" {...register('name')} autoFocus />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Company (optional)" htmlFor="cust-company">
              <Input id="cust-company" placeholder="ABC Trading Ltd" {...register('company')} />
            </Field>
            <Field label="Phone (optional)" htmlFor="cust-phone">
              <Input id="cust-phone" placeholder="017XX-XXXXXX" {...register('phone')} />
            </Field>
          </div>

          <Field label="Address (optional)" htmlFor="cust-address">
            <Input id="cust-address" placeholder="Tongi, Gazipur" {...register('address')} />
          </Field>

          <Field
            label="Opening balance (৳)"
            error={errors.openingBalance?.message}
            htmlFor="cust-opening"
            hint={
              editing
                ? 'Set once, when the customer was added — record any change as a payment, advance or adjustment instead.'
                : 'Positive if they already owed this before you started tracking; negative if they were ahead.'
            }
          >
            <Input id="cust-opening" type="number" step="1" disabled={Boolean(editing)} {...register('openingBalance')} />
          </Field>

          <Field label="Notes (optional)" htmlFor="cust-notes">
            <Textarea id="cust-notes" rows={2} {...register('notes')} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" loading={isSubmitting}>
              {editing ? 'Save changes' : 'Add customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
