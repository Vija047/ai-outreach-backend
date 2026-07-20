import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.template.findMany({
      where: {
        OR: [{ userId }, { isSystem: true }],
      },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateTemplateDto) {
    return this.prisma.template.create({
      data: { ...dto, userId },
    });
  }

  async update(userId: string, id: string, dto: UpdateTemplateDto) {
    const template = await this.findOwned(userId, id);
    return this.prisma.template.update({
      where: { id: template.id },
      data: dto,
    });
  }

  async remove(userId: string, id: string) {
    const template = await this.findOwned(userId, id);
    await this.prisma.template.delete({ where: { id: template.id } });
    return { deleted: true };
  }

  private async findOwned(userId: string, id: string) {
    const template = await this.prisma.template.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.isSystem || template.userId !== userId) {
      throw new ForbiddenException('Cannot modify this template');
    }
    return template;
  }
}
