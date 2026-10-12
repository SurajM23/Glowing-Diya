import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { key, orderPayload, testApp } from './helpers';

const pid = async (db: any) => (await db.q('SELECT id FROM products LIMIT 1'))[0].id as number;

describe('order tracking with mobile number + order ID', () => {
  it('finds all orders for a phone given one of its order IDs, in any phone format', async () => {
    const { db, app } = await testApp();
    const p = await pid(db);
    const a = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(p, 1));
    await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(p, 2));
    const res = await request(app).post('/api/track').send({ phone: '+91 98765 43210', ref: a.body.order.ref.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].history[0].status).toBe('new_enquiry');
    expect(res.body[0].internal_notes).toBeUndefined();
  });

  it('refuses a wrong phone or a wrong order ID', async () => {
    const { db, app } = await testApp();
    const a = await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(await pid(db), 1));
    expect((await request(app).post('/api/track').send({ phone: '9999999999', ref: a.body.order.ref })).status).toBe(404);
    expect((await request(app).post('/api/track').send({ phone: '9876543210', ref: 'GD-20990101-ABCDEF' })).status).toBe(404);
  });
});
