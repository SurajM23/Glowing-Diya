import { env } from '../config';
import { migrate, openDb } from '../db';
import { seedDefaults } from '../lib/seed';

const db = await openDb();
await migrate(db);
await seedDefaults(db, { demoStock: env.isProd ? 0 : 50 });
console.log('Seed complete');
await db.close();
