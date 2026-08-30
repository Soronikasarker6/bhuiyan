# BHUIYAN INDUSTRY — Accounts & Production Management

Internal management system for a mesh grading plant: daily production and
stock, client deliveries, cash and bank, monthly profit and loss, and month-end
closings that freeze.

React 18 · TypeScript · Vite · Tailwind · Radix · Recharts · React Hook Form · Zod

---

## Running it

### Just open it

`release/BHUIYAN-INDUSTRY.html` — **double-click it.** One self-contained file,
no install, no server, nothing to configure. Copy it to a USB stick or a shared
drive and it works the same everywhere.

### Working on the code

```bash
npm install
npm run dev            # http://localhost:5173
npm run verify         # typecheck + tests + production build
npm run build          # dist/ — deploy to any web server
npm run build:single   # release/BHUIYAN-INDUSTRY.html — the double-clickable file
```

### Why there are two builds

Chrome and Edge refuse to load an **external** module script over `file://` —
the origin is null, so it fails CORS — which is why a normal multi-chunk build
shows a blank white page when `index.html` is double-clicked. The single-file
build inlines every script and stylesheet into the HTML; an **inline** module
has nothing to fetch, so it runs.

The same build also switches the router: clean paths (`/production`) when a
server is present, hash paths (`#/production`) when opened from a folder, since
over `file://` there is no server to answer a request for `/production`.

Both builds come from the same source and behave identically.

**Note on data:** entries are stored per-file-location by the browser. Opening
the file from a different folder is a different origin, so it starts empty —
keep it in one place, and use **Settings → Data → Download backup** before
moving it.

The system opens with **sample data** so nothing is ever a blank screen. It is
labelled as such in a banner, and cleared from **Settings → Data** before real
entries begin.

---

## The five business rules

Everything else is presentation. These five are the system.

### 1. Stock carries itself forward

```
Stock in Hand = Previous Stock + Production − Sell
```

**Previous stock is never typed.** It is recomputed from the entries for that
grade up to that date, every time. A carried-forward figure that a person types
is one that eventually disagrees with the entries behind it — usually a month
later, usually during a stock count. Here it cannot drift, and a back-dated
entry correctly shifts every row after it.

`src/utils/production.ts` · `buildMeshLedger`, `stockAsOf`

### 2. Tons come from *this* grade's bag weight

```
Ton = Bag × BagWeight ÷ 1000
```

Bag weight belongs to the mesh, not to the company: grade 800 is packed 25 kg
to the bag while grade 250 is packed 50. Every conversion in the system takes
the weight as a parameter, which is what makes a single global bag weight
impossible to write by accident.

### 3. A transfer moves money; it does not create or destroy it

A transfer is written as **two linked legs** — one out, one in, sharing a
`transferId` — in a single operation. There is no code path that can create one
without the other, and deleting either removes both. Transfers are excluded
from monthly income and expenditure, because money moving between our own
accounts is neither.

The consequence, asserted in the tests: a transfer **cannot change the combined
cash + bank total**.

`src/utils/ledger.ts` · `buildTransferLegs`, `idsToRemoveWith`, `monthMovement`

### 4. Profit is always computed

```
Gross Profit = Sales − production costs
Net Profit   = Gross Profit − office/admin − rent − interest
```

Neither is ever a field a person can type. A typed profit figure is one that
stops agreeing with the costs above it the moment either is edited.

`src/utils/pnl.ts`

### 5. A closing is a snapshot, not a saved query

Once August is closed, adding a back-dated August entry in September changes
the live figures but **cannot** change what was reported for August. The figures
are computed once, at the moment of closing, and stored. Reopening is the only
way to change them, and it is a confirmed action.

`buildProductionSnapshot` · the cash equivalent in `ClosingPage`

---

## Layout

```
src/
├── components/          shared UI — Money, StatCard, EmptyState, ConfirmDialog
│   └── ui/              primitives (button, card, table, dialog, select, …)
├── layouts/             AppLayout · Sidebar · Header · navigation
├── pages/               one file per route
├── features/
│   ├── dashboard/       chart, balance summary
│   ├── production/      entry form, mesh ledger, mesh manager, client history
│   ├── pnl/             month editor
│   ├── ledger/          transaction form, register
│   └── reports/         the print document
├── hooks/               useAppData — the one state layer
├── services/            storageService · repository
├── types/               the domain
├── utils/               production · ledger · pnl · format  ← all the maths
└── data/                sample data
```

**Calculations live in `utils/` and nowhere else.** No component computes a
balance, a running stock or a profit; they call a pure function and render what
comes back. That is what makes the rules above testable, and it is why the
tests read like arithmetic rather than like UI automation.

---

## Persistence

Everything goes through `services/storageService.ts` — the only module that
touches storage — with `repository.ts` above it speaking in domain terms.
Components call `load()` and `save()`; they do not know a key name and they do
not know the store is currently a browser.

**Moving to a REST backend is a change to those two files.** Nothing else in
the application has to change.

Writes are not silent. `localStorage` throws in a private window, when the quota
is full, and when a browser blocks site data. When that happens the entry still
appears on screen — state updates first, persistence second — and a toast says
plainly that it was not saved. A factory office that believes its entries are
safe when they are not is worse off than one that is told.

---

## Verification

```bash
npm run verify
```

- **`tsc --noEmit`** — strict, with `noUnusedLocals` and `noUnusedParameters`.
- **46 unit tests** over the five rules above, including the cases that are
  easy to get wrong: back-dated entries shifting later rows, a mesh whose bag
  weight differs from its neighbour's, a filtered register still showing a true
  opening balance, February's month end, a transfer leaving the combined total
  untouched, and a closing snapshot surviving a later back-dated entry.
- **`vite build`** — production bundle, code-split per route.
- The single-file build is verified by opening it over `file://` in a real
  browser and checking that it renders, navigates, survives a reload on a
  sub-route, and persists an entry across that reload.

---

## Printing

Reports print from a **dedicated document** (`features/reports/PrintSheet.tsx`),
not by hiding parts of the screen with CSS. What comes out of the printer is a
ruled black-on-white table with the company header, the report name, the date
range and a generated-on footer — a document that can be filed and signed,
rather than a screenshot of a web page with the navigation removed.

Every report also exports as CSV from the same payload, so print and export can
never disagree about the numbers.

---

## Notes for whoever picks this up next

- **Colour carries meaning.** Green is a figure going the right way, maroon one
  going the wrong way, brass is secondary information. Nothing is coloured
  for decoration.
- **Every figure is set in tabular numerals.** In a proportional font the
  decimal points wander and a column of money stops being scannable, which is
  the entire purpose of a column of money.
- **Numbers are grouped South Asian style** — 12,34,567 — and large figures are
  reported in lakh and crore. `en-IN`, not `en-US`.
- Retiring a mesh, removing a category and renaming an account all leave history
  exactly as it was. Configuration changes never rewrite a past figure.
