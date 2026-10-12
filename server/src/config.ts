import 'dotenv/config';
import crypto from 'node:crypto';

// NODE_ENV === 'production' normally, but also treat "running on Render" as production
const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

// If JWT_SECRET is unset or a dev placeholder, auto-generate a cryptographically secure 64-char key at runtime
const rawJwtSecret = process.env.JWT_SECRET?.trim() || '';
const hasValidJwtSecret = rawJwtSecret.length >= 32 && !['dev-only-secret', 'change-me-in-development'].includes(rawJwtSecret);
const jwtSecret = hasValidJwtSecret ? rawJwtSecret : crypto.randomBytes(32).toString('hex');

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  jwtSecret,
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  orsKey: process.env.ORS_API_KEY?.trim() || '',
  mockKm: process.env.DISTANCE_MOCK_KM ? Number(process.env.DISTANCE_MOCK_KM) : null,
  isAutoJwtSecret: !hasValidJwtSecret,
};

export function validateProductionConfig() {
  if (env.isAutoJwtSecret && isProd) {
    console.warn('[server] Notice: Using auto-generated secure JWT_SECRET. To keep admin sessions persistent across restarts, set a 32+ character JWT_SECRET in your Render Environment settings.');
  }
  if (isProd && !env.databaseUrl) {
    throw new Error(
      'DATABASE_URL is required in production. Embedded PGlite is disabled in production to prevent memory exhaustion (>512 MiB) and data loss. Please set DATABASE_URL in your Render Environment settings.'
    );
  }
}
