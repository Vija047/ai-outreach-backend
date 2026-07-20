import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { OtpService, PendingSignup } from '../src/auth/otp.service';

const otpMemory = new Map<string, { otp: string; pending: PendingSignup }>();
const resendMemory = new Map<string, number>();

function createInMemoryOtpService(): Partial<OtpService> {
  return {
    createOtp: () => '123456',
    storePendingSignup: async (
      email: string,
      pending: PendingSignup,
      otp: string,
    ) => {
      otpMemory.set(email.toLowerCase(), { otp, pending });
    },
    getPendingSignup: async (email: string) => {
      return otpMemory.get(email.toLowerCase())?.pending ?? null;
    },
    verifyOtp: async (email: string, otp: string) => {
      const stored = otpMemory.get(email.toLowerCase())?.otp;
      if (!stored) {
        throw new Error('Verification code expired or not found');
      }
      if (stored !== otp.trim()) {
        throw new Error('Invalid verification code');
      }
      return true;
    },
    clearSignup: async (email: string) => {
      otpMemory.delete(email.toLowerCase());
    },
    checkResendRateLimit: async (email: string) => {
      const key = email.toLowerCase();
      if (resendMemory.has(key)) {
        throw new Error('Please wait before requesting another code');
      }
      resendMemory.set(key, Date.now());
    },
  };
}

describe('AI Outreach API (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  const testEmail = `test-${Date.now()}@example.com`;

  beforeAll(async () => {
    otpMemory.clear();
    resendMemory.clear();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OtpService)
      .useValue(createInMemoryOtpService())
      .compile();

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

  it('POST /api/v1/auth/signup/send-otp', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/signup/send-otp')
      .send({
        name: 'Test User',
        email: testEmail,
        password: 'password123',
      })
      .expect(201);

    expect(res.body.message).toBeDefined();
    expect(res.body.email).toBe(testEmail);
  });

  it('POST /api/v1/auth/signup/verify-otp', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/signup/verify-otp')
      .send({
        email: testEmail,
        otp: '123456',
      })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(testEmail);
    accessToken = res.body.accessToken;
  });

  it('POST /api/v1/auth/login', async () => {
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
