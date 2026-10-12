import { migrate, openDb, type Db } from '../src/db';
import { seedDefaults } from '../src/lib/seed';
import { createApp } from '../src/app';
import type { Router } from '../src/lib/delivery';
import { hashPassword } from '../src/auth';

export const fixedRouter = (km: number | null): Router => ({
  name: 'test',
  distance: async () => (km == null ? null : { km, lat: 18.5, lng: 73.8 }),
});

export async function testDb(stock = 10): Promise<Db> {
  const db = await openDb({ memory: true });
  await migrate(db);
  await seedDefaults(db, { demoStock: stock });
  return db;
}

export async function testApp(opts: { stock?: number; km?: number | null } = {}) {
  const db = await testDb(opts.stock ?? 10);
  const app = createApp(db, { router: fixedRouter(opts.km === undefined ? 4.2 : opts.km), rateLimit: false });
  await db.q('INSERT INTO admin_users(email, password_hash) VALUES ($1,$2)', ['owner@test.dev', await hashPassword('correct-horse-battery')]);
  return { db, app };
}

export const orderPayload = (productId: number, quantity: number) => ({
  items: [{ productId, quantity }],
  customerName: 'Asha Patil',
  phone: '9876543210',
  address: '12 Test Road, Pune',
  pin: '411046',
});

export const key = () => `test-key-${Math.random().toString(36).slice(2)}-${Date.now()}`;
