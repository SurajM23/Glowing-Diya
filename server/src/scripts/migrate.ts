import { migrate, openDb } from '../db';

const db = await openDb();
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
await db.close();
