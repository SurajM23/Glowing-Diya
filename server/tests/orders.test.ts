import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { key, orderPayload, testApp } from './helpers';

async function productId(db: any) {
  const [p] = await db.q('SELECT id FROM products LIMIT 1');
  return p.id as number;
}

describe('POST /api/orders', () => {
  it('saves the order with server-side pricing and a WhatsApp link', async () => {
    const { db, app } = await testApp({ km: 4.2 });
    const pid = await productId(db);
    const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(pid, 3));
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ subtotal: 360, deliveryFee: 15, total: 375, status: 'new_enquiry' });
    expect(res.body.order.ref).toMatch(/^GD-\d{8}-[A-F0-9]{6}$/);
    // No WhatsApp number configured yet: no link is invented
    expect(res.body.whatsappUrl).toBeNull();
    const [{ n }] = await db.q('SELECT COUNT(*)::int AS n FROM orders');
    expect(n).toBe(1);
  });

  it('builds an encoded wa.me link once a number is set', async () => {
    const { db, app } = await testApp();
    await db.q(`INSERT INTO settings(key, value) VALUES ('contact', '{"whatsapp":"98765 43210"}'::jsonb)`);
    const pid = await productId(db);
    const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(pid, 1));
    expect(res.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(decodeURIComponent(res.body.whatsappUrl.split('text=')[1])).toContain(res.body.order.ref);
  });

  it('ignores client-supplied prices', async () => {
    const { db, app } = await testApp();
    const pid = await productId(db);
    const res = await request(app).post('/api/orders').set('Idempotency-Key', key())
      .send({ ...orderPayload(pid, 1), subtotal: 1, total: 1, deliveryFee: 0 });
    expect(res.body.order.subtotal).toBe(150);
  });

  it('does not create a duplicate for the same idempotency key', async () => {
    const { db, app } = await testApp();
    const pid = await productId(db);
    const k = key();
    const [a, b] = await Promise.all([
      request(app).post('/api/orders').set('Idempotency-Key', k).send(orderPayload(pid, 2)),
      request(app).post('/api/orders').set('Idempotency-Key', k).send(orderPayload(pid, 2)),
    ]);
    expect(a.body.order.ref).toBe(b.body.order.ref);
    const [{ n }] = await db.q('SELECT COUNT(*)::int AS n FROM orders');
    const [{ stock }] = await db.q('SELECT SUM(delta)::int AS stock FROM inventory_movements');
    expect(n).toBe(1);
    expect(stock).toBe(8);
  });

  it('requires an idempotency key', async () => {
    const { db, app } = await testApp();
    const res = await request(app).post('/api/orders').send(orderPayload(await productId(db), 1));
    expect(res.status).toBe(400);
  });

  it('refuses more boxes than are in stock and leaves stock untouched', async () => {
    const { db, app } = await testApp({ stock: 3 });
    const pid = await productId(db);
    const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(pid, 4));
    expect(res.status).toBe(409);
    const [{ n }] = await db.q('SELECT COUNT(*)::int AS n FROM orders');
    expect(n).toBe(0);
  });

  it('cannot oversell under concurrent orders', async () => {
    const { db, app } = await testApp({ stock: 5 });
    const pid = await productId(db);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(pid, 2))),
    );
    const ok = results.filter((r) => r.status === 201).length;
    const [{ stock }] = await db.q('SELECT SUM(delta)::int AS stock FROM inventory_movements');
    expect(ok).toBe(2);
    expect(stock).toBe(1);
  });

  it('rejects invalid input', async () => {
    const { db, app } = await testApp();
    const pid = await productId(db);
    for (const bad of [{ items: [{ productId: pid, quantity: 0 }] }, { items: [{ productId: pid, quantity: 1.5 }] }, { phone: 'abc' }, { pin: '12' }, { customerName: '' }]) {
      const body = { ...orderPayload(pid, 1), ...bad };
      const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('sends the order to manual review, with no invented fee, when the address cannot be located', async () => {
    const { db, app } = await testApp({ km: null });
    const pid = await productId(db);
    const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(pid, 1));
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ deliveryFee: 0, needsReview: true });
    expect(res.body.order.quote.status).toBe('manual_review');
  });

  it('snapshots prices and the quote so later changes do not rewrite the order', async () => {
    const { db, app } = await testApp({ km: 4.2 });
    const pid = await productId(db);
    const created = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(pid, 2));
    await db.q('UPDATE price_tiers SET unit_price = 999');
    await db.q(`INSERT INTO settings(key, value) VALUES ('delivery', '{"ratePerKm": 50}'::jsonb)`);
    const [o] = await db.q('SELECT * FROM orders WHERE ref = $1', [created.body.order.ref]);
    const [i] = await db.q('SELECT * FROM order_items WHERE order_id = $1', [o.id]);
    const [qt] = await db.q('SELECT * FROM delivery_quotes WHERE order_id = $1', [o.id]);
    expect(o.total).toBe(255);
    expect(i.unit_price).toBe(120);
    expect(qt).toMatchObject({ rate_per_km: 3, billed_km: 5, fee: 15 });
  });

  it('starts as a new enquiry: saving or opening WhatsApp never confirms an order', async () => {
    const { db, app } = await testApp();
    const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(await productId(db), 1));
    const [o] = await db.q('SELECT status FROM orders');
    expect(o.status).toBe('new_enquiry');
    expect(res.body.order.status).toBe('new_enquiry');
  });
});

describe('POST /api/orders/estimate', () => {
  it('quotes without saving anything', async () => {
    const { db, app } = await testApp({ km: 6.5 });
    const pid = await productId(db);
    const res = await request(app).post('/api/orders/estimate').send({ items: [{ productId: pid, quantity: 2 }], address: '1 Test Road', pin: '411046' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ subtotal: 240, deliveryFee: 21, total: 261, saved: 60, totalIsFinal: true });
    const [{ n }] = await db.q('SELECT COUNT(*)::int AS n FROM orders');
    expect(n).toBe(0);
  });
});

describe('public config', () => {
  it('exposes branding and products but not costs or base coordinates', async () => {
    const { app } = await testApp();
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.brand.name).toBeTruthy();
    expect(res.body.products[0].tiers).toEqual([{ minQty: 1, unitPrice: 150 }, { minQty: 2, unitPrice: 120 }]);
    expect(res.body.costs).toBeUndefined();
    expect(res.body.delivery.baseLat).toBeUndefined();
  });
});
