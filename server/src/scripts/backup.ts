// Dumps every table to one timestamped JSON file. Restoring is manual (see docs/DEPLOYMENT.md):
// read the file and INSERT the rows back, in the order listed below (parents before children).
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db';

const TABLES = [
  'admin_users', 'settings', 'campaigns', 'products', 'product_images', 'price_tiers',
  'inventory_movements', 'delivery_batches', 'orders', 'order_items', 'delivery_quotes',
  'order_status_history', 'payments', 'delivery_attempts', 'expenses', 'audit_events', 'media',
];

const db = await openDb();
const out: Record<string, unknown[]> = {};
// Row order isn't important for a backup; only the table order above matters, for restoring parents before children.
for (const t of TABLES) out[t] = await db.q(`SELECT * FROM ${t}`);

const dir = path.resolve(process.cwd(), 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join(dir, `backup-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));

const counts = Object.entries(out).map(([t, rows]) => `${t}: ${rows.length}`).join(', ');
console.log(`Wrote ${file}\n${counts}`);
await db.close();
