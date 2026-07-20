import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../common/redis/redis.service';

const OTP_PREFIX = 'signup:otp:';
const PENDING_PREFIX = 'signup:pending:';
const RESEND_PREFIX = 'signup:resend:';

export interface PendingSignup {
  name: string;
  email: string;
  passwordHash: string;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly memory = new Map<string, MemoryEntry>();

  constructor(
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {}

  private otpTtlSeconds(): number {
    const minutes =
      this.configService.get<number>('app.otpExpiryMinutes') ?? 10;
    return minutes * 60;
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private useMemoryFallback(): boolean {
    return this.configService.get<string>('app.nodeEnv') === 'development';
  }

  private memSet(key: string, value: string, ttlSeconds: number): void {
    this.memory.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private memGet(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return entry.value;
  }

  private memDel(key: string): void {
    this.memory.delete(key);
  }

  private async getValue(key: string): Promise<string | null> {
    const fromRedis = await this.redis.get(key);
    if (fromRedis) return fromRedis;
    if (this.useMemoryFallback()) return this.memGet(key);
    return null;
  }

  private async setValue(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.set(key, value, ttlSeconds);
    if (this.useMemoryFallback()) {
      this.memSet(key, value, ttlSeconds);
      this.logger.debug(`OTP stored in memory (dev fallback): ${key}`);
    }
  }

  private async delValue(key: string): Promise<void> {
    await this.redis.del(key);
    if (this.useMemoryFallback()) this.memDel(key);
  }

  async storePendingSignup(
    email: string,
    pending: PendingSignup,
    otp: string,
  ): Promise<void> {
    const ttl = this.otpTtlSeconds();
    const normalized = email.toLowerCase();
    await this.setValue(`${OTP_PREFIX}${normalized}`, otp, ttl);
    await this.setValue(
      `${PENDING_PREFIX}${normalized}`,
      JSON.stringify(pending),
      ttl,
    );
  }

  async getPendingSignup(email: string): Promise<PendingSignup | null> {
    const raw = await this.getValue(`${PENDING_PREFIX}${email.toLowerCase()}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PendingSignup;
    } catch {
      return null;
    }
  }

  async verifyOtp(email: string, otp: string): Promise<boolean> {
    const stored = await this.getValue(`${OTP_PREFIX}${email.toLowerCase()}`);
    if (!stored) {
      throw new BadRequestException(
        'Verification code expired or not found. Please request a new code.',
      );
    }
    if (stored !== otp.trim()) {
      throw new BadRequestException('Invalid verification code');
    }
    return true;
  }

  async clearSignup(email: string): Promise<void> {
    const normalized = email.toLowerCase();
    await this.delValue(`${OTP_PREFIX}${normalized}`);
    await this.delValue(`${PENDING_PREFIX}${normalized}`);
  }

  async checkResendRateLimit(email: string): Promise<void> {
    const key = `${RESEND_PREFIX}${email.toLowerCase()}`;
    const last = await this.getValue(key);
    if (last) {
      throw new HttpException(
        'Please wait 60 seconds before requesting another code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.setValue(key, '1', 60);
  }

  createOtp(): string {
    return this.generateOtp();
  }
}
