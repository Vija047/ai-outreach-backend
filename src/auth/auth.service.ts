import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { AuthProvider, CreditReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreditsService } from '../credits/credits.service';
import {
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  UpdateAccountDto,
} from './dto/auth.dto';
import { EmailService } from './email.service';
import type { GoogleProfile } from './google.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly creditsService: CreditsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async signup(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersService.findByEmail(email);
    const bypassVerification =
      this.configService.get<boolean>('app.bypassEmailVerification') ?? false;

    if (existing) {
      if (existing.emailVerified) {
        throw new ConflictException('Email already registered');
      }

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const verificationToken = bypassVerification
        ? null
        : crypto.randomBytes(32).toString('hex');
      const verificationTokenExpires = bypassVerification
        ? null
        : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name: dto.name.trim(),
          passwordHash,
          emailVerified: bypassVerification,
          verificationToken,
          verificationTokenExpires,
        },
      });

      if (!bypassVerification) {
        this.dispatchVerificationEmail(
          email,
          verificationToken!,
          dto.name.trim(),
        );
        return {
          message:
            'Registration successful. Please check your email and verify your account.',
        };
      }

      return {
        message: 'Registration successful. You can now log in.',
      };
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const verificationToken = bypassVerification
      ? null
      : crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = bypassVerification
      ? null
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
          authProvider: AuthProvider.EMAIL,
          emailVerified: bypassVerification,
          verificationToken,
          verificationTokenExpires,
          profile: { create: {} },
        },
      });

      const signupCredits =
        this.configService.get<number>('app.signupCredits') ?? 20;
      await tx.creditLedger.create({
        data: {
          userId: created.id,
          delta: signupCredits,
          reason: CreditReason.SIGNUP_BONUS,
        },
      });
    });

    if (!bypassVerification) {
      this.dispatchVerificationEmail(email, verificationToken!, dto.name.trim());
      return {
        message:
          'Registration successful. Please check your email and verify your account.',
      };
    }

    return {
      message: 'Registration successful. You can now log in.',
    };
  }

  private dispatchVerificationEmail(
    email: string,
    token: string,
    name: string,
  ): void {
    void this.emailService
      .sendVerificationLinkEmail(email, token, name)
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Background verification email failed for ${email}: ${message}`,
        );
      });
  }

  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required.');
    }

    const user = await this.prisma.user.findFirst({
      where: { verificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Verification link is invalid or expired.');
    }

    if (
      user.verificationTokenExpires &&
      user.verificationTokenExpires < new Date()
    ) {
      throw new BadRequestException('Verification link is invalid or expired.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpires: null,
      },
    });

    return { message: 'Email verified successfully.' };
  }

  async resendVerification(dto: ResendVerificationDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new NotFoundException('No account found with this email.');
    }

    if (user.emailVerified) {
      throw new BadRequestException('This account is already verified.');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        verificationTokenExpires,
      },
    });

    this.dispatchVerificationEmail(email, verificationToken, user.name);

    return { message: 'Verification email resent successfully.' };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses Google sign-in. Please continue with Google.',
      );
    }

    if (!user.emailVerified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.signToken(user.id, user.email, user.plan);
    return {
      accessToken,
      user: this.usersService.sanitizeUser(user),
    };
  }

  async googleLogin(profile: GoogleProfile) {
    const email = profile.email.toLowerCase();
    let user = await this.usersService.findByEmail(email);

    if (user) {
      if (!user.googleId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: profile.googleId,
            emailVerified: true,
            authProvider:
              user.authProvider === AuthProvider.EMAIL
                ? AuthProvider.EMAIL
                : AuthProvider.GOOGLE,
          },
        });
      }
    } else {
      user = await this.createUserWithSignupBonus({
        name: profile.name,
        email,
        googleId: profile.googleId,
        authProvider: AuthProvider.GOOGLE,
        emailVerified: true,
      });
    }

    const accessToken = this.signToken(user.id, user.email, user.plan);
    return {
      accessToken,
      user: this.usersService.sanitizeUser(user),
    };
  }

  buildGoogleCallbackRedirect(accessToken: string): string {
    const frontendUrl =
      this.configService.get<string>('app.frontendUrl') ??
      'http://localhost:3000';
    const url = new URL('/auth/callback', frontendUrl);
    url.searchParams.set('token', accessToken);
    return url.toString();
  }

  buildGoogleErrorRedirect(message: string): string {
    const frontendUrl =
      this.configService.get<string>('app.frontendUrl') ??
      'http://localhost:3000';
    const url = new URL('/auth/callback', frontendUrl);
    url.searchParams.set('error', message);
    return url.toString();
  }

  isGoogleAuthConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('app.googleClientId') &&
      this.configService.get<string>('app.googleClientSecret'),
    );
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

  private async createUserWithSignupBonus(data: {
    name: string;
    email: string;
    passwordHash?: string;
    googleId?: string;
    authProvider: AuthProvider;
    emailVerified: boolean;
  }) {
    const signupCredits =
      this.configService.get<number>('app.signupCredits') ?? 20;

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash: data.passwordHash,
          googleId: data.googleId,
          authProvider: data.authProvider,
          emailVerified: data.emailVerified,
          profile: { create: {} },
        },
        include: { profile: true },
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
  }

  private signToken(sub: string, email: string, plan: string) {
    return this.jwtService.sign({ sub, email, plan });
  }
}
