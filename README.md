# BHUIYAN INDUSTRY — Accounts & Production Management

Internal management system for a mesh grading plant: daily production and
stock, client deliveries, cash and bank, monthly profit and loss, and month-end
closings that freeze.

The project is split into two independent apps:

```
backend/    Laravel 12 + MySQL — REST API, auth, business rules, persistence
frontend/   React 18 + TypeScript + Vite — the UI, talks to backend/ over HTTP
```

Each has its own README with the details that belong to it —
[backend/README.md](backend/README.md) for the API, [frontend/README.md](frontend/README.md)
for the app itself, its build modes, and its five core business rules.

---

## Running it locally

Two servers, plus MySQL:

```bash
# 1. MySQL running, backend/.env pointed at it (see backend/README.md)
cd backend
composer install
php artisan migrate
php artisan serve            # http://127.0.0.1:8000

# 2. in a second terminal
cd frontend
npm install
npm run dev                  # http://localhost:5173, talks to the API above
```

The frontend defaults to `http://localhost:8000/api` (see
`frontend/src/services/api/httpClient.ts`); override with `VITE_API_URL` in
`frontend/.env` if the backend runs elsewhere.

### Just open it, no backend

`frontend/release/BHUIYAN-INDUSTRY.html` — double-click it. A self-contained,
offline build that stores data in the browser instead of calling the API. See
`frontend/README.md` for why two builds exist and how they differ.
