import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRightLeft, Info, Plus } from 'lucide-react'
import type { Account, Category, Direction } from '@/types'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Section } from '@/components/PageHeader'
import { Field } from '@/components/Field'
import { Money } from '@/components/Money'
import { balanceOf, transferCategory } from '@/utils/ledger'
import { todayISO } from '@/utils/format'
import type { Transaction } from '@/types'
import { cn } from '@/utils/cn'

/**
 * The ledger entry form.
 *
 * Three modes on one form, because "money came in", "money went out" and
 * "money moved between our own accounts" are the same act of recording to the
 * person doing it — but only the third writes two rows, and the form makes
 * that explicit rather than leaving them to record both halves by hand.
 */

export type TransactionMode = Direction | 'transfer'

const schema = z
  .object({
    mode: z.enum(['in', 'out', 'transfer']),
    date: z.string().min(1, 'Pick the date.'),
    details: z.string().max(200).optional(),
    amount: z.coerce
      .number({ invalid_type_error: 'Enter an amount.' })
      .positive('The amount must be more than zero.')
      .max(1_000_000_000, 'That amount looks wrong — check the figure.'),
    accountId: z.string().optional(),
    category: z.string().optional(),
    fromAccountId: z.string().optional(),
    toAccountId: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    if (values.mode === 'transfer') {
      if (!values.fromAccountId) {
        ctx.addIssue({ code: 'custom', path: ['fromAccountId'], message: 'Choose the account the money leaves.' })
      }
      if (!values.toAccountId) {
        ctx.addIssue({ code: 'custom', path: ['toAccountId'], message: 'Choose the account the money arrives in.' })
      }
      // Money cannot move from an account to itself; allowing it would write
      // two legs that cancel out and clutter the register with a non-event.
      if (values.fromAccountId && values.fromAccountId === values.toAccountId) {
        ctx.addIssue({
          code: 'custom',
          path: ['toAccountId'],
          message: 'Pick a different account — money cannot move to where it already is.',
        })
      }
      return
    }

    if (!values.accountId) {
      ctx.addIssue({ code: 'custom', path: ['accountId'], message: 'Which account was this?' })
    }
    if (!values.category) {
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'Choose a category so this appears in reports.' })
    }
  })

export type TransactionFormValues = z.input<typeof schema>
export type TransactionSubmit = z.output<typeof schema>

