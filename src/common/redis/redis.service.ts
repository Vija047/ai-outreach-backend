import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { buildRedisClientOptions } from './redis-options';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl =
      this.configService.get<string>('app.redisUrl') ??
      'redis://localhost:6379';

    this.client = new Redis(
      redisUrl,
      buildRedisClientOptions(redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      }),
    );

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection error: ${err.message}`);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<string> {
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      return await this.client.ping();
    } catch {
      return 'DOWN';
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      // cache miss on redis failure
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      await this.client.del(key);
    } catch {
      // ignore
    }
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
