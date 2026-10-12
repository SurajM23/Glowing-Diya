# Architecture

## Overview

One Node/Express process serves both the API (`/api/*`) and the built React client (everything
else), from one origin. One PostgreSQL database. No other services are required to run the shop.

```
Browser
  │  all requests, same origin
  ▼
Express app (server/src/app.ts)
  ├─ /api/*        → JSON API (public + admin, cookie auth)
  └─ everything else → client/dist (static files + index.html for any unmatched path,
                        so React Router's client-side routes like /shop/:slug or
                        /admin/orders/:id work on a hard refresh or a shared link)
         │
         ▼
   PostgreSQL (Neon, or any Postgres)
```

Serving both from one origin (rather than the client on Vercel and the API on Render, as an
earlier plan draft had it) avoids two problems a two-host setup runs into: the admin login cookie
becomes a third-party cookie across sites (blocked by Safari, being phased out by Chrome), and a
static host needs its own rewrite rule to stop deep links 404ing. Same-origin avoids both for
free. See `server/src/app.ts`, the comment above the static-serving block.

In development, Vite (`client`) and the API (`server`) still run as two processes on two ports;
Vite's dev server proxies `/api/*` through to the API (`client/vite.config.ts`), so the browser
still sees one origin there too.

## Client (`client/`)

React + TypeScript + Vite + Tailwind + React Router. Two halves of one app:

- **Storefront** (`client/src/pages/`, `components/`): home, shop, product, checkout, order
  confirmation, privacy, terms. Loads `GET /api/config` once (`client/src/config.tsx`) and renders
  from it — brand, contact, delivery, payment, site content, the active campaign's theme/banner,
  and the product list. Nothing business-specific is hardcoded in these files.
- **Admin** (`client/src/admin/`): behind `/admin`, gated by `AdminLayout.tsx` which calls
  `GET /api/admin/me` and redirects to `/admin/login` on failure. Talks to the `/api/admin/*`
  routes for everything else.

`client/src/api.ts` is the one place that calls `fetch`. `VITE_API_URL` is read from it but is
normally left unset — see DEPLOYMENT.md.

## Server (`server/src/`)

- `index.ts` — entry point: opens the database, runs pending migrations, seeds starting data if
  the database is empty, then starts listening.
- `app.ts` — builds the Express app: middleware (helmet, CORS, rate limits, cookies), every route,
  the error handler, and the static-client block described above.
- `auth.ts` — issues/verifies the admin session cookie (JWT in an httpOnly cookie).
- `db.ts` — opens either a real Postgres pool (`DATABASE_URL` set) or an embedded PGlite database
  (development only, see DATABASE.md), and runs `database/migrations/*.sql` in order.
- `lib/pricing.ts` — quantity → unit price from a product's tiers. Pure functions, no I/O.
- `lib/delivery.ts` — turns an address into a delivery quote: flat fee by default, or per-km with
  a maps/geocoding provider if the flat fee is turned off (see DELIVERY_AND_PROFIT.md).
- `lib/orders.ts` — pricing + delivery → an order estimate; creates orders (stock check and
  reservation in one transaction); status transitions; the WhatsApp message/link.
- `lib/settings.ts` — the single `settings` table (one JSON blob per section: brand, contact,
  delivery, payment, costs, site, orders) with defaults merged in, so a fresh database is usable
  immediately. Also the audit log writer.
- `lib/reports.ts` — delivered-orders revenue/cost/profit for a date range.
- `lib/time.ts` — India-time helpers, since the server itself may run in UTC (see below).
- `scripts/` — one-off commands: `migrate`, `seed`, `create-admin`, `backup` (see DEPLOYMENT.md).

## Requests that change data

Every write that matters goes through one server-side path, never trusting the client for a
price, a stock count or a delivery fee:

- **Placing an order** (`POST /api/orders`) re-prices every line from the current tiers, re-quotes
  delivery, and reserves stock — all inside one database transaction (`lib/orders.ts`,
  `createOrder`). An `Idempotency-Key` header makes a retried request return the same order
  instead of creating a second one. See DATABASE.md for exactly what gets locked and why
  concurrent orders can't oversell.
- **Admin actions** (status changes, payments, inventory, settings, …) run behind
  `requireAdmin` (`auth.ts`) and write an `audit_events` row for anything sensitive
  (`lib/settings.ts`, `audit()`).

## Timezone

The business runs on India time. The server's own clock may not (Render runs in UTC). Two things
keep every date correct regardless:

- The database connection is set to `Asia/Kolkata` for its whole session (`db.ts`), so any SQL
  using `now()` or `CURRENT_DATE` — "orders today" on the dashboard, the default date on a new
  expense, report date-range filters — already means India time.
- Two places compute a date from Node's own clock instead of SQL: the date in an order reference
  (`GD-20251020-...`) and the business-hours check. Both go through `lib/time.ts` rather than
  `Date.getHours()`/`getDate()` directly, which would otherwise read the server's own (UTC) clock.

## Tests

`server/tests/*.test.ts`, Vitest + Supertest, run against a fresh in-memory PGlite database per
test file (`tests/helpers.ts`, `testApp()`) — no real Postgres needed to run them. `npm test`.