export function TransactionForm({
  accounts,
  categories,
  transactions,
  onSubmit,
}: {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  onSubmit: (values: TransactionSubmit) => void
}) {
  const [mode, setMode] = useState<TransactionMode>('out')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: 'out',
      date: todayISO(),
      details: '',
      amount: '' as unknown as number,
      accountId: accounts[0]?.id ?? '',
      category: '',
      fromAccountId: accounts[0]?.id ?? '',
      toAccountId: accounts[1]?.id ?? '',
    },
  })

  useEffect(() => {
    setValue('mode', mode)
    setValue('category', '')
  }, [mode, setValue])

  const accountId = watch('accountId')
  const category = watch('category')
  const fromAccountId = watch('fromAccountId')
  const toAccountId = watch('toAccountId')
  const amount = Number(watch('amount')) || 0

  const relevantCategories = useMemo(
    () => categories.filter((c) => c.direction === (mode === 'transfer' ? 'out' : mode)),
    [categories, mode],
  )

  const from = accounts.find((a) => a.id === fromAccountId)
  const to = accounts.find((a) => a.id === toAccountId)
  const selected = accounts.find((a) => a.id === accountId)

  const currentBalance = selected ? balanceOf(transactions, selected.id) : 0
  const fromBalance = from ? balanceOf(transactions, from.id) : 0

  const submit = handleSubmit((values) => {
    onSubmit(values as TransactionSubmit)
    reset({
      mode,
      date: values.date,
      details: '',
      amount: '' as unknown as number,
      accountId: values.accountId,
      category: values.category,
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
    })
  })

  const modes: Array<{ id: TransactionMode; label: string; tone: string }> = [
    { id: 'in', label: 'Cash In', tone: 'data-[active=true]:bg-success-700 data-[active=true]:text-white' },
    { id: 'out', label: 'Cash Out', tone: 'data-[active=true]:bg-primary-700 data-[active=true]:text-white' },
    { id: 'transfer', label: 'Transfer', tone: 'data-[active=true]:bg-brass-600 data-[active=true]:text-white' },
  ]

  return (
    <Section title="New ledger entry" description="Record money in, money out, or a transfer between accounts.">
      <form onSubmit={submit} noValidate>
        {/* ------------------------------------------------ mode */}
        <div
          role="radiogroup"
          aria-label="Transaction type"
          className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-secondary p-1"
        >
          {modes.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={mode === option.id}
              data-active={mode === option.id}
              onClick={() => setMode(option.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                mode === option.id ? 'shadow-sm' : 'text-muted-foreground hover:text-foreground',
                option.tone,
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" error={errors.date?.message} htmlFor="txn-date">
            <Input id="txn-date" type="date" max={todayISO()} {...register('date')} />
          </Field>

          <Field label="Amount (৳)" error={errors.amount?.message} htmlFor="txn-amount">
            <Input
              id="txn-amount"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              placeholder="0"
              className="h-11 text-base"
              {...register('amount')}
            />
          </Field>
        </div>

        {mode === 'transfer' ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From account" error={errors.fromAccountId?.message} htmlFor="txn-from">
                <Select
                  value={fromAccountId}
                  onValueChange={(value) => setValue('fromAccountId', value)}
                >
                  <SelectTrigger id="txn-from">
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

              <Field label="To account" error={errors.toAccountId?.message} htmlFor="txn-to">
                <Select value={toAccountId} onValueChange={(value) => setValue('toAccountId', value)}>
                  <SelectTrigger id="txn-to">
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
            </div>

            {from && to && from.id !== to.id && (
              <TransferPreview from={from} to={to} amount={amount} fromBalance={fromBalance} />
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Account"
              error={errors.accountId?.message}
              htmlFor="txn-account"
              hint={
                selected
                  ? `Balance now ৳${Math.round(currentBalance).toLocaleString('en-IN')}`
                  : undefined
              }
            >
              <Select value={accountId} onValueChange={(value) => setValue('accountId', value)}>
                <SelectTrigger id="txn-account">
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

            <Field label="Category" error={errors.category?.message} htmlFor="txn-category">
              <Select value={category} onValueChange={(value) => setValue('category', value)}>
                <SelectTrigger id="txn-category">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {relevantCategories.map((option) => (
                    <SelectItem key={option.id} value={option.name}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        )}

        <div className="mt-4">
          <Field label="Details" htmlFor="txn-details" hint="What was this for? It appears in the register and on printed reports.">
            <Textarea
              id="txn-details"
              rows={2}
              placeholder={
                mode === 'in'
                  ? 'Payment received — ABC Trading'
                  : mode === 'out'
                    ? 'August electricity bill'
                    : 'Deposit to bank'
              }
              {...register('details')}
            />
          </Field>
        </div>

        <Button
          type="submit"
          size="lg"
          variant={mode === 'in' ? 'success' : mode === 'out' ? 'default' : 'secondary'}
          className="mt-4 w-full"
          loading={isSubmitting}
          disabled={accounts.length === 0 || (mode === 'transfer' && accounts.length < 2)}
        >
          {mode === 'transfer' ? <ArrowRightLeft /> : <Plus />}
          {mode === 'in' ? 'Record money in' : mode === 'out' ? 'Record money out' : 'Record transfer'}
        </Button>

        {mode === 'transfer' && accounts.length < 2 && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            A transfer needs at least two accounts. Add another in Settings.
          </p>
        )}
      </form>
    </Section>
  )
}

/**
 * What a transfer will write.
 *
 * Shown because the two-leg behaviour is the least obvious thing in the whole
 * system, and because seeing that the combined total does not move is the
 * quickest way to understand why a transfer is not income.
 */
function TransferPreview({
  from,
  to,
  amount,
  fromBalance,
}: {
  from: Account
  to: Account
  amount: number
  fromBalance: number
}) {
  const category = transferCategory(from, to)
  const overdrawn = amount > fromBalance

  return (
    <div className="rounded-lg border border-brass-200 bg-brass-50/60 p-3.5">
      <p className="mb-2.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-brass-800">
        <Info className="h-3 w-3" aria-hidden />
        This writes two linked entries
      </p>

      <div className="space-y-1.5 text-[0.8125rem]">
        <div className="flex items-center justify-between gap-3 rounded-md bg-card px-3 py-2">
          <span className="flex items-center gap-2">
            <span className="rounded bg-primary-100 px-1.5 py-0.5 font-mono text-2xs font-semibold text-primary-800">
              OUT
            </span>
            {from.name}
          </span>
          <Money value={-amount} size="sm" weight="semibold" />
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md bg-card px-3 py-2">
          <span className="flex items-center gap-2">
            <span className="rounded bg-success-100 px-1.5 py-0.5 font-mono text-2xs font-semibold text-success-800">
              IN
            </span>
            {to.name}
          </span>
          <Money value={amount} size="sm" weight="semibold" tone="positive" />
        </div>
      </div>

      <p className="mt-2.5 border-t border-brass-200 pt-2 text-2xs leading-relaxed text-brass-800">
        Filed as <span className="font-semibold">{category}</span>. Your combined cash + bank total
        does not change — the money has only moved. Deleting either entry removes both.
      </p>

      {overdrawn && amount > 0 && (
        <p className="mt-2 text-2xs font-medium text-destructive">
          {from.name} only holds ৳{Math.round(fromBalance).toLocaleString('en-IN')}. This transfer
          would overdraw it.
        </p>
      )}
    </div>
  )
}
