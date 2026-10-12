import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { key, orderPayload, testApp } from './helpers';

async function login(app: any) {
  const res = await request(app).post('/api/admin/login').send({ email: 'owner@test.dev', password: 'correct-horse-battery' });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'] as unknown as string[];
}

async function newOrder(app: any, db: any, qty = 2) {
  const [p] = await db.q('SELECT id FROM products LIMIT 1');
  const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(p.id, qty));
  const [o] = await db.q('SELECT id FROM orders WHERE ref = $1', [res.body.order.ref]);
  return o.id as number;
}

describe('admin auth', () => {
  it('blocks every admin route without a session', async () => {
    const { app } = await testApp();
    for (const path of ['/orders', '/settings', '/reports', '/inventory', '/campaigns', '/products', '/audit', '/batches']) {
      expect((await request(app).get(`/api/admin${path}`)).status).toBe(401);
    }
    expect((await request(app).post('/api/admin/orders/1/status').send({ status: 'confirmed' })).status).toBe(401);
    expect((await request(app).put('/api/admin/settings/brand').send({})).status).toBe(401);
  });

  it('rejects wrong passwords and unknown emails with the same message', async () => {
    const { app } = await testApp();
    const a = await request(app).post('/api/admin/login').send({ email: 'owner@test.dev', password: 'nope-nope-nope' });
    const b = await request(app).post('/api/admin/login').send({ email: 'ghost@test.dev', password: 'nope-nope-nope' });
    expect(a.status).toBe(401);
    expect(b.body.error).toBe(a.body.error);
  });

  it('sets an httpOnly cookie that grants access', async () => {
    const { app } = await testApp();
    const cookie = await login(app);
    expect(cookie.join(';')).toMatch(/HttpOnly/i);
    expect((await request(app).get('/api/admin/me').set('Cookie', cookie)).body.email).toBe('owner@test.dev');
  });

  it('has no public signup route', async () => {
    const { app } = await testApp();
    expect((await request(app).post('/api/admin/register').send({ email: 'x@y.zz', password: 'abcdefghijkl' })).status).toBe(401);
  });
});

describe('order management', () => {
  it('follows allowed transitions and records append-only history', async () => {
    const { db, app } = await testApp();
    const cookie = await login(app);
    const id = await newOrder(app, db);
    const move = (status: string, note?: string) => request(app).post(`/api/admin/orders/${id}/status`).set('Cookie', cookie).send({ status, note });
    expect((await move('delivered')).status).toBe(409);
    expect((await move('confirmed')).status).toBe(200);
    expect((await move('ready_for_delivery')).status).toBe(200);
    expect((await move('out_for_delivery')).status).toBe(200);
    const done = await move('delivered');
    expect(done.body.history.map((h: any) => h.to_status)).toEqual(['new_enquiry', 'confirmed', 'ready_for_delivery', 'out_for_delivery', 'delivered']);
    expect((await move('cancelled', 'late')).status).toBe(409);
  });

  it('requires a reason to cancel and returns stock', async () => {
    const { db, app } = await testApp({ stock: 10 });
    const cookie = await login(app);
    const id = await newOrder(app, db, 3);
    const cancel = (note?: string) => request(app).post(`/api/admin/orders/${id}/status`).set('Cookie', cookie).send({ status: 'cancelled', note });
    expect((await cancel()).status).toBe(400);
    expect((await cancel('Customer changed mind')).status).toBe(200);
    const [{ stock }] = await db.q('SELECT SUM(delta)::int AS stock FROM inventory_movements');
    expect(stock).toBe(10);
  });

  it('records a failed delivery attempt and keeps the order open', async () => {
    const { db, app } = await testApp();
    const cookie = await login(app);
    const id = await newOrder(app, db);
    for (const s of ['confirmed', 'ready_for_delivery', 'out_for_delivery']) {
      await request(app).post(`/api/admin/orders/${id}/status`).set('Cookie', cookie).send({ status: s });
    }
    const res = await request(app).post(`/api/admin/orders/${id}/failed-attempt`).set('Cookie', cookie).send({ reason: 'Customer not home' });
    expect(res.body.status).toBe('ready_for_delivery');
    expect(res.body.attempts).toHaveLength(1);
  });

  it('tracks payments, partial payment and refunds', async () => {
    const { db, app } = await testApp();
    const cookie = await login(app);
    const id = await newOrder(app, db, 2); // 240 + 15
    const pay = (body: object) => request(app).post(`/api/admin/orders/${id}/payments`).set('Cookie', cookie).send(body);
    expect((await pay({ method: 'upi', amount: 100 })).body.payment_status).toBe('partially_paid');
    expect((await pay({ method: 'upi', amount: 155 })).body.payment_status).toBe('paid');
    expect((await pay({ kind: 'refund', method: 'upi', amount: 255 })).body.payment_status).toBe('refunded');
  });

  it('lets the owner set the fee on a manual-review order', async () => {
    const { db, app } = await testApp({ km: null });
    const cookie = await login(app);
    const id = await newOrder(app, db, 1);
    const res = await request(app).patch(`/api/admin/orders/${id}`).set('Cookie', cookie).send({ deliveryFee: 40 });
    expect(res.body).toMatchObject({ delivery_fee: 40, total: 190, needs_review: false });
    expect(res.body.quote.status).toBe('manual_review');
  });
});

