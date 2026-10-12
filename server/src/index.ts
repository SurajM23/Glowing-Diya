import { env, validateProductionConfig } from './config';
import { migrate, openDb } from './db';
import { createApp } from './app';
import { seedDefaults } from './lib/seed';
import { hashPassword } from './auth';

async function start() {
  try {
    validateProductionConfig();

    console.log(`[server] Opening database connection...`);
    const db = await openDb();

    console.log(`[server] Running migrations...`);
    const applied = await migrate(db);
    if (applied.length) {
      console.log(`[server] Applied migrations: ${applied.join(', ')}`);
    } else {
      console.log(`[server] Database schema up to date.`);
    }

    // Starting content only; the owner edits everything in the admin. Stock stays at 0 until added there.
    await seedDefaults(db, { demoStock: env.isProd ? 0 : 50 });

    // Optional: create/reset the admin login from env vars, for hosts with no shell access.
    // Safe to leave set after the first deploy — it just re-upserts the same account.
    const adminEmail = process.env.ADMIN_EMAIL?.trim();
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      if (!/^\S+@\S+\.\S+$/.test(adminEmail) || adminPassword.length < 10) {
        console.warn('[server] ADMIN_EMAIL/ADMIN_PASSWORD set but invalid (need a real email and a password of 10+ characters) — skipped.');
      } else {
        await db.q(
          `INSERT INTO admin_users(email, password_hash) VALUES ($1,$2)
           ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
          [adminEmail, await hashPassword(adminPassword)],
        );
        console.log(`[server] Admin account ready: ${adminEmail}`);
      }
    }

    const host = '0.0.0.0';
    createApp(db).listen(env.port, host, () => {
      console.log(`[server] API listening on http://${host}:${env.port} (port ${env.port})`);
    });
  } catch (err: any) {
    console.error('================================================================');
    console.error('[server] FATAL: Server failed to start');
    console.error(`[server] Error: ${err?.message || err}`);
    if (env.isProd && !env.databaseUrl) {
      console.error('[server]');
      console.error('[server] ACTION REQUIRED ON RENDER:');
      console.error('[server] 1. Create a PostgreSQL database in Render (New + -> PostgreSQL)');
      console.error('[server] 2. Copy the "Internal Database URL" (or external URL from Neon/Supabase)');
      console.error('[server] 3. In your Web Service dashboard -> "Environment" tab:');
      console.error('[server]    Add environment variable: DATABASE_URL = <database-url>');
      console.error('[server] 4. Save and redeploy.');
    }
    console.error('================================================================');
    process.exit(1);
  }
}

start();
