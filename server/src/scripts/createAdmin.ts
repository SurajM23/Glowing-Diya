// Usage: npm run create-admin -- owner@example.com 'a-long-password'
// or set ADMIN_EMAIL and ADMIN_PASSWORD. Running again for an existing email resets its password.
import { hashPassword } from '../auth';
import { migrate, openDb } from '../db';

const email = (process.argv[2] ?? process.env.ADMIN_EMAIL ?? '').trim();
const password = process.argv[3] ?? process.env.ADMIN_PASSWORD ?? '';

if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10) {
  console.error('Provide a valid email and a password of at least 10 characters.');
  process.exit(1);
}

const db = await openDb();
await migrate(db);
await db.q(
  `INSERT INTO admin_users(email, password_hash) VALUES ($1,$2)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
  [email, await hashPassword(password)],
);
console.log(`Admin ready: ${email}`);
await db.close();
