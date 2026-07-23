import type { RedisOptions } from 'ioredis';

export function parseRedisUrl(redisUrl: string): RedisOptions {
  const isTls = redisUrl.startsWith('rediss://');
  return {
    ...(isTls ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
    connectTimeout: 15000,
    retryStrategy: (times: number) =>
      times > 3 ? null : Math.min(times * 500, 2000),
  };
}

export function buildRedisClientOptions(
  redisUrl: string,
  overrides: Partial<RedisOptions> = {},
): RedisOptions {
  return {
    ...parseRedisUrl(redisUrl),
    ...overrides,
  };
}
