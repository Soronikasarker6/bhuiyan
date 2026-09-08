import { Banknote, Landmark, Wallet } from 'lucide-react'
import type { AccountBalance } from '@/types'
import type { BalanceTotals } from '@/utils/ledger'
import { Money } from '@/components/Money'
import { cn } from '@/utils/cn'

/**
 * Cash in hand and each bank, then the two totals.
 *
 * Cash is given its own emphasis because it is the account someone can be
 * asked to physically count, and a discrepancy there is the one that gets
 * noticed the same day.
 */
export function BalanceSummary({
  balances,
  totals,
}: {
  balances: AccountBalance[]
  totals: BalanceTotals
}) {
  const cash = balances.filter((b) => b.kind === 'cash')
  const banks = balances.filter((b) => b.kind === 'bank')

  return (
    <div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {cash.map((account) => (
          <BalanceTile key={account.accountId} account={account} emphasis />
        ))}
        {banks.map((account) => (
          <BalanceTile key={account.accountId} account={account} />
        ))}
      </div>

      <dl className="mt-4 space-y-2 border-t border-dashed border-border pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-xs text-muted-foreground">
            <Landmark className="h-3.5 w-3.5 text-brass-600" aria-hidden />
            Total in banks
          </dt>
          <dd>
            <Money value={totals.bank} size="sm" weight="semibold" />
          </dd>
        </div>

        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2 text-xs font-medium text-foreground">
            <Wallet className="h-3.5 w-3.5 text-success-700" aria-hidden />
            Cash + bank combined
          </dt>
          <dd>
            <Money value={totals.combined} size="sm" weight="bold" />
          </dd>
        </div>
      </dl>
    </div>
  )
}

function BalanceTile({
  account,
  emphasis = false,
}: {
  account: AccountBalance
  emphasis?: boolean
}) {
  const negative = account.balance < 0

  return (
    <div
      className={cn(
        'rounded-lg border px-3.5 py-3 transition-colors',
        emphasis
          ? 'border-primary-200 bg-primary-50/60'
          : 'border-border bg-secondary/40 hover:bg-secondary/70',
        negative && 'border-destructive/40 bg-destructive/[0.04]',
      )}
    >
      <div className="flex items-center gap-1.5">
        {emphasis ? (
          <Banknote className="h-3.5 w-3.5 shrink-0 text-primary-700" aria-hidden />
        ) : (
          <Landmark className="h-3.5 w-3.5 shrink-0 text-brass-600" aria-hidden />
        )}
        <p
          className={cn(
            'truncate text-2xs font-semibold uppercase tracking-wider',
            emphasis ? 'text-primary-800' : 'text-muted-foreground',
          )}
        >
          {emphasis ? 'Cash in hand' : account.accountName}
        </p>
      </div>

      <div className="mt-1.5">
        <Money value={account.balance} size="lg" weight="semibold" />
      </div>

      {negative && (
        <p className="mt-1 text-2xs font-medium text-destructive">
          Overdrawn — check for a missing receipt
        </p>
      )}
    </div>
  )
}