describe('summary', () => {
  it('counts orders by status, review flags and stock', async () => {
    const { db, app } = await testApp({ stock: 6, km: null });
    const cookie = await login(app);
    expect((await request(app).get('/api/admin/summary')).status).toBe(401);
    await newOrder(app, db, 2);
    const id = await newOrder(app, db, 1);
    await request(app).post(`/api/admin/orders/${id}/status`).set('Cookie', cookie).send({ status: 'confirmed' });
    const s = (await request(app).get('/api/admin/summary').set('Cookie', cookie)).body;
    expect(s.byStatus).toEqual({ new_enquiry: 1, confirmed: 1 });
    expect(s.needsReview).toBe(2);
    expect(s.awaitingTrip).toBe(1);
    expect(s.today).toEqual({ orders: 2, value: 390 });
    expect(s.stock[0]).toMatchObject({ stock: 3, low: true });
  });
});

describe('inventory, settings, audit', () => {
  it('never lets stock go negative', async () => {
    const { db, app } = await testApp({ stock: 2 });
    const cookie = await login(app);
    const [p] = await db.q('SELECT id FROM products');
    const res = await request(app).post('/api/admin/inventory').set('Cookie', cookie).send({ productId: p.id, kind: 'damaged', quantity: 5 });
    expect(res.status).toBe(409);
    expect((await request(app).post('/api/admin/inventory').set('Cookie', cookie).send({ productId: p.id, kind: 'add', quantity: 5 })).status).toBe(201);
  });

  it('a settings change shows up in the public config and is audited', async () => {
    const { app, db } = await testApp();
    const cookie = await login(app);
    const current = (await request(app).get('/api/admin/settings').set('Cookie', cookie)).body.brand;
    const put = await request(app).put('/api/admin/settings/brand').set('Cookie', cookie).send({ ...current, name: 'Lumi Diyas' });
    expect(put.status).toBe(200);
    expect((await request(app).get('/api/config')).body.brand.name).toBe('Lumi Diyas');
    const [a] = await db.q(`SELECT * FROM audit_events WHERE action = 'settings.update'`);
    expect(a.actor).toBe('owner@test.dev');
  });

  it('validates settings and campaign colours', async () => {
    const { app } = await testApp();
    const cookie = await login(app);
    expect((await request(app).put('/api/admin/settings/delivery').set('Cookie', cookie).send({ ratePerKm: -1 })).status).toBe(400);
    expect((await request(app).put('/api/admin/settings/nope').set('Cookie', cookie).send({})).status).toBe(404);
  });

  it('switching the campaign never touches prices', async () => {
    const { app, db } = await testApp();
    const cookie = await login(app);
    const theme = { primary: '#112233', accent: '#445566', dark: '#000000', bg: '#ffffff', text: '#111111' };
    const hero = { desktopImage: '', mobileImage: '', heading: 'Holi', subheading: '', ctaText: 'Shop' };
    const created = await request(app).post('/api/admin/campaigns').set('Cookie', cookie).send({ name: 'Holi', festival: 'Holi', theme, hero });
    expect(created.status).toBe(201);
    await request(app).post(`/api/admin/campaigns/${created.body.id}/activate`).set('Cookie', cookie);
    const cfg = (await request(app).get('/api/config')).body;
    expect(cfg.campaign.name).toBe('Holi');
    expect(cfg.products[0].tiers[0].unitPrice).toBe(150);
    const [{ n }] = await db.q('SELECT COUNT(*)::int AS n FROM campaigns WHERE active');
    expect(n).toBe(1);
  });
});

