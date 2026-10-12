import { env, validateProductionConfig } from './config';
import { migrate, openDb } from './db';
import { createApp } from './app';
import { seedDefaults } from './lib/seed';

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

    const host = '0.0.0.0';
    createApp(db).listen(env.port, host, () => {
      console.log(`[server] API listening on http://${host}:${env.port} (port ${env.port})`);
    });
  } catch (err: any) {
    console.error('================================================================');
    console.error('[server] FATAL: Server failed to start');
    console.error(`[server] Error: ${err?.message || err}`);
    if (env.isProd && !env.databaseUrl) {
      console.error('[server] Action required: Set DATABASE_URL in your Render Environment settings.');
    }
    console.error('================================================================');
    process.exit(1);
  }
}

start();
