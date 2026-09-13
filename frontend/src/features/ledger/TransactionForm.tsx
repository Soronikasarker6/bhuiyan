import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRightLeft, Info, Plus } from 'lucide-react'
import type { Account, Category, Customer, Direction } from '@/types'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { ComboBox } from '@/components/ui/combobox'
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
import { balanceOf as accountBalanceOf, transferCategory } from '@/utils/ledger'
import { formatCurrency, todayISO } from '@/utils/format'
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

/** The "not a customer payment" option — a plain, general Cash In (§10). */
export const NO_CUSTOMER = '__none__'

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
    /** Only ever set on a Cash In, and optional even then — see `customerId` below. */
    customerId: z.string().optional(),
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
    // A customer payment files itself under "Customer Payment" — there is
    // nothing for the user to pick, so nothing to validate.
    if (isCustomerPayment(values)) return

    if (!values.category) {
      ctx.addIssue({ code: 'custom', path: ['category'], message: 'Choose a category so this appears in reports.' })
    }
  })

/** A Cash In with a customer attached is a customer payment; anything else is not (§10). */
function isCustomerPayment(values: { mode: string; customerId?: string }): boolean {
  return values.mode === 'in' && !!values.customerId && values.customerId !== NO_CUSTOMER
}

export type TransactionFormValues = z.input<typeof schema>
export type TransactionSubmit = z.output<typeof schema>

export function TransactionForm({
  accounts,
  categories,
  customers,
  balanceOf,
  transactions,
  onSubmit,
}: {
  accounts: Account[]
  categories: Category[]
  /** Loaded from the Customer Register — the dropdown offered on a Cash In (§8). */
  customers: Customer[]
  /** That customer's running balance right now: positive is Due, negative is Advance. */
  balanceOf: (customerId: string) => number
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
      customerId: NO_CUSTOMER,
      fromAccountId: accounts[0]?.id ?? '',
      toAccountId: accounts[1]?.id ?? '',
    },
  })

  useEffect(() => {
    setValue('mode', mode)
    setValue('category', '')
    // Only a Cash In can belong to a customer; leaving the mode drops it.
    if (mode !== 'in') setValue('customerId', NO_CUSTOMER)
  }, [mode, setValue])

  const accountId = watch('accountId')
  const category = watch('category')
  const customerId = watch('customerId') ?? NO_CUSTOMER
  const fromAccountId = watch('fromAccountId')
  const toAccountId = watch('toAccountId')
  const amount = Number(watch('amount')) || 0

  const relevantCategories = useMemo(
    () => categories.filter((c) => c.direction === (mode === 'transfer' ? 'out' : mode)),
    [categories, mode],
  )

  // Each customer's current due sits in the list itself, so the right one can
  // be picked without selecting each in turn to find out who owes what.
  const customerOptions = useMemo(
    () =>
      customers.map((customer) => {
        const balance = balanceOf(customer.id)
        return {
          value: customer.id,
          label: customer.name,
          description:
            balance > 0
              ? `${formatCurrency(balance)} due`
              : balance < 0
                ? `${formatCurrency(-balance)} advance`
                : 'Settled',
        }
      }),
    [customers, balanceOf],
  )

  const from = accounts.find((a) => a.id === fromAccountId)
  const to = accounts.find((a) => a.id === toAccountId)
  const selected = accounts.find((a) => a.id === accountId)

  const currentBalance = selected ? accountBalanceOf(transactions, selected.id) : 0
  const fromBalance = from ? accountBalanceOf(transactions, from.id) : 0

  // §8 — the customer's position right now, so the amount typed can be
  // compared against it before the payment is recorded.
  const payingCustomer = customerId !== NO_CUSTOMER ? customers.find((c) => c.id === customerId) : undefined
  const customerBalance = payingCustomer ? balanceOf(payingCustomer.id) : 0
  const customerDue = Math.max(0, customerBalance)
  const customerAdvance = Math.max(0, -customerBalance)
  const balanceAfter = customerBalance - amount

  const submit = handleSubmit((values) => {
    onSubmit(values as TransactionSubmit)
    reset({
      mode,
      date: values.date,
      details: '',
      amount: '' as unknown as number,
      accountId: values.accountId,
      category: values.category,
      customerId: values.customerId,
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
            <DatePicker id="txn-date" max={todayISO()} value={watch('date')} onChange={(v) => setValue('date', v)} />
          </Field>

          <Field label="Amount (৳)" error={errors.amount?.message} htmlFor="txn-amount">
            <Input
              id="txn-amount"
              type="number"
              min={0}
              step="1"
              inputMode="numeric"
              placeholder="0"
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

            {payingCustomer ? (
              /* A customer payment is always filed as Customer Payment, so there
                 is nothing to choose — showing the fixed category is clearer
                 than a disabled dropdown that looks like it could be changed. */
              <Field label="Category" htmlFor="txn-category-fixed">
                <div
                  id="txn-category-fixed"
                  className="flex h-9 items-center rounded-md border border-border bg-secondary/50 px-3 text-[0.8125rem] text-muted-foreground"
                >
                  Customer Payment
                </div>
              </Field>
            ) : (
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
            )}
          </div>
        )}

        {/* ------------------------------------------------ customer (§8/§10)
            Only a Cash In can belong to a customer, and even then it is
            optional: leaving it on "No customer" keeps the plain general
            Cash In behaviour this form has always had. */}
        {mode === 'in' && customers.length > 0 && (
          <div className="mt-4">
            {/* A combobox rather than a plain select: the customer register is
                the one list here that grows without limit, so typing a few
                letters beats scrolling it. Leaving the field empty is how a
                general Cash In is recorded — hence no "none" option to pick. */}
            <Field
              label="Customer (optional)"
              htmlFor="txn-customer"
              hint="Start typing to find a customer, or leave empty for a general cash in."
            >
              <ComboBox
                id="txn-customer"
                aria-label="Customer"
                placeholder="Select customer"
                value={customerId === NO_CUSTOMER ? '' : customerId}
                options={customerOptions}
                onChange={(value) => setValue('customerId', value || NO_CUSTOMER)}
              />
            </Field>

            {payingCustomer && (
              <>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-4 py-3">
                  <span className="text-[0.8125rem] font-medium text-muted-foreground">
                    {customerBalance > 0
                      ? 'Current due'
                      : customerBalance < 0
                        ? 'Currently in advance'
                        : 'Nothing outstanding'}
                  </span>
                  <Money
                    value={customerDue > 0 ? customerDue : customerAdvance}
                    size="lg"
                    weight="bold"
                    tone={customerDue > 0 ? 'negative' : 'positive'}
                  />
                </div>

                {amount > 0 && (
                  <p className="mt-2 text-2xs text-muted-foreground">
                    {balanceAfter > 0
                      ? `Due drops to ${formatCurrency(balanceAfter)} after this payment.`
                      : balanceAfter < 0
                        ? `Due is fully cleared, with ${formatCurrency(-balanceAfter)} left over as Advance.`
                        : 'Due is fully cleared after this payment.'}
                  </p>
                )}

                <p className="mt-2 text-2xs leading-relaxed text-muted-foreground">
                  This writes one payment — {payingCustomer.name}&rsquo;s ledger and their outstanding
                  balance are updated alongside this account, not as a second entry.
                </p>
              </>
            )}
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
          {mode === 'in'
            ? payingCustomer
              ? 'Record customer payment'
              : 'Record money in'
            : mode === 'out'
              ? 'Record money out'
              : 'Record transfer'}
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
