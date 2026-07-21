import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;

  constructor(configService: ConfigService) {
    const connectionString =
      configService.get<string>('app.databaseUrl') ||
      configService.get<string>('DATABASE_URL') ||
      process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    const pool = new Pool({
      connectionString,
      // Neon / managed Postgres often need SSL; URL usually includes sslmode
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
