# BHUIYAN INDUSTRY — Accounts & Production Management

Internal management system for a mesh grading plant: daily production and
stock, client deliveries, cash and bank, monthly profit and loss, and month-end
closings that freeze.

The project is split into two independent apps:

```
backend/    Laravel 12 + MySQL — REST API, auth, roles/permissions, business rules, persistence
frontend/   React 18 + TypeScript + Vite — the UI, talks to backend/ over HTTP
```

Each has its own README with the details that belong to it —
[backend/README.md](backend/README.md) is the stock Laravel readme (framework
links only); [frontend/README.md](frontend/README.md) documents the app
itself, its two build modes, and its five core business rules. **This file**
covers everything needed to take a fresh clone to a running app.

---

## Setup & Installation

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| PHP | 8.2+ | with the extensions Laravel 12 needs — `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`, `bcmath` (all on by default in XAMPP/most PHP installs) |
| Composer | 2.x | installs the backend's PHP dependencies |
| Node.js | 20+ | and npm — installs the frontend's dependencies |
| MySQL | 8.x (or MariaDB) | running and reachable; the backend does **not** create the database for you |

### 1. Backend — environment configuration

```bash
cd backend
cp .env.example .env      # Windows: copy .env.example .env
php artisan key:generate  # required once — .env.example ships with APP_KEY empty
```

Then open `backend/.env` and check/change:

- `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` — must match
  a MySQL server you actually have running (defaults assume `127.0.0.1:3306`,
  user `root`, no password, database `bhuiyan_industry`).
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` — the one login the seeder
  creates (see **Required Seeders** below). Change the password before this
  is used for anything real.
- `FRONTEND_URL` — comma-separated list of origins allowed to call the API
  (CORS). Defaults to `http://localhost:5173`, the Vite dev server's default
  port — add more, comma-separated, if the frontend runs elsewhere.

### 2. Database setup

Create the database named in `DB_DATABASE` — Laravel migrates tables, but
never creates the database itself:

```bash
mysql -u root -e "CREATE DATABASE bhuiyan_industry CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

### 3. Backend — install, migrate, seed, run

```bash
composer install         # PHP dependencies (from backend/)
php artisan migrate       # creates every table: users, sessions, cache, jobs,
                           # personal_access_tokens (Sanctum), permission tables
                           # (Spatie), and every domain table (products, mesh
                           # sizes, accounts, categories, shipments, production,
                           # sales, ledgers, closings, ...). One-time; safe to
                           # re-run (no-ops if already migrated).
php artisan db:seed       # REQUIRED — see "Required Seeders" below
php artisan serve         # http://127.0.0.1:8000
```

### Required Seeders

`php artisan db:seed` runs `DatabaseSeeder`, which calls these **in this
exact order** — all required, all safe to re-run (every one uses
`firstOrCreate`, so re-seeding never duplicates rows):

| # | Seeder | Creates | Depends on |
|---|---|---|---|
| 1 | `ProductSeeder` | 3 products: Vietnam White Limestone (VWL), Oman Red Limestone (ORL), Grey Limestone (GRL) | — |
| 2 | `MeshSizeSeeder` | 5 mesh grades: 250, 400, 500, 800, 1000 (50 kg/bag) | — |
| 3 | `UnitOfMeasureSeeder` | Ton, KG, Bag, Piece | — |
| 4 | `AccountSeeder` | the system **Cash** account + 4 bank accounts (UCB, Dutch Bangla, South East, Janata) | — |
| 5 | `CategorySeeder` | income/expense categories for the cash & bank ledger | — |
| 6 | `PermissionSeeder` | every permission in `App\Support\Permissions` | — |
| 7 | `RoleSeeder` | **Admin** (all permissions), **Manager** (all but Settings/Users/Roles), **Staff** (view+create only, no Closing/Settings/Users/Roles) | needs permissions to exist first (step 6) |
| 8 | `AdminUserSeeder` | the one login user, from `ADMIN_NAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env`, assigned the **Admin** role | needs the Admin role to exist first (step 7) |

Run once, right after the first `migrate`. Running `php artisan db:seed`
again later (e.g. after a fresh `migrate:fresh`) is safe and just re-applies
the same idempotent seed.

**Optional — sample dataset:**

```bash
php artisan db:seed --class="Database\Seeders\DemoDataSeeder"
```

Not run by default. Re-seeds the 5 catalog seeders (1–5 above, idempotent),
then adds a realistic set of demo shipments, production entries, wastage,
customers, sales and cash/bank transactions — ported from the frontend's old
sample data — so the app isn't blank while developing. Skip this in
production; it's for local development only.

### 4. Frontend — install & run

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

No `.env` is required — the frontend defaults to `http://localhost:8000/api`
(see `frontend/src/services/api/httpClient.ts`). If the backend runs on a
different host/port, create `frontend/.env` with:

```
VITE_API_URL=http://your-backend-host:port/api
```

### Cache/config clearing

Not needed on a fresh install — nothing is cached by default with
`APP_ENV=local`. If you change `backend/.env` (DB credentials, `FRONTEND_URL`,
etc.) after having run `php artisan config:cache` at some point, clear it so
the new values actually take effect:

```bash
php artisan config:clear
```

### Build / production commands

```bash
# frontend/ — pick one:
npm run build          # dist/         — deploy to any web server
npm run build:single   # release/BHUIYAN-INDUSTRY.html — offline, double-clickable
npm run verify          # typecheck + unit tests + production build, all in one

# backend/ — for a manual (non-Docker) production deploy:
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan db:seed --force   # safe to repeat — every seeder is idempotent
```

The Docker/Render deploy path (`backend/Dockerfile` + `backend/docker/entrypoint.sh`)
already runs `migrate --force` and `db:seed --force` on every container boot —
nothing extra to run by hand there; see `render.yaml` for the required env vars.

`backend/package.json`, `backend/vite.config.js` and `backend/resources/`
are Laravel's default scaffolding for the built-in Blade welcome page at `/`
— unrelated to this product (the real UI is `frontend/`). No need to `npm
install`/`npm run build` inside `backend/` unless you specifically want that
cosmetic default page styled.

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `SQLSTATE[HY000] [1049] Unknown database` on `migrate` | The database named in `DB_DATABASE` doesn't exist yet — see **Database setup**. |
| `No application encryption key has been specified` | `.env` has an empty `APP_KEY` — run `php artisan key:generate`. |
| Frontend calls fail with a CORS error in the browser console | The origin the frontend is served from isn't in `FRONTEND_URL` (backend `.env`) — add it, comma-separated, then `php artisan config:clear` if config was cached. |
| Login returns 401/422 with the seeded admin credentials | `php artisan db:seed` was never run, or `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `.env` don't match what you're typing — the seeder only creates the user once, from whatever `.env` held *at seed time*. |
| Double-clicked `dist/index.html` shows a blank page | Expected — Chrome/Edge block external module scripts over `file://`. Use `npm run dev`, serve `dist/` from a real web server, or use the single-file build instead (see below). |
| Dashboard is empty after a fresh seed | Expected — the required seeders only create catalog/config data and the admin login, no transactions. Run the optional `DemoDataSeeder` for sample data, or start entering real data. |

---

## Just open it, no backend

`frontend/release/BHUIYAN-INDUSTRY.html` — double-click it. A self-contained,
offline build that stores data in the browser instead of calling the API. See
`frontend/README.md` for why two builds exist and how they differ.
