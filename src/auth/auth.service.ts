import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokenType, CreditReason } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  LoginDto,
  RegisterDto,
  UpdateAccountDto,
} from './dto/auth.dto';
import { MailService } from './mail.service';

const VERIFY_EXPIRY_HOURS = 24;
const RESET_EXPIRY_HOURS = 1;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private frontendUrl(): string {
    return (
      this.configService.get<string>('app.frontendUrl') ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  private bypassEmailVerification(): boolean {
    return this.configService.get<boolean>('app.bypassEmailVerification') === true;
  }

  private signToken(user: { id: string; email: string }) {
    return this.jwtService.sign({ sub: user.id, email: user.email });
  }

  private authResponse(user: { id: string; email: string; name: string; plan: string; createdAt: Date; updatedAt: Date; emailVerified: boolean; avatarUrl: string | null }) {
    return {
      accessToken: this.signToken(user),
      user: this.usersService.sanitizeUser(user as Parameters<UsersService['sanitizeUser']>[0]),
    };
  }

  private async createToken(
    userId: string,
    type: AuthTokenType,
    expiryHours: number,
  ): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    await this.prisma.authToken.deleteMany({ where: { userId, type } });
    await this.prisma.authToken.create({
      data: { userId, type, tokenHash, expiresAt },
    });

    return raw;
  }

  private async consumeToken(raw: string, type: AuthTokenType) {
    const tokenHash = this.hashToken(raw);
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.type !== type) {
      throw new BadRequestException('Invalid or expired token');
    }
    if (record.expiresAt < new Date()) {
      await this.prisma.authToken.delete({ where: { id: record.id } });
      throw new BadRequestException('Invalid or expired token');
    }

    await this.prisma.authToken.delete({ where: { id: record.id } });
    return record;
  }

  async register(dto: RegisterDto) {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const signupCredits =
      this.configService.get<number>('app.signupCredits') ?? 20;
    const autoVerify = this.bypassEmailVerification();

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
          emailVerified: autoVerify,
          profile: { create: {} },
        },
      });

      await tx.creditLedger.create({
        data: {
          userId: created.id,
          delta: signupCredits,
          reason: CreditReason.SIGNUP_BONUS,
        },
      });

      return created;
    });

    if (!autoVerify) {
      const raw = await this.createToken(
        user.id,
        AuthTokenType.VERIFY_EMAIL,
        VERIFY_EXPIRY_HOURS,
      );
      const link = `${this.frontendUrl()}/verify-email?token=${raw}`;
      await this.mailService.sendVerificationEmail(email, link);
    }

    this.logger.log(`Registered user: ${email} (${user.id})`);

    if (autoVerify) {
      return {
        message: 'Registration successful.',
        autoLoggedIn: true,
        ...this.authResponse(user),
      };
    }

    return {
      message:
        'Registration successful. Please check your email to verify your account.',
      autoLoggedIn: false,
    };
  }

  async verifyEmail(token: string) {
    const record = await this.consumeToken(token, AuthTokenType.VERIFY_EMAIL);
    const user = await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
    });
    return {
      message: 'Email verified successfully.',
      ...this.authResponse(user),
    };
  }

  async resendVerification(email: string) {
    const normalized = this.normalizeEmail(email);
    const user = await this.usersService.findByEmail(normalized);

    if (!user) {
      return { message: 'If that email is registered, a verification link was sent.' };
    }
    if (user.emailVerified) {
      return { message: 'Email is already verified.' };
    }

    const raw = await this.createToken(
      user.id,
      AuthTokenType.VERIFY_EMAIL,
      VERIFY_EXPIRY_HOURS,
    );
    const link = `${this.frontendUrl()}/verify-email?token=${raw}`;
    await this.mailService.sendVerificationEmail(normalized, link);

    return { message: 'Verification email sent.' };
  }

  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }

    return this.authResponse(user);
  }

  async forgotPassword(email: string) {
    const normalized = this.normalizeEmail(email);
    const user = await this.usersService.findByEmail(normalized);

    if (user) {
      const raw = await this.createToken(
        user.id,
        AuthTokenType.RESET_PASSWORD,
        RESET_EXPIRY_HOURS,
      );
      const link = `${this.frontendUrl()}/reset-password?token=${raw}`;
      await this.mailService.sendPasswordResetEmail(normalized, link);
    }

    return {
      message:
        'If that email is registered, a password reset link was sent.',
    };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.consumeToken(token, AuthTokenType.RESET_PASSWORD);
    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, emailVerified: true },
    });

    return { message: 'Password updated successfully.' };
  }

  async upsertGoogleUser(profile: {
    email: string;
    name: string;
    avatarUrl?: string;
  }) {
    const email = this.normalizeEmail(profile.email);
    const signupCredits =
      this.configService.get<number>('app.signupCredits') ?? 20;

    let user = await this.usersService.findByEmail(email);
    let isNew = false;

    if (!user) {
      isNew = true;
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name: profile.name.trim() || email.split('@')[0],
            email,
            emailVerified: true,
            avatarUrl: profile.avatarUrl ?? null,
            profile: { create: {} },
          },
        });

        await tx.creditLedger.create({
          data: {
            userId: created.id,
            delta: signupCredits,
            reason: CreditReason.SIGNUP_BONUS,
          },
        });

        return created;
      });
    } else if (profile.avatarUrl && !user.avatarUrl) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { avatarUrl: profile.avatarUrl },
      });
    }

    this.logger.log(
      `${isNew ? 'Created' : 'Linked'} Google user: ${email} (${user.id})`,
    );

    return this.authResponse(user);
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.usersService.sanitizeUser(user);
  }

  async updateMe(userId: string, dto: UpdateAccountDto) {
    if (dto.email) {
      const existing = await this.usersService.findByEmail(dto.email);
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email already in use');
      }
    }
    const user = await this.usersService.updateAccount(userId, dto);
    return this.usersService.sanitizeUser(user);
  }

  logout() {
    return { message: 'Logged out successfully' };
  }
}
