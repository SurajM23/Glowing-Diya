import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { key, orderPayload, testApp } from './helpers';

const pid = async (db: any) => (await db.q('SELECT id FROM products LIMIT 1'))[0].id as number;

describe('optional customer accounts', () => {
  it('places an order without an account by default', async () => {
    const { db, app } = await testApp();
    const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(await pid(db), 1));
    expect(res.status).toBe(201);
    expect(res.body.tracked).toBe(false);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('creates an account at checkout, signs in, and lists the order with its status', async () => {
    const { db, app } = await testApp();
    const agent = request.agent(app);
    const res = await agent.post('/api/orders').set('Idempotency-Key', key()).send({ ...orderPayload(await pid(db), 2), trackOrder: true, password: 'diwali-2026' });
    expect(res.body.tracked).toBe(true);
    const orders = (await agent.get('/api/account/orders')).body;
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ ref: res.body.order.ref, status: 'new_enquiry' });
    expect(orders[0].history[0]).toMatchObject({ status: 'new_enquiry' });
    expect(orders[0].internal_notes).toBeUndefined();
  });

  it('signs in by phone in any format; wrong password is rejected', async () => {
    const { db, app } = await testApp();
    await request(app).post('/api/orders').set('Idempotency-Key', key()).send({ ...orderPayload(await pid(db), 1), trackOrder: true, password: 'diwali-2026' });
    expect((await request(app).post('/api/account/login').send({ phone: '+91 98765-43210', password: 'diwali-2026' })).status).toBe(200);
    expect((await request(app).post('/api/account/login').send({ phone: '9876543210', password: 'wrong-pass' })).status).toBe(401);
  });

  it('a wrong password for an existing account still places the order, untracked', async () => {
    const { db, app } = await testApp();
    const p = await pid(db);
    await request(app).post('/api/orders').set('Idempotency-Key', key()).send({ ...orderPayload(p, 1), trackOrder: true, password: 'diwali-2026' });
    const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send({ ...orderPayload(p, 1), trackOrder: true, password: 'not-the-one' });
    expect(res.status).toBe(201);
    expect(res.body.tracked).toBe(false);
    expect(res.body.trackingNote).toMatch(/already exists/);
  });

  it('a customer session never grants admin access, and account routes need sign-in', async () => {
    const { db, app } = await testApp();
    const res = await request(app).post('/api/orders').set('Idempotency-Key', key()).send({ ...orderPayload(await pid(db), 1), trackOrder: true, password: 'diwali-2026' });
    const token = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0].split('=')[1];
    expect((await request(app).get('/api/admin/orders').set('Cookie', `gd_admin=${token}`)).status).toBe(401);
    expect((await request(app).get('/api/account/orders')).status).toBe(401);
  });
});
