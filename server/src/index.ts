import { env } from './config';
import { migrate, openDb } from './db';
import { createApp } from './app';
import { seedDefaults } from './lib/seed';

const db = await openDb();
const applied = await migrate(db);
if (applied.length) console.log('Applied migrations:', applied.join(', '));
// Starting content only; the owner edits everything in the admin. Stock stays at 0 until added there.
await seedDefaults(db, { demoStock: env.isProd ? 0 : 50 });

createApp(db).listen(env.port, () => console.log(`API listening on http://localhost:${env.port}`));