describe('reports', () => {
  it('keeps product and delivery separate and warns when costs are missing', async () => {
    const { db, app } = await testApp();
    const cookie = await login(app);
    await db.q('UPDATE products SET unit_cost = 80');
    const id = await newOrder(app, db, 2); // revenue 240 + 15, cost 160
    for (const s of ['confirmed', 'ready_for_delivery', 'out_for_delivery', 'delivered']) {
      await request(app).post(`/api/admin/orders/${id}/status`).set('Cookie', cookie).send({ status: s });
    }
    await newOrder(app, db, 1); // still open: must not count
    await request(app).post('/api/admin/expenses').set('Cookie', cookie).send({ description: 'Packaging', amount: 30 });
    const r = (await request(app).get('/api/admin/reports').set('Cookie', cookie)).body;
    expect(r).toMatchObject({ deliveredOrders: 1, productRevenue: 240, deliveryRevenue: 15, productCost: 160, productProfit: 80, otherExpenses: 30 });
    expect(r.estimatedProfit).toBe(80 + 15 - 30);
    expect(r.warnings.join(' ')).toMatch(/mileage/i);
  });

  it('filters by date range', async () => {
    const { db, app } = await testApp();
    const cookie = await login(app);
    const id = await newOrder(app, db, 2);
    for (const s of ['confirmed', 'ready_for_delivery', 'out_for_delivery', 'delivered']) {
      await request(app).post(`/api/admin/orders/${id}/status`).set('Cookie', cookie).send({ status: s });
    }
    const today = new Date().toISOString().slice(0, 10);
    const inRange = await request(app).get(`/api/admin/reports?from=${today}&to=${today}`).set('Cookie', cookie);
    expect(inRange.status).toBe(200);
    expect(inRange.body).toMatchObject({ deliveredOrders: 1, productRevenue: 240, ordersByStatus: { delivered: 1 } });
    const past = await request(app).get('/api/admin/reports?from=2020-01-01&to=2020-01-31').set('Cookie', cookie);
    expect(past.body).toMatchObject({ deliveredOrders: 0, productRevenue: 0, ordersByStatus: {} });
    expect((await request(app).get('/api/admin/reports?from=2020-01-01').set('Cookie', cookie)).body.deliveredOrders).toBe(1);
  });

  it('charges fuel from actual batch km once petrol and mileage are set', async () => {
    const { db, app } = await testApp();
    const cookie = await login(app);
    await db.q(`INSERT INTO settings(key, value) VALUES ('costs', '{"petrolPerLitre":100,"bikeMileageKmPerLitre":50}'::jsonb)`);
    await request(app).post('/api/admin/batches').set('Cookie', cookie).send({ name: 'Trip', plannedDate: '2025-01-05', orderIds: [] });
    const [b] = await db.q('SELECT id FROM delivery_batches');
    await request(app).patch(`/api/admin/batches/${b.id}`).set('Cookie', cookie).send({ actualKm: 25 });
    const r = (await request(app).get('/api/admin/reports').set('Cookie', cookie)).body;
    expect(r.fuelCost).toBe(50);
  });
});
