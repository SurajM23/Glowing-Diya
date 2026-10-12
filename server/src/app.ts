import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z, ZodError } from 'zod';
import type { Db } from './db';
import { env } from './config';
import { checkPassword, clearSession, issueSession, requireAdmin } from './auth';
import { DEFAULT_SETTINGS, SETTING_KEYS, audit, getSettings, saveSetting, type SettingKey, type Settings } from './lib/settings';
import { defaultRouter, type Router } from './lib/delivery';
import {
  HttpError, ORDER_STATUSES, changeStatus, createOrder, estimate, getOrder, listProducts,
  recordFailedAttempt, recordPayment, whatsappLink,
} from './lib/orders';
import { buildReport } from './lib/reports';

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

const id = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Not found');
  return n;
};

// ---------- validation ----------

const phone = z.string().trim().regex(/^[+\d][\d\s-]{8,16}$/, 'Enter a valid phone number');
const pin = z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit PIN code');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const items = z.array(z.object({ productId: z.number().int().positive(), quantity: z.number() })).min(1).max(20);

const estimateBody = z.object({
  items,
  address: z.string().trim().min(5).max(300).optional(),
  pin: pin.optional(),
  preferredDate: isoDate.optional(),
});

const orderBody = z.object({
  items,
  customerName: z.string().trim().min(2).max(100),
  phone,
  address: z.string().trim().min(5).max(300),
  pin,
  landmark: z.string().trim().max(150).optional(),
  preferredDate: isoDate.optional(),
  preferredTime: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(500).optional(),
});

const nullableNum = z.number().min(0).nullable();
const settingSchemas: Record<SettingKey, z.ZodTypeAny> = {
  brand: z.object({ name: z.string().max(100), tagline: z.string().max(200), logoUrl: z.string().max(500), faviconUrl: z.string().max(500), ownerName: z.string().max(100) }),
  contact: z.object({
    whatsapp: z.string().max(20), phone: z.string().max(20), email: z.string().max(100), address: z.string().max(300), pin: z.string().max(10),
    openTime: z.string().regex(/^\d{2}:\d{2}$/), closeTime: z.string().regex(/^\d{2}:\d{2}$/), instagram: z.string().max(200), facebook: z.string().max(200),
  }),
  delivery: z.object({
    flatFee: nullableNum, ratePerKm: z.number().min(0), roundUpKm: z.boolean(), maxRadiusKm: nullableNum, dailyCapacity: nullableNum, promiseHours: z.number().int().min(1),
    blackoutDates: z.array(isoDate), baseLat: z.number().nullable(), baseLng: z.number().nullable(), freeWithinBasePin: z.boolean(),
  }),
  payment: z.object({ upi: z.boolean(), cash: z.boolean(), upiId: z.string().max(100), upiNote: z.string().max(300) }),
  costs: z.object({ petrolPerLitre: z.number().min(0), bikeMileageKmPerLitre: z.number().min(0) }),
  site: z.object({
    announcement: z.string().max(300), currency: z.string().max(5),
    showSections: z.object({ howItWorks: z.boolean(), delivery: z.boolean(), gallery: z.boolean(), faq: z.boolean() }),
    howItWorks: z.array(z.object({ title: z.string().max(100), text: z.string().max(300) })).max(10),
    faq: z.array(z.object({ q: z.string().max(200), a: z.string().max(1000) })).max(30),
    footerText: z.string().max(300), whatsappGreeting: z.string().max(300), privacyText: z.string().max(5000), termsText: z.string().max(5000),
  }),
  orders: z.object({ refPrefix: z.string().regex(/^[A-Z0-9]{1,6}$/) }),
};

// ---------- app ----------

export interface AppOptions { router?: Router | null; rateLimit?: boolean }

