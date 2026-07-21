const PRODUCTION_REQUIRED = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'FRONTEND_URL',
] as const;

const PRODUCTION_RECOMMENDED = [
  'OPENAI_API_KEY',
  'FIRECRAWL_API_KEY',
  'EMAIL_USER',
  'EMAIL_PASS',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALLBACK_URL',
] as const;

/**
 * Fail fast in production when critical env vars are missing or unsafe.
 */
export function validateProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  const missing = PRODUCTION_REQUIRED.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(', ')}`,
    );
  }

  const jwt = process.env.JWT_SECRET!.trim();
  if (
    jwt === 'change-me' ||
    jwt === 'change-me-to-a-long-random-secret' ||
    jwt === 'dev-secret-change-in-production' ||
    jwt.length < 32
  ) {
    throw new Error(
      'JWT_SECRET must be a strong random secret (at least 32 characters) in production',
    );
  }

  const redis = process.env.REDIS_URL!.trim();
  if (redis.includes('localhost') || redis.includes('127.0.0.1')) {
    throw new Error(
      'REDIS_URL must point to a managed Redis instance in production (e.g. Upstash)',
    );
  }

  const db = process.env.DATABASE_URL!.trim();
  if (db.includes('localhost') || db.includes('127.0.0.1')) {
    throw new Error(
      'DATABASE_URL must point to a managed Postgres instance in production (e.g. Neon)',
    );
  }

  for (const key of PRODUCTION_RECOMMENDED) {
    if (!process.env[key]?.trim()) {
      // eslint-disable-next-line no-console
      console.warn(`[config] Recommended production env var not set: ${key}`);
    }
  }
}
