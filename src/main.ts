import 'dotenv/config';
import * as dns from 'dns';

// Force Node.js to prefer IPv4 over IPv6 when resolving DNS.
// This prevents ENETUNREACH errors on environments like Render that lack outbound IPv6 routing.
dns.setDefaultResultOrder('ipv4first');

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { validateProductionEnv } from './config/validate-env';

async function bootstrap() {
  validateProductionEnv();

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  const isProd = nodeEnv === 'production';

  // Render / reverse proxies set X-Forwarded-* headers
  const expressApp = app.getHttpAdapter().getInstance() as {
    set?: (key: string, value: unknown) => void;
  };
  expressApp.set?.('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const frontendUrl =
    configService.get<string>('app.frontendUrl') ?? 'http://localhost:3000';
  const extraOrigins = configService.get<string[]>('app.corsOrigins') ?? [];
  const configuredOrigins = new Set<string>([
    frontendUrl.replace(/\/$/, ''),
    ...extraOrigins.map((o) => o.replace(/\/$/, '')),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);

  const vercelRegex = /^https:\/\/.*\.vercel\.app$/;

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) return callback(null, true);
      const cleanOrigin = requestOrigin.replace(/\/$/, '');

      if (
        configuredOrigins.has(cleanOrigin) ||
        vercelRegex.test(cleanOrigin) ||
        cleanOrigin.includes('localhost') ||
        cleanOrigin.includes('127.0.0.1')
      ) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Accept,Authorization,X-Requested-With',
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

  if (!isProd) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AI Outreach API')
      .setDescription('SaaS backend for personalized cold outreach')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log('Swagger available at /api/docs');
  }

  const port = configService.get<number>('app.port') ?? 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`Listening on 0.0.0.0:${port} (${nodeEnv})`);
}
bootstrap();
