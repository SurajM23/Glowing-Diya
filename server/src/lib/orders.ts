import { randomBytes } from 'node:crypto';
import type { Db, Q } from '../db';
import { lineTotal, savings, validQuantity, type Tier } from './pricing';
import { quoteDelivery, withinHours, type Quote, type Router, defaultRouter } from './delivery';
import { audit, type Settings } from './settings';

export const ORDER_STATUSES = [
  'new_enquiry', 'awaiting_confirmation', 'confirmed', 'preparing',
  'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new_enquiry: ['awaiting_confirmation', 'confirmed', 'cancelled'],
  awaiting_confirmation: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'ready_for_delivery', 'cancelled'],
  preparing: ['ready_for_delivery', 'cancelled'],
  ready_for_delivery: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'ready_for_delivery', 'cancelled'],
  delivered: [],
  cancelled: [],
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

// ---------- products ----------

export async function listProducts(q: Q, opts: { activeOnly?: boolean; slug?: string } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.activeOnly) where.push('p.active');
  if (opts.slug) { params.push(opts.slug); where.push(`p.slug = $${params.length}`); }
  const products = await q<any>(
    `SELECT p.*, COALESCE((SELECT SUM(delta) FROM inventory_movements m WHERE m.product_id = p.id), 0)::int AS stock
     FROM products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.sort, p.id`,
    params,
  );
  if (!products.length) return [];
  const images = await q<any>('SELECT * FROM product_images ORDER BY sort, id');
  const tiers = await q<any>('SELECT * FROM price_tiers ORDER BY min_qty');
  return products.map((p) => ({
    ...p,
    images: images.filter((i) => i.product_id === p.id),
    tiers: tiers.filter((t) => t.product_id === p.id),
  }));
}

// ---------- estimate ----------

export interface EstimateInput {
  items: { productId: number; quantity: number }[];
  address?: string;
  pin?: string;
  preferredDate?: string;
}

