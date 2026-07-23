import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AI Outreach API (e2e)', () => {
  jest.setTimeout(30000);
  let app: INestApplication<App>;
  let accessToken: string;
  const testEmail = `test-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  }, 15000);

  it('GET /api/v1/health', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .timeout(10000)
      .expect(200);
  });

  it('POST /api/v1/auth/signup', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/signup')
      .send({
        name: 'Test User',
        email: testEmail,
        password: 'password123',
      })
      .expect(201);

    expect(res.body.message).toContain('Registration successful');
  });

  it('POST /api/v1/auth/login should fail for unverified user', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'password123',
      })
      .expect(401)
      .expect((res) => {
        expect(res.body.message).toContain('Please verify your email before logging in.');
      });
  });

  it('GET /api/v1/auth/verify-email', async () => {
    const prisma = app.get(PrismaService);
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user).toBeDefined();
    expect(user.verificationToken).toBeDefined();

    const res = await request(app.getHttpServer())
      .get(`/api/v1/auth/verify-email?token=${user.verificationToken}`)
      .expect(200);

    expect(res.body.message).toContain('Email verified successfully');
  });

  it('POST /api/v1/auth/login should succeed after verification', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'password123',
      })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    accessToken = res.body.accessToken;
  });

  it('GET /api/v1/auth/me', () => {
    return request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.email).toBe(testEmail);
        expect(res.body.passwordHash).toBeUndefined();
      });
  });

  it('PATCH /api/v1/profile', () => {
    return request(app.getHttpServer())
      .patch('/api/v1/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        role: 'AI Developer',
        company: 'VR Solutions',
        services: ['Web Development', 'AI Automation'],
        targetCustomers: 'US Startups',
        valueProposition: 'I help startups ship faster.',
        tone: 'Professional',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body.role).toBe('AI Developer');
      });
  });

  it('GET /api/v1/profile', () => {
    return request(app.getHttpServer())
      .get('/api/v1/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('GET /api/v1/credits', () => {
    return request(app.getHttpServer())
      .get('/api/v1/credits')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.balance).toBeGreaterThanOrEqual(0);
      });
  });

  it('GET /api/v1/templates', () => {
    return request(app.getHttpServer())
      .get('/api/v1/templates')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(Array.isArray(res.body)).toBe(true);
      });
  });

  it('GET /api/v1/analytics/summary', () => {
    return request(app.getHttpServer())
      .get('/api/v1/analytics/summary')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});
