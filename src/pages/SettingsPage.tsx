import { useState } from 'react'
import {
  AlertTriangle,
  Banknote,
  Database,
  Download,
  Landmark,
  Lock,
  Plus,
  RotateCcw,
  Tags,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useAppData } from '@/hooks/useAppData'
import type { Account, AccountKind, Category, Direction } from '@/types'
import { balanceOf } from '@/utils/ledger'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { now, uid } from '@/utils/id'
import { cn } from '@/utils/cn'

/**
 * Settings.
 *
 * The rule running through all three tabs: **configuration changes never
 * rewrite history**. Renaming an account renames it everywhere because entries
 * reference it by id; removing a category stops it appearing on new entries
 * but leaves every past transaction filed exactly as it was; retiring a mesh
 * keeps its whole register. Nothing here can silently change a past figure.
 */
export default function SettingsPage() {
  const { data, loading } = useAppData()

  if (loading) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Cash & bank accounts, categories, and data — configuration that never alters entries you have already recorded. Products and mesh sizes have their own page."
      />

      <Tabs defaultValue="accounts">
        <TabsList className="mb-1 flex-wrap justify-start">
          <TabsTrigger value="accounts">
            <Landmark className="h-3.5 w-3.5" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="categories">
            <Tags className="h-3.5 w-3.5" />
            Categories
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database className="h-3.5 w-3.5" />
            Data
          </TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <AccountsPanel />
        </TabsContent>

        <TabsContent value="categories">
          <CategoriesPanel />
        </TabsContent>

        <TabsContent value="data">
          <DataPanel />
        </TabsContent>
      </Tabs>

      <p className="mt-4 text-center text-2xs text-muted-foreground">
        {data.accounts.length} accounts · {data.categories.length} categories ·{' '}
        {data.products.length} products · {data.meshSizes.length} mesh sizes
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- accounts

function AccountsPanel() {
  const { data, update } = useAppData()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('bank')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [pending, setPending] = useState<{ account: Account; used: number } | null>(null)

  const usageOf = (accountId: string) =>
    data.transactions.filter((t) => t.accountId === accountId).length

  const add = (event: React.FormEvent) => {
    event.preventDefault()

    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Give the account a name')
      return
    }

    if (data.accounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error('That account already exists')
      return
    }

    update('accounts', [
      ...data.accounts,
      { id: uid(), name: trimmed, kind, system: false, createdAt: now() },
    ])

    setName('')
    toast.success(`${trimmed} added`)
  }

  // Renaming is safe precisely because transactions reference the account by
  // id, not by name — so every past entry follows the new name automatically.
  const rename = (account: Account) => {
    const trimmed = editName.trim()

    if (!trimmed) {
      toast.error('The account needs a name')
      return
    }

    if (
      data.accounts.some(
        (a) => a.id !== account.id && a.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      toast.error('Another account already has that name')
      return
    }

    update(
      'accounts',
      data.accounts.map((a) => (a.id === account.id ? { ...a, name: trimmed } : a)),
    )

    setEditingId(null)
    toast.success('Account renamed', {
      description: 'Every entry against it now shows the new name.',
    })
  }

  const remove = (account: Account) => {
    update(
      'accounts',
      data.accounts.filter((a) => a.id !== account.id),
    )
    setPending(null)
    toast.success(`${account.name} removed`)
  }

  return (
    <Section
      title="Cash and bank accounts"
      description="Every ledger entry is recorded against one of these."
    >
      <ul className="mb-4 space-y-2">
        {data.accounts.map((account) => {
          const used = usageOf(account.id)
          const balance = balanceOf(data.transactions, account.id)
          const editing = editingId === account.id

          return (
            <li
              key={account.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
            >
              <span
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
                  account.kind === 'cash'
                    ? 'bg-primary-50 text-primary-700'
                    : 'bg-brass-50 text-brass-600',
                )}
              >
                {account.kind === 'cash' ? (
                  <Banknote className="h-4 w-4" aria-hidden />
                ) : (
                  <Landmark className="h-4 w-4" aria-hidden />
                )}
              </span>

              <div className="min-w-0 flex-1">
                {editing ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="h-8 max-w-[14rem]"
                      aria-label={`Rename ${account.name}`}
                      autoFocus
                    />
                    <Button size="sm" variant="success" onClick={() => rename(account)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-semibold">
                      {account.name}
                      {account.system && (
                        <Badge variant="primary">
                          <Lock className="h-2.5 w-2.5" aria-hidden />
                          Protected
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      {used === 0 ? 'No entries yet' : `${used} entries`} · balance{' '}
                      <span
                        className={cn(
                          'font-mono tabular font-medium',
                          balance < 0 ? 'text-destructive' : 'text-foreground',
                        )}
                      >
                        {formatCurrency(balance)}
                      </span>
                    </p>
                  </>
                )}
              </div>

              {!editing && (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(account.id)
                      setEditName(account.name)
                    }}
                  >
                    Rename
                  </Button>

                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    disabled={account.system}
                    onClick={() => setPending({ account, used })}
                    aria-label={
                      account.system
                        ? `${account.name} cannot be removed`
                        : `Remove ${account.name}`
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <div className="min-w-[10rem] flex-1">
          <label
            htmlFor="new-account"
            className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            New account
          </label>
          <Input
            id="new-account"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Mercantile Bank"
          />
        </div>

        <div className="w-32">
          <label
            htmlFor="new-account-kind"
            className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
          >
            Type
          </label>
          <Select value={kind} onValueChange={(value) => setKind(value as AccountKind)}>
            <SelectTrigger id="new-account-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button type="submit" variant="success">
          <Plus />
          Add account
        </Button>
      </form>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Remove ${pending.account.name}?` : ''}
        description={
          pending?.used
            ? `This account has ${pending.used} entries against it. Those entries are kept and will still show the account name, but the account will no longer appear when recording new ones.`
            : 'This account has no entries against it, so nothing is lost.'
        }
        confirmLabel="Remove account"
        onConfirm={() => pending && remove(pending.account)}
      />
    </Section>
  )
}

// ---------------------------------------------------------------- categories

function CategoriesPanel() {
  const { data, update } = useAppData()
  const [pending, setPending] = useState<{ category: Category; used: number } | null>(null)

  const usageOf = (category: Category) =>
    data.transactions.filter((t) => t.category === category.name).length

  const add = (direction: Direction, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return false

    if (
      data.categories.some(
        (c) => c.direction === direction && c.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      toast.error('That category already exists')
      return false
    }

    update('categories', [
      ...data.categories,
      { id: uid(), name: trimmed, direction, createdAt: now() },
    ])

    toast.success(`${trimmed} added`)
    return true
  }

  const remove = (category: Category) => {
    update(
      'categories',
      data.categories.filter((c) => c.id !== category.id),
    )
    setPending(null)
    toast.success(`${category.name} removed`, {
      description: 'Past entries keep the category they were filed under.',
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(['in', 'out'] as const).map((direction) => (
        <CategoryList
          key={direction}
          direction={direction}
          categories={data.categories.filter((c) => c.direction === direction)}
          usageOf={usageOf}
          onAdd={(name) => add(direction, name)}
          onRemove={(category) => setPending({ category, used: usageOf(category) })}
        />
      ))}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending ? `Remove "${pending.category.name}"?` : ''}
        description={
          pending?.used
            ? `${pending.used} past entries are filed under this category. They keep it — this only stops it appearing when recording new entries.`
            : 'No entries use this category, so nothing is affected.'
        }
        confirmLabel="Remove category"
        onConfirm={() => pending && remove(pending.category)}
      />
    </div>
  )
}

function CategoryList({
  direction,
  categories,
  usageOf,
  onAdd,
  onRemove,
}: {
  direction: Direction
  categories: Category[]
  usageOf: (category: Category) => number
  onAdd: (name: string) => boolean
  onRemove: (category: Category) => void
}) {
  const [value, setValue] = useState('')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (onAdd(value)) setValue('')
  }

  return (
    <Section
      title={direction === 'in' ? 'Cash In categories' : 'Cash Out categories'}
      description={
        direction === 'in'
          ? 'What money coming in is filed under'
          : 'What money going out is filed under'
      }
    >
      {categories.length === 0 ? (
        <EmptyState
          icon={Tags}
          size="sm"
          title="No categories yet"
          description="Add one so entries can be grouped in reports."
        />
      ) : (
        <ul className="mb-4 flex flex-wrap gap-1.5">
          {categories.map((category) => {
            const used = usageOf(category)

            return (
              <li
                key={category.id}
                className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 py-1 pl-3 pr-1"
              >
                <span className="text-xs">{category.name}</span>
                {used > 0 && (
                  <span className="font-mono tabular text-2xs text-muted-foreground">{used}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(category)}
                  className="grid h-4 w-4 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${category.name}`}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t border-border pt-4">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={direction === 'in' ? 'Export Payment' : 'Insurance'}
          aria-label={`New ${direction === 'in' ? 'cash in' : 'cash out'} category`}
        />
        <Button type="submit" variant="success">
          <Plus />
          Add
        </Button>
      </form>
    </Section>
  )
}

// ---------------------------------------------------------------- mesh

// ---------------------------------------------------------------- data

function DataPanel() {
  const { data, exportBackup, reset, clearTransactionalData, persistent } = useAppData()
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bhuiyan-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('Backup downloaded', {
      description: 'Keep this file somewhere safe — it holds every entry.',
    })
  }

  const counts = [
    { label: 'Production entries', value: data.productionEntries.length },
    { label: 'Sales invoices', value: data.sales.length },
    { label: 'Customer transactions', value: data.customerTransactions.length },
    { label: 'Ledger transactions', value: data.transactions.length },
    { label: 'Cash closings', value: data.ledgerClosings.length },
  ]

  return (
    <div className="space-y-4">
      <Section title="Your data" description="Everything is stored in this browser on this computer.">
        <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {counts.map((entry) => (
            <div key={entry.label} className="rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
              <dt className="text-2xs uppercase tracking-wider text-muted-foreground">
                {entry.label}
              </dt>
              <dd className="mt-1 font-mono tabular text-lg font-semibold">{entry.value}</dd>
            </div>
          ))}
        </dl>

        {!persistent && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/[0.04] p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <p className="text-xs leading-relaxed text-destructive">
              <strong className="font-semibold">This browser is not saving data.</strong> Entries
              work normally but will be lost when the page reloads. This usually means a private
              window, or site data blocked in the browser settings.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={download}>
            <Download />
            Download backup
          </Button>
        </div>

        <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">
          Because the data lives in this browser, it is not shared with other computers and is lost
          if the browser's data is cleared. Download a backup regularly. When this system is moved
          onto a server, the same screens will read and write there instead — nothing you enter now
          has to be re-keyed.
        </p>
      </Section>

      <Section
        title="Clear or restore"
        description="Both actions are permanent. Download a backup first."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setConfirmClear(true)}>
            <Trash2 />
            Clear all entries
          </Button>

          <Button variant="outline" onClick={() => setConfirmReset(true)}>
            <RotateCcw />
            Restore sample data
          </Button>
        </div>

        <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground">Clear all entries</strong> removes
          production records, sales, customer transactions, ledger transactions, closings and P&amp;L
          figures, but keeps your products, mesh sizes, customers, accounts and categories — this is
          what to use before entering real data for the first time.{' '}
          <strong className="font-medium text-foreground">Restore sample data</strong> replaces
          everything with the demonstration figures.
        </p>
      </Section>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all entries?"
        description="Every production record, sale, customer transaction, ledger transaction, closing snapshot and P&L figure will be deleted. Your products, mesh sizes, customers, accounts and categories are kept. This cannot be undone."
        confirmLabel="Clear everything"
        onConfirm={() => {
          clearTransactionalData()
          setConfirmClear(false)
        }}
      >
        <dl className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs">
          {counts.map((entry) => (
            <div key={entry.label} className="flex justify-between gap-4 py-0.5">
              <dt className="text-muted-foreground">{entry.label}</dt>
              <dd className="font-mono tabular font-medium">{entry.value} will be deleted</dd>
            </div>
          ))}
        </dl>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Restore sample data?"
        description="Everything currently recorded — including any real entries — will be replaced with the demonstration figures. This cannot be undone."
        confirmLabel="Replace with sample data"
        onConfirm={() => {
          reset()
          setConfirmReset(false)
        }}
      />

      <p className="text-center text-2xs text-muted-foreground">
        Last opened {formatDateTime(new Date().toISOString())}
      </p>
    </div>
  )
}
