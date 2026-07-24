import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { UpdateAccountDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  async createUserFromSupabase(id: string, email: string, name: string) {
    const signupCredits =
      this.configService.get<number>('app.signupCredits') ?? 20;

    const normalizedEmail = email.toLowerCase().trim();

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.upsert({
        where: { email: normalizedEmail },
        update: { name: name.trim() },
        create: {
          id,
          name: name.trim(),
          email: normalizedEmail,
          profile: { create: {} },
        },
      });

      try {
        await tx.creditLedger.create({
          data: {
            userId: created.id,
            delta: signupCredits,
            reason: CreditReason.SIGNUP_BONUS,
          },
        });
      } catch {
        // Bonus already granted or ledger entry exists
      }

      this.logger.log(`Provisioned user in database: ${normalizedEmail} (${created.id})`);
      return created;
    });
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