export function createApp(db: Db, opts: AppOptions = {}) {
  const app = express();
  const router = opts.router === undefined ? defaultRouter() : opts.router;
  const useLimits = opts.rateLimit ?? true;

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());

  // Settings are read on every page load; keep them for a short time and drop on save.
  let cache: { at: number; value: Settings } | null = null;
  const settings = async () => {
    if (cache && Date.now() - cache.at < 15_000) return cache.value;
    const value = await getSettings(db.q);
    cache = { at: Date.now(), value };
    return value;
  };

  const limit = (windowMs: number, max: number) =>
    useLimits ? rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please try again shortly.' } })
      : (_q: Request, _s: Response, n: NextFunction) => n();

  const api = express.Router();
  app.use('/api', api);
  api.use(limit(60_000, 240));

  api.get('/health', wrap(async (_req, res) => {
    await db.q('SELECT 1');
    res.json({ ok: true });
  }));

  // ----- public -----

  api.get('/config', wrap(async (_req, res) => {
    const s = await settings();
    const [campaign] = await db.q<any>('SELECT id, name, festival, theme, hero, promo_heading, promo_description, offer_text FROM campaigns WHERE active LIMIT 1');
    const products = await listProducts(db.q, { activeOnly: true });
    const { costs: _costs, orders: _orders, ...publicSettings } = s;
    const { baseLat: _a, baseLng: _b, ...delivery } = s.delivery;
    res.json({
      ...publicSettings,
      delivery,
      campaign: campaign ?? null,
      products: products.map(publicProduct),
    });
  }));

  api.get('/products', wrap(async (_req, res) => {
    res.json((await listProducts(db.q, { activeOnly: true })).map(publicProduct));
  }));

  api.get('/products/:slug', wrap(async (req, res) => {
    const [p] = await listProducts(db.q, { activeOnly: true, slug: req.params.slug });
    if (!p) throw new HttpError(404, 'Product not found');
    res.json(publicProduct(p));
  }));

  api.get('/media/:id', wrap(async (req, res) => {
    const [m] = await db.q<any>('SELECT mime, data FROM media WHERE id = $1', [id(req.params.id)]);
    if (!m) throw new HttpError(404, 'Not found');
    res.set({ 'Content-Type': m.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' });
    res.send(Buffer.from(m.data));
  }));

  api.post('/orders/estimate', limit(60_000, 30), wrap(async (req, res) => {
    const body = estimateBody.parse(req.body);
    res.json(await estimate(db.q, await settings(), body, router));
  }));

  api.post('/orders', limit(60_000, 10), wrap(async (req, res) => {
    const key = String(req.get('Idempotency-Key') ?? '');
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw new HttpError(400, 'Missing or invalid Idempotency-Key header');
    const body = orderBody.parse(req.body);
    const s = await settings();
    const { order, duplicate } = await createOrder(db, s, body, key, router);
    res.status(duplicate ? 200 : 201).json({ order: publicOrder(order), duplicate, whatsappUrl: whatsappLink(s, order) });
  }));

  // ----- admin auth -----

  const admin = express.Router();
  api.use('/admin', admin);

  admin.post('/login', limit(15 * 60_000, 10), wrap(async (req, res) => {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(req.body);
    const [u] = await db.q<any>('SELECT id, email, password_hash FROM admin_users WHERE lower(email) = lower($1)', [email]);
    // Same message and a real hash comparison either way, so the response does not reveal which emails exist
    const ok = await checkPassword(password, u?.password_hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
    if (!u || !ok) throw new HttpError(401, 'Incorrect email or password');
    issueSession(res, u);
    await audit(db.q, u.email, 'admin.login', 'admin_user', u.id);
    res.json({ email: u.email });
  }));

  admin.post('/logout', (_req, res) => {
    clearSession(res);
    res.json({ ok: true });
  });

  admin.use(requireAdmin);
  const actor = (req: Request) => req.admin!.email;

  admin.get('/me', (req, res) => { res.json({ email: req.admin!.email }); });

  // Counts for the dashboard and navigation badges
  admin.get('/summary', wrap(async (_req, res) => {
    const byStatus = await db.q<{ status: string; n: number }>('SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status');
    const [flags] = await db.q<any>(
      `SELECT COUNT(*) FILTER (WHERE needs_review AND status NOT IN ('delivered','cancelled'))::int AS needs_review,
              COUNT(*) FILTER (WHERE status = 'delivered' AND payment_status NOT IN ('paid','refunded'))::int AS delivered_unpaid,
              COUNT(*) FILTER (WHERE status IN ('confirmed','preparing','ready_for_delivery') AND batch_id IS NULL)::int AS awaiting_trip,
              COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today_orders,
              COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('day', now()) AND status <> 'cancelled'), 0)::int AS today_value
       FROM orders`,
    );
    const products = await listProducts(db.q);
    res.json({
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
      needsReview: flags.needs_review,
      deliveredUnpaid: flags.delivered_unpaid,
      awaitingTrip: flags.awaiting_trip,
      today: { orders: flags.today_orders, value: flags.today_value },
      stock: products.map((p: any) => ({ id: p.id, name: p.name, stock: p.stock, threshold: p.low_stock_threshold, low: p.stock <= p.low_stock_threshold })),
    });
  }));

  // ----- settings -----

  admin.get('/settings', wrap(async (_req, res) => { res.json(await getSettings(db.q)); }));

  admin.put('/settings/:key', wrap(async (req, res) => {
    const key = req.params.key as SettingKey;
    if (!SETTING_KEYS.includes(key)) throw new HttpError(404, 'Unknown setting');
    const value = settingSchemas[key].parse(req.body);
    await saveSetting(db.q, key, value);
    cache = null;
    await audit(db.q, actor(req), 'settings.update', 'settings', key, { value });
    res.json(value);
  }));

  admin.get('/settings-defaults', (_req, res) => { res.json(DEFAULT_SETTINGS); });

  // ----- orders -----

  admin.get('/orders', wrap(async (req, res) => {
    const where: string[] = [];
    const p: unknown[] = [];
    const { status, q, from, to, review, payment } = req.query as Record<string, string | undefined>;
    if (status) { p.push(status); where.push(`o.status = $${p.length}`); }
    if (payment) { p.push(payment); where.push(`o.payment_status = $${p.length}`); }
    if (review === '1') where.push('o.needs_review');
    if (q) { p.push(`%${q.toLowerCase()}%`); where.push(`(lower(o.ref) LIKE $${p.length} OR lower(o.customer_name) LIKE $${p.length} OR o.phone LIKE $${p.length} OR o.pin LIKE $${p.length})`); }
    if (from) { p.push(from); where.push(`o.created_at >= $${p.length}::date`); }
    if (to) { p.push(to); where.push(`o.created_at < ($${p.length}::date + 1)`); }
    const rows = await db.q(
      `SELECT o.*, (SELECT COALESCE(SUM(quantity),0)::int FROM order_items i WHERE i.order_id = o.id) AS boxes
       FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY o.created_at DESC, o.id DESC LIMIT 500`,
      p,
    );
    res.json(rows);
  }));

  admin.get('/orders/:id', wrap(async (req, res) => {
    const o = await getOrder(db.q, id(req.params.id));
    if (!o) throw new HttpError(404, 'Order not found');
    res.json(o);
  }));

  admin.post('/orders/:id/status', wrap(async (req, res) => {
    const { status, note } = z.object({ status: z.enum(ORDER_STATUSES), note: z.string().max(500).optional() }).parse(req.body);
    await changeStatus(db, id(req.params.id), status, actor(req), note ?? '');
    res.json(await getOrder(db.q, id(req.params.id)));
  }));

  admin.post('/orders/:id/failed-attempt', wrap(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().min(1).max(300) }).parse(req.body);
    await recordFailedAttempt(db, id(req.params.id), reason, actor(req));
    res.json(await getOrder(db.q, id(req.params.id)));
  }));

  admin.post('/orders/:id/payments', wrap(async (req, res) => {
    const b = z.object({
      kind: z.enum(['payment', 'refund']).default('payment'),
      method: z.string().trim().min(1).max(40),
      amount: z.number().int().positive(),
      reference: z.string().max(100).optional(),
    }).parse(req.body);
    await recordPayment(db, id(req.params.id), b, actor(req));
    res.json(await getOrder(db.q, id(req.params.id)));
  }));

  admin.patch('/orders/:id', wrap(async (req, res) => {
    const b = z.object({
      internalNotes: z.string().max(1000).optional(),
      needsReview: z.boolean().optional(),
      deliveryFee: z.number().int().min(0).optional(),
    }).parse(req.body);
    const oid = id(req.params.id);
    await db.tx(async (q) => {
      const [o] = await q<any>('SELECT id, subtotal, delivery_fee FROM orders WHERE id = $1 FOR UPDATE', [oid]);
      if (!o) throw new HttpError(404, 'Order not found');
      if (b.internalNotes !== undefined) await q('UPDATE orders SET internal_notes = $2 WHERE id = $1', [oid, b.internalNotes]);
      if (b.needsReview !== undefined) await q('UPDATE orders SET needs_review = $2 WHERE id = $1', [oid, b.needsReview]);
      if (b.deliveryFee !== undefined) {
        // Manual-review orders get their fee set by the owner. The original quote row stays untouched.
        await q('UPDATE orders SET delivery_fee = $2, total = subtotal + $2, needs_review = FALSE WHERE id = $1', [oid, b.deliveryFee]);
        await audit(q, actor(req), 'order.delivery_fee', 'order', oid, { from: o.delivery_fee, to: b.deliveryFee });
      }
    });
    res.json(await getOrder(db.q, oid));
  }));

  // ----- products & inventory -----

  admin.get('/products', wrap(async (_req, res) => { res.json(await listProducts(db.q)); }));

  const productBody = z.object({
    name: z.string().trim().min(1).max(150),
    slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(80),
    description: z.string().max(2000),
    piecesPerBox: z.number().int().min(1),
    unitCost: z.number().int().min(0),
    lowStockThreshold: z.number().int().min(0),
    specs: z.array(z.object({ label: z.string().max(60), value: z.string().max(200) })).max(20),
    active: z.boolean(),
  });

  admin.post('/products', wrap(async (req, res) => {
    const b = productBody.partial({ description: true, piecesPerBox: true, unitCost: true, lowStockThreshold: true, specs: true, active: true })
      .parse(req.body);
    const [p] = await db.q<any>(
      `INSERT INTO products(slug, name, description, pieces_per_box, unit_cost, low_stock_threshold, specs, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING id`,
      [b.slug, b.name, b.description ?? '', b.piecesPerBox ?? 1, b.unitCost ?? 0, b.lowStockThreshold ?? 5, JSON.stringify(b.specs ?? []), b.active ?? false],
    );
    await db.q('INSERT INTO price_tiers(product_id, min_qty, unit_price) VALUES ($1,1,0)', [p.id]);
    await audit(db.q, actor(req), 'product.create', 'product', p.id, { name: b.name });
    res.status(201).json((await listProducts(db.q)).find((x: any) => x.id === p.id));
  }));

  admin.put('/products/:id', wrap(async (req, res) => {
    const b = productBody.parse(req.body);
    const pid = id(req.params.id);
    const rows = await db.q(
      `UPDATE products SET name=$2, slug=$3, description=$4, pieces_per_box=$5, unit_cost=$6, low_stock_threshold=$7, specs=$8::jsonb, active=$9
       WHERE id=$1 RETURNING id`,
      [pid, b.name, b.slug, b.description, b.piecesPerBox, b.unitCost, b.lowStockThreshold, JSON.stringify(b.specs), b.active],
    );
    if (!rows.length) throw new HttpError(404, 'Product not found');
    await audit(db.q, actor(req), 'product.update', 'product', pid, b);
    res.json((await listProducts(db.q)).find((x: any) => x.id === pid));
  }));

  admin.put('/products/:id/tiers', wrap(async (req, res) => {
    const tiers = z.array(z.object({ minQty: z.number().int().min(1), unitPrice: z.number().int().min(0) })).min(1).max(10).parse(req.body);
    if (new Set(tiers.map((t) => t.minQty)).size !== tiers.length) throw new HttpError(400, 'Each tier needs a different minimum quantity');
    if (!tiers.some((t) => t.minQty === 1)) throw new HttpError(400, 'A tier starting at 1 box is required');
    const pid = id(req.params.id);
    await db.tx(async (q) => {
      await q('DELETE FROM price_tiers WHERE product_id = $1', [pid]);
      for (const t of tiers) await q('INSERT INTO price_tiers(product_id, min_qty, unit_price) VALUES ($1,$2,$3)', [pid, t.minQty, t.unitPrice]);
      await audit(q, actor(req), 'product.tiers', 'product', pid, { tiers });
    });
    res.json((await listProducts(db.q)).find((x: any) => x.id === pid));
  }));

  admin.post('/products/:id/images', wrap(async (req, res) => {
    const b = z.object({ url: z.string().min(1).max(500), alt: z.string().max(200) }).parse(req.body);
    const pid = id(req.params.id);
    await db.q(
      'INSERT INTO product_images(product_id, url, alt, sort) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort),-1)+1 FROM product_images WHERE product_id=$1))',
      [pid, b.url, b.alt],
    );
    res.status(201).json((await listProducts(db.q)).find((x: any) => x.id === pid));
  }));

  admin.delete('/products/:id/images/:imageId', wrap(async (req, res) => {
    await db.q('DELETE FROM product_images WHERE id = $1 AND product_id = $2', [id(req.params.imageId), id(req.params.id)]);
    res.json({ ok: true });
  }));

  admin.get('/inventory', wrap(async (_req, res) => {
    const products = await listProducts(db.q);
    const movements = await db.q('SELECT m.*, p.name AS product_name FROM inventory_movements m JOIN products p ON p.id = m.product_id ORDER BY m.id DESC LIMIT 200');
    res.json({
      products: products.map((p: any) => ({ id: p.id, name: p.name, stock: p.stock, lowStockThreshold: p.low_stock_threshold, low: p.stock <= p.low_stock_threshold })),
      movements,
    });
  }));

  admin.post('/inventory', wrap(async (req, res) => {
    const b = z.object({
      productId: z.number().int().positive(),
      kind: z.enum(['add', 'damaged', 'lost', 'adjust']),
      quantity: z.number().int(),
      note: z.string().max(300).optional(),
    }).parse(req.body);
    if (b.kind === 'adjust' ? b.quantity === 0 : b.quantity <= 0) throw new HttpError(400, 'Enter a valid quantity');
    const delta = b.kind === 'damaged' || b.kind === 'lost' ? -b.quantity : b.quantity;
    await db.tx(async (q) => {
      await q('SELECT id FROM products WHERE id = $1 FOR UPDATE', [b.productId]);
      const [{ stock }] = await q<{ stock: number }>('SELECT COALESCE(SUM(delta),0)::int AS stock FROM inventory_movements WHERE product_id = $1', [b.productId]);
      if (stock + delta < 0) throw new HttpError(409, `Stock cannot go below zero (currently ${stock})`);
      await q('INSERT INTO inventory_movements(product_id, delta, kind, note, actor) VALUES ($1,$2,$3,$4,$5)', [b.productId, delta, b.kind, b.note ?? '', actor(req)]);
      await audit(q, actor(req), 'inventory.move', 'product', b.productId, { kind: b.kind, delta });
    });
    res.status(201).json({ ok: true });
  }));

  // ----- campaigns -----

  admin.get('/campaigns', wrap(async (_req, res) => { res.json(await db.q('SELECT * FROM campaigns ORDER BY archived, id DESC')); }));

  const campaignBody = z.object({
    name: z.string().trim().min(1).max(100),
    festival: z.string().max(100).default(''),
    startDate: isoDate.nullable().optional(),
    endDate: isoDate.nullable().optional(),
    theme: z.object({ primary: z.string(), accent: z.string(), dark: z.string(), bg: z.string(), text: z.string() }),
    hero: z.object({ desktopImage: z.string(), mobileImage: z.string(), heading: z.string().max(150), subheading: z.string().max(250), ctaText: z.string().max(40) }),
    promoHeading: z.string().max(150).default(''),
    promoDescription: z.string().max(500).default(''),
    offerText: z.string().max(200).default(''),
  });
  const hex = /^#[0-9a-fA-F]{6}$/;
  const checkTheme = (t: Record<string, string>) => {
    for (const v of Object.values(t)) if (!hex.test(v)) throw new HttpError(400, 'Theme colours must be hex values like #E9A820');
  };

  admin.post('/campaigns', wrap(async (req, res) => {
    const b = campaignBody.parse(req.body);
    checkTheme(b.theme);
    const [c] = await db.q<any>(
      `INSERT INTO campaigns(name, festival, start_date, end_date, theme, hero, promo_heading, promo_description, offer_text)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9) RETURNING *`,
      [b.name, b.festival, b.startDate ?? null, b.endDate ?? null, JSON.stringify(b.theme), JSON.stringify(b.hero), b.promoHeading, b.promoDescription, b.offerText],
    );
    await audit(db.q, actor(req), 'campaign.create', 'campaign', c.id, { name: b.name });
    res.status(201).json(c);
  }));

  admin.put('/campaigns/:id', wrap(async (req, res) => {
    const b = campaignBody.parse(req.body);
    checkTheme(b.theme);
    const [c] = await db.q<any>(
      `UPDATE campaigns SET name=$2, festival=$3, start_date=$4, end_date=$5, theme=$6::jsonb, hero=$7::jsonb,
         promo_heading=$8, promo_description=$9, offer_text=$10 WHERE id=$1 RETURNING *`,
      [id(req.params.id), b.name, b.festival, b.startDate ?? null, b.endDate ?? null, JSON.stringify(b.theme), JSON.stringify(b.hero), b.promoHeading, b.promoDescription, b.offerText],
    );
    if (!c) throw new HttpError(404, 'Campaign not found');
    await audit(db.q, actor(req), 'campaign.update', 'campaign', c.id, { name: b.name });
    res.json(c);
  }));

  admin.post('/campaigns/:id/activate', wrap(async (req, res) => {
    const cid = id(req.params.id);
    await db.tx(async (q) => {
      const [c] = await q<any>('SELECT id, archived FROM campaigns WHERE id = $1', [cid]);
      if (!c) throw new HttpError(404, 'Campaign not found');
      if (c.archived) throw new HttpError(409, 'Restore the campaign before activating it');
      await q('UPDATE campaigns SET active = FALSE WHERE active');
      await q('UPDATE campaigns SET active = TRUE WHERE id = $1', [cid]);
      await audit(q, actor(req), 'campaign.activate', 'campaign', cid);
    });
    res.json({ ok: true });
  }));

  admin.post('/campaigns/:id/archive', wrap(async (req, res) => {
    const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
    const cid = id(req.params.id);
    const [c] = await db.q<any>('UPDATE campaigns SET archived = $2, active = CASE WHEN $2 THEN FALSE ELSE active END WHERE id = $1 RETURNING *', [cid, archived]);
    if (!c) throw new HttpError(404, 'Campaign not found');
    await audit(db.q, actor(req), archived ? 'campaign.archive' : 'campaign.restore', 'campaign', cid);
    res.json(c);
  }));

  // ----- delivery batches -----

  admin.get('/batches', wrap(async (_req, res) => {
    res.json(await db.q(
      `SELECT b.*, COALESCE(json_agg(json_build_object('id', o.id, 'ref', o.ref, 'customer_name', o.customer_name, 'pin', o.pin, 'status', o.status)) FILTER (WHERE o.id IS NOT NULL), '[]') AS orders
       FROM delivery_batches b LEFT JOIN orders o ON o.batch_id = b.id GROUP BY b.id ORDER BY b.id DESC LIMIT 100`,
    ));
  }));

  // Orders ready to go out, grouped by PIN so nearby addresses can share a trip
  admin.get('/batches/candidates', wrap(async (_req, res) => {
    const rows = await db.q<any>(
      `SELECT id, ref, customer_name, address, pin, total FROM orders WHERE status IN ('confirmed','preparing','ready_for_delivery') AND batch_id IS NULL ORDER BY pin, id`,
    );
    const groups = new Map<string, any[]>();
    for (const r of rows) groups.set(r.pin, [...(groups.get(r.pin) ?? []), r]);
    res.json([...groups].map(([pinCode, orders]) => ({ pin: pinCode, orders })));
  }));

  admin.post('/batches', wrap(async (req, res) => {
    const b = z.object({ name: z.string().trim().min(1).max(100), plannedDate: isoDate.optional(), orderIds: z.array(z.number().int().positive()).max(100) }).parse(req.body);
    const batchId = await db.tx(async (q) => {
      const [row] = await q<{ id: number }>('INSERT INTO delivery_batches(name, planned_date) VALUES ($1,$2) RETURNING id', [b.name, b.plannedDate ?? null]);
      for (const oid of b.orderIds) await q('UPDATE orders SET batch_id = $2 WHERE id = $1 AND batch_id IS NULL', [oid, row.id]);
      await audit(q, actor(req), 'batch.create', 'batch', row.id, { orderIds: b.orderIds });
      return row.id;
    });
    res.status(201).json({ id: batchId });
  }));

  admin.patch('/batches/:id', wrap(async (req, res) => {
    const b = z.object({ actualKm: z.number().min(0).nullable().optional(), note: z.string().max(300).optional(), name: z.string().max(100).optional() }).parse(req.body);
    const bid = id(req.params.id);
    if (b.actualKm !== undefined) await db.q('UPDATE delivery_batches SET actual_km = $2 WHERE id = $1', [bid, b.actualKm]);
    if (b.note !== undefined) await db.q('UPDATE delivery_batches SET note = $2 WHERE id = $1', [bid, b.note]);
    if (b.name) await db.q('UPDATE delivery_batches SET name = $2 WHERE id = $1', [bid, b.name]);
    await audit(db.q, actor(req), 'batch.update', 'batch', bid, b);
    res.json({ ok: true });
  }));

  // ----- expenses & reports -----

  admin.get('/expenses', wrap(async (_req, res) => { res.json(await db.q('SELECT * FROM expenses ORDER BY spent_on DESC, id DESC LIMIT 200')); }));

  admin.post('/expenses', wrap(async (req, res) => {
    const b = z.object({ description: z.string().trim().min(1).max(200), amount: z.number().int().min(0), spentOn: isoDate.optional() }).parse(req.body);
    const [e] = await db.q('INSERT INTO expenses(description, amount, spent_on) VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE)) RETURNING *', [b.description, b.amount, b.spentOn ?? null]);
    await audit(db.q, actor(req), 'expense.create', 'expense', (e as any).id, b);
    res.status(201).json(e);
  }));

  admin.delete('/expenses/:id', wrap(async (req, res) => {
    await db.q('DELETE FROM expenses WHERE id = $1', [id(req.params.id)]);
    await audit(db.q, actor(req), 'expense.delete', 'expense', req.params.id);
    res.json({ ok: true });
  }));

  admin.get('/reports', wrap(async (req, res) => {
    const { from, to } = z.object({ from: isoDate.optional(), to: isoDate.optional() }).parse(req.query);
    res.json(await buildReport(db.q, await settings(), { from, to }));
  }));

  admin.get('/audit', wrap(async (_req, res) => { res.json(await db.q('SELECT * FROM audit_events ORDER BY id DESC LIMIT 200')); }));

  // ----- media upload -----

  const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  admin.post('/media', wrap(async (req, res) => {
    const b = z.object({ mime: z.enum(IMAGE_MIMES as [string, ...string[]]), dataBase64: z.string().min(1) }).parse(req.body);
    const data = Buffer.from(b.dataBase64, 'base64');
    if (!data.length || data.length > 2 * 1024 * 1024) throw new HttpError(400, 'Image must be under 2 MB');
    const [m] = await db.q<{ id: number }>('INSERT INTO media(mime, data) VALUES ($1,$2) RETURNING id', [b.mime, data]);
    res.status(201).json({ id: m.id, url: `/api/media/${m.id}` });
  }));

  // ----- built client (production: one service, one origin, so the admin cookie and deep links just work) -----

  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, '../../client/dist');
  if (env.isProd && fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist, { index: false }));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // ----- errors -----

  api.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request', details: err.issues });
    }
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if ((err as any)?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if ((err as any)?.code === '23505') return res.status(409).json({ error: 'That value is already in use' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

function publicProduct(p: any) {
  return {
    id: p.id, slug: p.slug, name: p.name, description: p.description, piecesPerBox: p.pieces_per_box, specs: p.specs,
    inStock: p.stock > 0, stock: p.stock,
    images: p.images.map((i: any) => ({ id: i.id, url: i.url, alt: i.alt })),
    tiers: p.tiers.map((t: any) => ({ minQty: t.min_qty, unitPrice: t.unit_price })),
  };
}

// The customer gets their own order back; internal notes, history and payments stay private.
function publicOrder(o: any) {
  return {
    ref: o.ref, status: o.status, customerName: o.customer_name, address: o.address, pin: o.pin,
    items: o.items.map((i: any) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unit_price })),
    subtotal: o.subtotal, deliveryFee: o.delivery_fee, total: o.total, needsReview: o.needs_review,
    quote: o.quote ? { status: o.quote.status, billedKm: o.quote.billed_km, note: o.quote.note } : null,
  };
}