export async function estimate(q: Q, s: Settings, input: EstimateInput, router: Router | null = defaultRouter()) {
  if (!input.items.length) throw new HttpError(400, 'Add at least one product');
  const merged = new Map<number, number>();
  for (const it of input.items) {
    if (!validQuantity(it.quantity)) throw new HttpError(400, 'Quantity must be a whole number of at least 1');
    merged.set(it.productId, (merged.get(it.productId) ?? 0) + it.quantity);
  }
  const products = await listProducts(q, { activeOnly: true });
  const lines = [...merged].map(([productId, quantity]) => {
    const p = products.find((x: any) => x.id === productId);
    if (!p) throw new HttpError(400, 'A selected product is not available');
    if (quantity > p.stock) throw new HttpError(409, `Only ${p.stock} box(es) of ${p.name} in stock`);
    const tiers = p.tiers as Tier[];
    const { unitPrice, total } = lineTotal(tiers, quantity);
    return { productId, name: p.name as string, quantity, unitPrice, total, unitCost: p.unit_cost as number, saved: savings(tiers, quantity) };
  });
  const subtotal = lines.reduce((a, l) => a + l.total, 0);

  let quote: Quote | null = null;
  if (input.address && input.pin) quote = await quoteDelivery(s, input.address, input.pin, router);

  const notes: string[] = [];
  let canPromise = true;
  if (quote?.status === 'out_of_range') { canPromise = false; notes.push(quote.note); }
  if (quote?.status === 'manual_review') { canPromise = false; notes.push(quote.note); }
  if (input.preferredDate && s.delivery.blackoutDates.includes(input.preferredDate)) {
    canPromise = false;
    notes.push('We cannot deliver on that date. Please choose another day.');
  }
  if (s.delivery.dailyCapacity != null) {
    const [{ n }] = await q<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM orders WHERE status NOT IN ('delivered','cancelled') AND created_at > now() - interval '24 hours'`,
    );
    if (n >= s.delivery.dailyCapacity) { canPromise = false; notes.push('We have a lot of orders right now, so delivery may take longer.'); }
  }
  if (!withinHours(s.contact.openTime, s.contact.closeTime, new Date())) {
    notes.push(`We deliver between ${s.contact.openTime} and ${s.contact.closeTime}.`);
  }
  const deliveryFee = quote?.status === 'ok' ? quote.fee : 0;
  return {
    lines,
    subtotal,
    saved: lines.reduce((a, l) => a + l.saved, 0),
    delivery: quote,
    deliveryFee,
    total: subtotal + deliveryFee,
    totalIsFinal: quote?.status === 'ok',
    window: canPromise
      ? `Within ${s.delivery.promiseHours} hours, between ${s.contact.openTime} and ${s.contact.closeTime} (subject to confirmation).`
      : 'The owner will confirm the delivery time.',
    notes,
  };
}

// ---------- create ----------

export interface CreateOrderInput extends EstimateInput {
  customerName: string;
  phone: string;
  address: string;
  pin: string;
  landmark?: string;
  preferredTime?: string;
  notes?: string;
}

function makeRef(prefix: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${ymd}-${rand}`;
}

export async function createOrder(db: Db, s: Settings, input: CreateOrderInput, idempotencyKey: string, router?: Router | null) {
  const existing = await db.q<any>('SELECT id FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
  if (existing.length) return { order: await getOrder(db.q, existing[0].id), duplicate: true };

  const est = await estimate(db.q, s, input, router);
  if (est.delivery?.status === 'out_of_range') throw new HttpError(422, est.delivery.note);
  const slot = [input.preferredDate, input.preferredTime].filter(Boolean).join(' ');

  try {
    const id = await db.tx(async (q) => {
      // Lock products and re-check stock inside the transaction
      for (const l of est.lines) {
        await q('SELECT id FROM products WHERE id = $1 FOR UPDATE', [l.productId]);
        const [{ stock }] = await q<{ stock: number }>('SELECT COALESCE(SUM(delta),0)::int AS stock FROM inventory_movements WHERE product_id = $1', [l.productId]);
        if (stock < l.quantity) throw new HttpError(409, `Only ${stock} box(es) of ${l.name} in stock`);
      }
      const [campaign] = await q<any>('SELECT id FROM campaigns WHERE active LIMIT 1');
      const [o] = await q<{ id: number }>(
        `INSERT INTO orders(ref, idempotency_key, campaign_id, customer_name, phone, address, pin, landmark, preferred_slot,
           customer_notes, subtotal, delivery_fee, total, needs_review)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
        [makeRef(s.orders.refPrefix), idempotencyKey, campaign?.id ?? null, input.customerName, input.phone, input.address, input.pin,
          input.landmark ?? '', slot, input.notes ?? '', est.subtotal, est.deliveryFee, est.total, est.delivery?.status !== 'ok'],
      );
      for (const l of est.lines) {
        await q('INSERT INTO order_items(order_id, product_id, name, quantity, unit_price, unit_cost) VALUES ($1,$2,$3,$4,$5,$6)',
          [o.id, l.productId, l.name, l.quantity, l.unitPrice, l.unitCost]);
        await q(`INSERT INTO inventory_movements(product_id, delta, kind, note, order_id) VALUES ($1,$2,'reserve','Reserved for order',$3)`,
          [l.productId, -l.quantity, o.id]);
      }
      const dq = est.delivery;
      await q(
        `INSERT INTO delivery_quotes(order_id, status, provider, distance_km, billed_km, rate_per_km, fee, lat, lng, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [o.id, dq?.status ?? 'manual_review', dq?.provider ?? 'none', dq?.distanceKm ?? null, dq?.billedKm ?? null,
          dq?.ratePerKm ?? s.delivery.ratePerKm, est.deliveryFee, dq?.lat ?? null, dq?.lng ?? null, dq?.note ?? 'No distance provider configured'],
      );
      await q(`INSERT INTO order_status_history(order_id, from_status, to_status, actor, note) VALUES ($1,NULL,'new_enquiry','customer','Order saved')`, [o.id]);
      return o.id;
    });
    return { order: await getOrder(db.q, id), duplicate: false };
  } catch (e: any) {
    if (e?.code === '23505') {
      const [row] = await db.q<any>('SELECT id FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
      if (row) return { order: await getOrder(db.q, row.id), duplicate: true };
    }
    throw e;
  }
}

// ---------- read ----------

export async function getOrder(q: Q, id: number | string, by: 'id' | 'ref' = 'id') {
  const [o] = await q<any>(`SELECT * FROM orders WHERE ${by === 'id' ? 'id' : 'ref'} = $1`, [id]);
  if (!o) return null;
  const [items, quotes, history, payments, attempts] = await Promise.all([
    q<any>('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [o.id]),
    q<any>('SELECT * FROM delivery_quotes WHERE order_id = $1 ORDER BY id DESC', [o.id]),
    q<any>('SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY id', [o.id]),
    q<any>('SELECT * FROM payments WHERE order_id = $1 ORDER BY id', [o.id]),
    q<any>('SELECT * FROM delivery_attempts WHERE order_id = $1 ORDER BY id', [o.id]),
  ]);
  return { ...o, items, quote: quotes[0] ?? null, history, payments, attempts };
}

// ---------- WhatsApp ----------

export function whatsappNumber(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export function whatsappLink(s: Settings, order: any): string | null {
  const num = whatsappNumber(s.contact.whatsapp);
  if (!num) return null;
  const lines = [
    s.site.whatsappGreeting,
    `Order ref: ${order.ref}`,
    ...order.items.map((i: any) => `${i.name} x ${i.quantity} @ Rs.${i.unit_price}`),
    `Products: Rs.${order.subtotal}`,
    order.quote?.status === 'ok'
      ? `Delivery (${order.quote.billed_km} km est.): Rs.${order.delivery_fee}`
      : 'Delivery: to be confirmed by owner',
    `${order.quote?.status === 'ok' ? 'Estimated total' : 'Products total (delivery extra)'}: Rs.${order.total}`,
    `Name: ${order.customer_name}`,
    `Address: ${order.address}, ${order.pin}`,
  ];
  return `https://wa.me/${num}?text=${encodeURIComponent(lines.join('\n'))}`;
}

// ---------- admin mutations ----------

export async function changeStatus(db: Db, orderId: number, to: OrderStatus, actor: string, note = '') {
  return db.tx(async (q) => {
    const [o] = await q<any>('SELECT id, status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o) throw new HttpError(404, 'Order not found');
    if (!TRANSITIONS[o.status as OrderStatus].includes(to)) throw new HttpError(409, `Cannot move from ${o.status} to ${to}`);
    if (to === 'cancelled') {
      if (!note.trim()) throw new HttpError(400, 'A cancellation reason is required');
      await q('UPDATE orders SET cancel_reason = $2 WHERE id = $1', [orderId, note]);
      const reserved = await q<any>(`SELECT product_id, -SUM(delta)::int AS qty FROM inventory_movements WHERE order_id = $1 AND kind IN ('reserve','release') GROUP BY product_id`, [orderId]);
      for (const r of reserved) {
        if (r.qty > 0) await q(`INSERT INTO inventory_movements(product_id, delta, kind, note, order_id, actor) VALUES ($1,$2,'release','Order cancelled',$3,$4)`, [r.product_id, r.qty, orderId, actor]);
      }
    }
    if (to === 'delivered') {
      await q(`INSERT INTO delivery_attempts(order_id, batch_id, outcome, actor) SELECT id, batch_id, 'delivered', $2 FROM orders WHERE id = $1`, [orderId, actor]);
    }
    await q('UPDATE orders SET status = $2 WHERE id = $1', [orderId, to]);
    await q('INSERT INTO order_status_history(order_id, from_status, to_status, actor, note) VALUES ($1,$2,$3,$4,$5)', [orderId, o.status, to, actor, note]);
    await audit(q, actor, 'order.status', 'order', orderId, { from: o.status, to, note });
  });
}

export async function recordFailedAttempt(db: Db, orderId: number, reason: string, actor: string) {
  if (!reason.trim()) throw new HttpError(400, 'A reason is required');
  return db.tx(async (q) => {
    const [o] = await q<any>('SELECT id, status, batch_id FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.status !== 'out_for_delivery') throw new HttpError(409, 'Only orders out for delivery can have a failed attempt');
    await q(`INSERT INTO delivery_attempts(order_id, batch_id, outcome, reason, actor) VALUES ($1,$2,'failed',$3,$4)`, [orderId, o.batch_id, reason, actor]);
    await q(`UPDATE orders SET status = 'ready_for_delivery' WHERE id = $1`, [orderId]);
    await q(`INSERT INTO order_status_history(order_id, from_status, to_status, actor, note) VALUES ($1,'out_for_delivery','ready_for_delivery',$2,$3)`, [orderId, actor, `Failed attempt: ${reason}`]);
    await audit(q, actor, 'order.failed_attempt', 'order', orderId, { reason });
  });
}

export async function recordPayment(
  db: Db, orderId: number, p: { kind: 'payment' | 'refund'; method: string; amount: number; reference?: string }, actor: string,
) {
  return db.tx(async (q) => {
    const [o] = await q<any>('SELECT id, total FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!o) throw new HttpError(404, 'Order not found');
    await q('INSERT INTO payments(order_id, kind, method, amount, reference, actor) VALUES ($1,$2,$3,$4,$5,$6)', [orderId, p.kind, p.method, p.amount, p.reference ?? '', actor]);
    const [{ paid, refunded }] = await q<any>(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE kind='payment'),0)::int AS paid, COALESCE(SUM(amount) FILTER (WHERE kind='refund'),0)::int AS refunded FROM payments WHERE order_id = $1`, [orderId]);
    const net = paid - refunded;
    const status = refunded > 0 && net <= 0 ? 'refunded' : net >= o.total ? 'paid' : net > 0 ? 'partially_paid' : 'unpaid';
    await q('UPDATE orders SET payment_status = $2 WHERE id = $1', [orderId, status]);
    await audit(q, actor, `payment.${p.kind}`, 'order', orderId, { amount: p.amount, method: p.method, status });
    return status;
  });
}
