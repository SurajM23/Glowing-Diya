import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { env } from './config';

export type Q = <T = any>(sql: string, params?: unknown[]) => Promise<T[]>;

export interface Db {
  q: Q;
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../database/migrations');

// Postgres returns BIGINT/NUMERIC as strings; keep integers numeric.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export async function openDb(opts: { memory?: boolean } = {}): Promise<Db> {
  if (!opts.memory && env.databaseUrl) {
    const pool = new pg.Pool({
      connectionString: env.databaseUrl,
      ssl: /localhost|127\.0\.0\.1/.test(env.databaseUrl) ? undefined : { rejectUnauthorized: false },
    });
    return {
      q: async (sql, params) => (await pool.query(sql, params as any[])).rows,
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const out = await fn(async (sql, params) => (await c.query(sql, params as any[])).rows);
          await c.query('COMMIT');
          return out;
        } catch (e) {
          await c.query('ROLLBACK');
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  }
  const dir = opts.memory ? undefined : path.resolve(here, '../.data/pgdata');
  if (dir) fs.mkdirSync(path.dirname(dir), { recursive: true });
  const lite = new PGlite(dir);
  await lite.waitReady;
  return {
    q: async (sql, params) => (await lite.query(sql, params as any[])).rows as any[],
    tx: (fn) => lite.transaction((t) => fn(async (sql, params) => (await t.query(sql, params as any[])).rows as any[])),
    close: () => lite.close(),
  };
}

export async function migrate(db: Db): Promise<string[]> {
  await db.q(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const done = new Set((await db.q<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await db.tx(async (q) => {
      for (const stmt of splitSql(sql)) await q(stmt);
      await q('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
    applied.push(file);
  }
  return applied;
}

// Migration files contain no semicolons inside string literals or function bodies.
function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
}
