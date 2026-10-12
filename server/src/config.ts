import 'dotenv/config';

// NODE_ENV === 'production' normally, but also treat "running on Render" as production even if
// NODE_ENV didn't reach the process as expected — otherwise the app can silently fall back to the
// dev-only embedded database, whose in-memory Postgres engine OOMs a 512MB instance.
const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 4000),
  clientOrigins: (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').split(',').map((s) => s.trim()),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret',
  databaseUrl: process.env.DATABASE_URL || '',
  orsKey: process.env.ORS_API_KEY || '',
  mockKm: process.env.DISTANCE_MOCK_KM ? Number(process.env.DISTANCE_MOCK_KM) : null,
};

export function validateProductionConfig() {
  if (isProd && (env.jwtSecret === 'dev-only-secret' || env.jwtSecret.length < 32)) {
    throw new Error('JWT_SECRET must be set to a long random value in production (at least 32 characters)');
  }
  if (isProd && !env.databaseUrl) {
    throw new Error('DATABASE_URL is required in production (embedded dev DB is not persistent). Please set DATABASE_URL in your Render Environment settings.');
  }
}
