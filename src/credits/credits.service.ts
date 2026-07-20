import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreditReason } from '@prisma/client';

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalance(userId: string): Promise<number> {
    const result = await this.prisma.creditLedger.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    return result._sum.delta ?? 0;
  }

  async grant(
    userId: string,
    amount: number,
    reason: CreditReason,
    refType?: string,
    refId?: string,
  ) {
    return this.prisma.creditLedger.create({
      data: { userId, delta: amount, reason, refType, refId },
    });
  }

  async consume(
    userId: string,
    amount: number,
    reason: CreditReason,
    refType?: string,
    refId?: string,
    plan?: string,
  ): Promise<void> {
    if (plan === 'PRO') return;

    const balance = await this.getBalance(userId);
    if (balance < amount) {
      throw new HttpException(
        { message: 'Insufficient credits', code: 'INSUFFICIENT_CREDITS' },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    await this.prisma.creditLedger.create({
      data: { userId, delta: -amount, reason, refType, refId },
    });
  }

  async getLedger(userId: string, limit = 20) {
    return this.prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
