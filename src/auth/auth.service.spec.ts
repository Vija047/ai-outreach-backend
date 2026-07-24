import {
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenType, CreditReason } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { UsersService } from '../users/users.service';

describe('AuthService', () => {
  const prisma = {
    user: { create: jest.fn(), update: jest.fn() },
    creditLedger: { create: jest.fn() },
    authToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const usersService = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    sanitizeUser: jest.fn((user: { passwordHash?: string | null }) => {
      const { passwordHash: _, ...safe } = user;
      return safe;
    }),
  };

  const configService = {
    get: jest.fn((key: string) => {
      const map: Record<string, unknown> = {
        'app.signupCredits': 20,
        'app.frontendUrl': 'http://localhost:3000',
        'app.bypassEmailVerification': false,
      };
      return map[key];
    }),
  };

  const jwtService = {
    sign: jest.fn(() => 'signed-jwt'),
  };

  const mailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      prisma as never,
      usersService as unknown as UsersService,
      configService as never,
      jwtService as unknown as JwtService,
      mailService as unknown as MailService,
    );
  });

  it('register hashes password, creates user with profile and credits, sends verify email', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: false,
      plan: 'FREE',
      createdAt: new Date(),
      updatedAt: new Date(),
      avatarUrl: null,
    });
    prisma.authToken.deleteMany.mockResolvedValue({ count: 0 });
    prisma.authToken.create.mockResolvedValue({});

    const result = await service.register({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.autoLoggedIn).toBe(false);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'test@example.com',
          emailVerified: false,
          passwordHash: expect.any(String),
        }),
      }),
    );
    const hash = prisma.user.create.mock.calls[0][0].data.passwordHash as string;
    expect(await bcrypt.compare('password123', hash)).toBe(true);
    expect(prisma.authToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          type: AuthTokenType.VERIFY_EMAIL,
        }),
      }),
    );
    expect(mailService.sendVerificationEmail).toHaveBeenCalled();
  });

  it('register rejects duplicate email', async () => {
    usersService.findByEmail.mockResolvedValue({ id: 'existing' });
    await expect(
      service.register({
        name: 'Test',
        email: 'test@example.com',
        password: 'password123',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('login rejects unverified users', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      emailVerified: false,
      passwordHash: await bcrypt.hash('password123', 10),
    });

    await expect(
      service.login({ email: 'test@example.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('login returns JWT for verified users', async () => {
    const user = {
      id: 'user-1',
      name: 'Test',
      email: 'test@example.com',
      emailVerified: true,
      passwordHash: await bcrypt.hash('password123', 10),
      plan: 'FREE',
      createdAt: new Date(),
      updatedAt: new Date(),
      avatarUrl: null,
    };
    usersService.findByEmail.mockResolvedValue(user);

    const result = await service.login({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.accessToken).toBe('signed-jwt');
    expect(result.user.email).toBe('test@example.com');
    expect(jwtService.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'test@example.com',
    });
  });

  it('verifyEmail marks user verified and consumes token', async () => {
    const raw = 'abc123';
    const { createHash } = await import('crypto');
    const tokenHash = createHash('sha256').update(raw).digest('hex');

    prisma.authToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      userId: 'user-1',
      type: AuthTokenType.VERIFY_EMAIL,
      tokenHash,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.authToken.delete.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      name: 'Test',
      email: 'test@example.com',
      emailVerified: true,
      plan: 'FREE',
      createdAt: new Date(),
      updatedAt: new Date(),
      avatarUrl: null,
    });

    const result = await service.verifyEmail(raw);
    expect(result.message).toContain('verified');
    expect(result.accessToken).toBe('signed-jwt');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerified: true },
    });
  });
});
