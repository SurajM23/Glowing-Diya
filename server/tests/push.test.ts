import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { key, orderPayload, testApp } from './helpers';

describe('admin push notifications', () => {
  it('needs an admin session, stores a device, and orders still succeed with a dead device', async () => {
    const { db, app } = await testApp();
    const sub = { endpoint: 'https://push.example.invalid/abc', keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } };
    expect((await request(app).post('/api/admin/push/subscribe').send(sub)).status).toBe(401);
    const login = await request(app).post('/api/admin/login').send({ email: 'owner@test.dev', password: 'correct-horse-battery' });
    const cookie = login.headers['set-cookie'] as unknown as string[];
    expect((await request(app).get('/api/admin/push/key').set('Cookie', cookie)).body.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect((await request(app).post('/api/admin/push/subscribe').set('Cookie', cookie).send(sub)).status).toBe(201);
    const [{ n }] = await db.q('SELECT COUNT(*)::int AS n FROM push_subscriptions');
    expect(n).toBe(1);
    const [p] = await db.q('SELECT id FROM products LIMIT 1');
    expect((await request(app).post('/api/orders').set('Idempotency-Key', key()).send(orderPayload(p.id, 1))).status).toBe(201);
  }, 20_000);
});
