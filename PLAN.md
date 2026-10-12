# Glowing Diya: Project Plan

Single-business e-commerce site for flower-shaped glowing diyas (Pune). Customers build an order, the backend saves it, then WhatsApp opens with a prefilled message. The owner runs everything from an admin dashboard.

## 1. Decisions

| Area | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind + React Router | Customer site and admin share one client app (`/admin` routes) |
| Backend | Node + Express + TypeScript, REST | Zod validation, central error handler |
| Database | PostgreSQL (same engine locally and in production) | Avoids the SQLite persistence problem on free hosts |
| ORM / migrations | Prisma (or Drizzle) | Versioned migrations plus seed script |
| Auth | Email + password (argon2/bcrypt), httpOnly cookie session or JWT | No public signup; first admin created by a CLI seed script |
| Maps | Geocoding + road distance from a routing provider | **To verify:** OpenRouteService vs Google Maps free quota. API key stays server-side. |
| Hosting (verify limits before committing) | Frontend: Vercel/Netlify. API: Render/Railway. DB: Neon/Supabase | Check free-tier sleep, expiry and persistence first |
| Tests | Vitest (unit + API with supertest), Playwright smoke test later | |

Repo layout:
```
Glowing-Diya/
  client/    React site + admin
  server/    Express API, business logic
  database/  migrations, seeds
  docs/      ARCHITECTURE, DATABASE, DEPLOYMENT, ADMIN_GUIDE, DELIVERY_AND_PROFIT
  .env.example  README.md  PLAN.md
```

## 2. Inputs needed from the owner (not invented)

- Final business name and logo
- WhatsApp business number
- Real product photos (generated images are placeholders)
- Verified specs (size, material, battery, safety claims). Hidden until supplied.
- Maps provider account and API key
- Product cost per box, petrol price, bike mileage
- Delivery radius, daily capacity and blackout dates
- The 5 generated design images, saved as separate files

## 2b. Everything dynamic (no hardcoding)

Nothing business-specific lives in source code. The client loads a public `GET /api/config` on startup and renders from it. The admin edits all of it in Settings.

- **Brand:** business name, logo (upload), favicon, tagline, footer text, and the page title and meta tags.
- **Contact:** WhatsApp number, phone, address, social links, operating hours.
- **Theme:** colours (primary, accent, background), fonts and button radius, set as CSS variables per campaign.
- **Content:** hero banner (desktop and mobile images), headings, offer text, announcement bar, section visibility, FAQ, how-it-works steps, policies and terms text.
- **Commerce:** products and images, pieces per box, price tiers, stock, currency, delivery rate, radius, capacity, blackout dates, payment methods.
- **Images:** uploaded from the admin and stored in a free storage service (Cloudinary or Supabase Storage, to verify). The DB stores only the URL. The 4 generated images ship as seed defaults.
- **Fallback:** seed defaults make a fresh install usable. Missing values show neutral placeholders such as "Your Brand", never invented claims.
- **Caching:** the config is cached with a short TTL and invalidated when the admin saves.

## 3. Core business rules

- Price: 1 box = ₹150. 2+ boxes = ₹120 each. Tiers are stored in the DB and editable.
- Delivery fee = `ceil(oneWayKm) × ratePerKm` (₹3 to start, configurable). Total = subtotal + fee.
- The server is the only authority for price, distance, fee and stock.
- If geocoding fails, no fee is invented. The order goes to manual review.
- Save the order first, then open WhatsApp. Opening WhatsApp never means confirmed, and the order starts as "New enquiry".
- Idempotency key prevents duplicate orders. Order creation and stock reservation run in one transaction.
- Orders store a snapshot of prices and the delivery quote. Later config changes never rewrite them.
- Profit is revenue minus costs, kept separate for product and delivery. Gross order value is never shown as profit.

## 4. Data model

admin_users, business_settings, products, product_images, price_tiers, inventory, inventory_movements, campaigns, orders, order_items, customers/delivery details, delivery_quotes, order_status_history, payments, delivery_batches, delivery_attempts, expenses, audit_events.

Business settings are kept separate from campaign content (theme, banner, offer text). Switching festival never touches prices, delivery settings or order history.

## 5. Phases

Each phase ends with a summary: what was built, files changed, test results, blockers.

### Phase 0: Repo setup
- Create `Glowing-Diya/`, run `git init` and add the remote (or clone it), then add `.gitignore`, README and `.env.example`.
- Commit early and often, and push after each phase.

### Phase 1: Foundation and storefront
- Scaffold client and server, linting and formatting, and env handling.
- Theme tokens (gold/amber/dark brown), layout, navbar and footer.
- Homepage: hero, product highlight, price tiers with calculated savings, how it works, delivery explainer, WhatsApp CTA.
- Catalogue and product detail pages using static or seed config, with placeholder images (responsive, lazy-loaded, alt text).
- Privacy and terms pages.

### Phase 2: Backend and database
- Postgres schema and migrations, plus seed (product, tiers, settings, first campaign).
- APIs: products, price tiers, inventory, settings, public config.
- Pricing service with unit tests.
- Validation, error handling, rate limiting, helmet, CORS.
- Client switches from static data to the API.

### Phase 3: Ordering and WhatsApp
- Checkout form (no account) with live order summary.
- Geocode + distance service behind the API, with quote storage, radius check and manual-review fallback.
- `POST /orders`: revalidate, check stock, reserve in a transaction, and generate the order reference.
- Build the WhatsApp click-to-chat URL (encoded), with a fallback screen (reference, summary, retry).
- Tests for duplicate submit, stock limits, quote snapshot and "WhatsApp open ≠ confirmed".

### Phase 4: Admin dashboard
- Login, protected routes, server-side authorisation, and the first-admin script.
- Orders table (search/filter), detail view, status changes with append-only history, cancellations and failed attempts.
- Payments (manual verification), inventory with movements and low-stock alerts.
- Settings: business, delivery, prices and tiers, payment methods, costs.
- Campaigns: create, switch active, archive.
- Delivery batching (filter and group nearby orders, enter actual travel km).
- Dashboard and reports (revenue, delivery fees, costs, estimated profit, date filters).
- Audit events for sensitive changes.

### Phase 5: Testing and deployment
- Complete the required test list (pricing, delivery, orders, admin auth, reports).
- Mobile and desktop manual pass, plus accessibility and performance checks.
- Deploy DB, API and client, then verify persistence across redeploys and client-API connectivity.
- Backup/export procedure.
- Finish docs: ARCHITECTURE, DATABASE, DEPLOYMENT, ADMIN_GUIDE, DELIVERY_AND_PROFIT.

## 6. Risks

- **Free-tier limits:** API cold starts, DB expiry and map quotas. Verify before choosing, and note the limits in DEPLOYMENT.md.
- **Distance accuracy:** the address may geocode poorly. The manual-review fallback handles it.
- **Placeholder imagery:** generated images must not be shown as the real product. Swap in real photos before launch.
- **Scope creep:** no route optimisation, online payments or customer accounts in v1.

## 7. Acceptance
Matches section 18 of the master prompt: responsive site, correct pricing and delivery quotes, orders saved before WhatsApp, protected admin, preserved history, correct profit reporting, tests passing, persistent production DB, complete docs, and no paid services or unverified claims.
