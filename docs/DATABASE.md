# Database

PostgreSQL. One schema file: `database/migrations/001_init.sql`. Run `npm run migrate` (applies
any `.sql` file in that folder not yet listed in `schema_migrations`) — new changes get their own
numbered file (`002_...sql`), never edits to `001_init.sql` after it has run anywhere real.

In development, with no `DATABASE_URL` set, the server uses an embedded Postgres (PGlite) stored
at `server/.data/`, so you don't need to install Postgres locally. It is not a toy: same SQL
engine, same migrations. It is just local-only — the `DATABASE_URL` check in `server/src/config.ts`
refuses to start in production without a real, persistent database.

## Tables

| Table | What it holds |
|---|---|
| `admin_users` | Owner/staff logins. No public signup — created only by `npm run create-admin`. |
| `settings` | One JSON row per section (`brand`, `contact`, `delivery`, `payment`, `costs`, `site`, `orders`). Missing keys fall back to the defaults in `lib/settings.ts`, so a fresh database is usable immediately. |
| `campaigns` | Festival look-and-feel: theme colours, hero banner, offer text. One row has `active = true` at a time (`one_active_campaign` unique index). Never prices or delivery settings. |
| `products`, `product_images`, `price_tiers` | What's for sale. `unit_cost` (cost per box) is private, used only in reports. |
| `inventory_movements` | Every stock change as a signed delta (`add` +, `reserve`/`cancel`'s `release` ∓, `damaged`/`lost` −, `adjust` ±). **Stock on hand is `SUM(delta)` for a product — there is no separate stock column to drift out of sync.** |
| `orders`, `order_items` | The order and its line items, with price and cost **copied in at order time** (`order_items.unit_price`, `unit_cost`), not referenced from `products`/`price_tiers`. Changing a price later never changes a past order's total. |
| `delivery_quotes` | The delivery quote exactly as shown to the customer when they ordered (status, fee, distance if any) — same snapshot principle. |
| `order_status_history` | One row per status change. Append-only: nothing is ever updated or deleted here, so the full history survives however an order ends. |
| `payments` | Manually recorded payments/refunds (the admin checks the money arrived, then records it — there's no payment gateway). `orders.payment_status` is derived from these. |
| `delivery_batches`, `delivery_attempts` | A "trip" grouping several orders, its owner-entered actual km (for fuel cost), and any failed delivery attempts. |
| `expenses` | Costs not tied to one order (packaging, etc.), for reports. |
| `audit_events` | Append-only log of sensitive admin actions: who, what, when, and a JSON detail blob. Written by `lib/settings.ts`'s `audit()`. |
| `media` | Uploaded images (logo, banners, product photos), stored as bytes in the database so they survive a redeploy without needing separate file storage. Served at `/api/media/:id`. |
| `schema_migrations` | Which migration files have run. Managed by `db.ts`, not hand-edited. |

## Why stock and prices are never overwritten

Two things that look like they'd be simple "one row, update it" fields are deliberately append-only:

- **Stock** is the sum of `inventory_movements`, not a counter. A `confirmed` → `cancelled` order
  writes a `release` row rather than incrementing a stock column — so it's always possible to see
  *why* stock is what it is (which order reserved what, when something was marked damaged, etc.).
- **Order prices and the delivery quote** are copied into `order_items`/`delivery_quotes` at the
  moment the order is created. The admin can change a product's price tomorrow without silently
  changing what a customer owes for an order placed today.

## Concurrency: how an order can't oversell stock

`createOrder` (`server/src/lib/orders.ts`) runs the whole thing in one database transaction:

1. `SELECT ... FOR UPDATE` locks each product row being ordered.
2. Re-reads current stock (`SUM(delta)`) and re-checks it's enough, *inside* the lock.
3. Inserts the order, its items, and a `reserve` movement (negative delta) — still inside the
   transaction.

Two customers ordering the last box at the same instant: whichever transaction's `FOR UPDATE`
lands first blocks the other until it commits; the second transaction then re-reads stock and sees
it's gone, so it fails cleanly with "Only 0 box(es) in stock" rather than both succeeding. This is
covered by a test that fires several concurrent orders against limited stock
(`server/tests/orders.test.ts`, "cannot oversell under concurrent orders").

The `Idempotency-Key` header on `POST /api/orders` is a separate safeguard: a retried request (the
customer's connection dropped before they saw the response, so their browser retries) with the
same key returns the *same* order instead of creating a duplicate — enforced by a unique index on
`orders.idempotency_key`.

## Backup and restore

`npm run backup` (from the repo root) dumps every table to one timestamped JSON file under
`server/backups/` (not committed to git — `.gitignore`). Run it on a schedule against production;
see DEPLOYMENT.md for how to point it at the production database and automate it.

**Restoring** is deliberately manual, not a script, so a restore is never run by accident: open the
JSON file, and for each table **in the order listed in `server/src/scripts/backup.ts`** (parents
before children — e.g. `products` before `product_images`), insert its rows back with `INSERT INTO
<table> (<columns>) VALUES (...)` for each record, explicitly listing the id so references between
tables stay correct. Do this against an empty, freshly migrated database (`npm run migrate`), never
over a database that already has other data in it.

For the managed Postgres providers in DEPLOYMENT.md, prefer their own point-in-time restore first
(Neon keeps a short rolling window) — this JSON backup is the fallback once that window has passed,
or for moving to a different provider entirely.
