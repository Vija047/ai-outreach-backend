import { Injectable, NotFoundException } from '@nestjs/common';
import { ReplyOutcome } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateGenerationDto } from './dto/update-generation.dto';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.generation.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          company: { select: { id: true, name: true, domain: true } },
          hook: { select: { id: true, title: true } },
          contact: {
            select: { id: true, name: true, title: true, email: true },
          },
        },
      }),
      this.prisma.generation.count({ where: { userId } }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOne(userId: string, id: string) {
    const item = await this.prisma.generation.findFirst({
      where: { id, userId },
      include: {
        company: true,
        hook: true,
        contact: true,
      },
    });
    if (!item) throw new NotFoundException('Generation not found');
    return item;
  }

  async update(userId: string, id: string, dto: UpdateGenerationDto) {
    await this.getOne(userId, id);

    return this.prisma.generation.update({
      where: { id },
      data: {
        ...(dto.tone !== undefined ? { tone: dto.tone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.linkedInDm !== undefined ? { linkedInDm: dto.linkedInDm } : {}),
        ...(dto.connectionNote !== undefined
          ? { connectionNote: dto.connectionNote }
          : {}),
        ...(dto.subjectLines !== undefined
          ? { subjectLines: dto.subjectLines }
          : {}),
        ...(dto.followUp1 !== undefined ? { followUp1: dto.followUp1 } : {}),
        ...(dto.followUp2 !== undefined ? { followUp2: dto.followUp2 } : {}),
        ...(dto.sentAt !== undefined ? { sentAt: new Date(dto.sentAt) } : {}),
        ...(dto.replyOutcome !== undefined
          ? { replyOutcome: dto.replyOutcome }
          : {}),
        ...(dto.repliedAt !== undefined
          ? { repliedAt: new Date(dto.repliedAt) }
          : {}),
      },
      include: {
        company: { select: { id: true, name: true, domain: true } },
        hook: { select: { id: true, title: true } },
        contact: {
          select: { id: true, name: true, title: true, email: true },
        },
      },
    });
  }

  async markSent(userId: string, id: string) {
    await this.getOne(userId, id);
    return this.prisma.generation.update({
      where: { id },
      data: {
        sentAt: new Date(),
        replyOutcome: ReplyOutcome.PENDING,
      },
      include: {
        company: { select: { id: true, name: true, domain: true } },
        hook: { select: { id: true, title: true } },
        contact: {
          select: { id: true, name: true, title: true, email: true },
        },
      },
    });
  }
}
