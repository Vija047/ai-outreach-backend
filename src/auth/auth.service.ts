import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthProvider, CreditReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreditsService } from '../credits/credits.service';
import {
  LoginDto,
  ResendSignupOtpDto,
  SendSignupOtpDto,
  UpdateAccountDto,
  VerifySignupOtpDto,
} from './dto/auth.dto';
import { OtpService } from './otp.service';
import { EmailService } from './email.service';
import type { GoogleProfile } from './google.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly creditsService: CreditsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly emailService: EmailService,
  ) {}

  async sendSignupOtp(dto: SendSignupOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    await this.otpService.checkResendRateLimit(email);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const otp = this.otpService.createOtp();

    await this.otpService.storePendingSignup(email, {
      name: dto.name.trim(),
      email,
      passwordHash,
    }, otp);

    await this.emailService.sendOtpEmail(email, otp, dto.name.trim());

    return {
      message: 'Verification code sent to your email',
      email,
    };
  }

  async resendSignupOtp(dto: ResendSignupOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const pending = await this.otpService.getPendingSignup(email);
    if (!pending) {
      throw new BadRequestException(
        'No pending signup found. Please start registration again.',
      );
    }

    await this.otpService.checkResendRateLimit(email);

    const otp = this.otpService.createOtp();
    await this.otpService.storePendingSignup(email, pending, otp);
    await this.emailService.sendOtpEmail(email, otp, pending.name);

    return { message: 'Verification code resent', email };
  }

  async verifySignupOtp(dto: VerifySignupOtpDto) {
    const email = dto.email.toLowerCase().trim();
    await this.otpService.verifyOtp(email, dto.otp);

    const pending = await this.otpService.getPendingSignup(email);
    if (!pending) {
      throw new BadRequestException(
        'Signup session expired. Please register again.',
      );
    }

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const user = await this.createUserWithSignupBonus({
      name: pending.name,
      email: pending.email,
      passwordHash: pending.passwordHash,
      authProvider: AuthProvider.EMAIL,
      emailVerified: true,
    });

    await this.otpService.clearSignup(email);

    const accessToken = this.signToken(user.id, user.email, user.plan);
    return {
      accessToken,
      user: this.usersService.sanitizeUser(user),
    };
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
        'Email not verified. Please complete signup verification.',
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
