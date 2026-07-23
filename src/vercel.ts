import 'dotenv/config';
import * as dns from 'dns';

// Force Node.js to prefer IPv4 over IPv6 when resolving DNS.
// This prevents ENETUNREACH errors on environments that lack outbound IPv6 routing.
dns.setDefaultResultOrder('ipv4first');

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

const expressApp = express();
let cachedHandler: any;

async function bootstrap() {
  if (cachedHandler) return cachedHandler;

  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
  );

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  const isProd = nodeEnv === 'production';

  // Render / reverse proxies set X-Forwarded-* headers
  const expressInstance = app.getHttpAdapter().getInstance() as {
    set?: (key: string, value: unknown) => void;
  };
  expressInstance.set?.('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const frontendUrl =
    configService.get<string>('app.frontendUrl') ?? 'http://localhost:3000';
  const extraOrigins = configService.get<string[]>('app.corsOrigins') ?? [];
  const origins = new Set<string>([frontendUrl, ...extraOrigins]);
  if (!isProd) {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }

  app.enableCors({
    origin: [...origins],
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  await app.init();
  cachedHandler = expressApp;
  return expressApp;
}

export default async (req: any, res: any) => {
  const handler = await bootstrap();
  return handler(req, res);
};
