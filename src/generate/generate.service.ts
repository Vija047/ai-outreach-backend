import {
  BadGatewayException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreditReason,
  CompanyHook,
  CompanyContact,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { CreditsService } from '../credits/credits.service';
import { LLM_PORT } from '../ai/llm.port';
import { OpenAiService } from '../ai/openai.service';
import { GenerateDto } from './dto/generate.dto';

@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly profileService: ProfileService,
    private readonly creditsService: CreditsService,
    private readonly configService: ConfigService,
    @Inject(LLM_PORT) private readonly llm: OpenAiService,
  ) {}

  async generate(userId: string, plan: string, dto: GenerateDto) {
    const profile = await this.profileService.getProfile(userId);
    this.profileService.assertComplete(profile);

    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      include: { hooks: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    const companyAccess = await this.prisma.analysisJob.findFirst({
      where: { userId, companyId: dto.companyId },
      select: { id: true },
    });
    if (!companyAccess) {
      throw new ForbiddenException('You do not have access to this company');
    }

    let hook: CompanyHook | null = null;
    if (dto.hookId) {
      hook = await this.prisma.companyHook.findFirst({
        where: { id: dto.hookId, companyId: dto.companyId },
      });
      if (!hook) throw new NotFoundException('Hook not found');
    }

    let contact: CompanyContact | null = null;
    if (dto.contactId) {
      contact = await this.prisma.companyContact.findFirst({
        where: { id: dto.contactId, companyId: dto.companyId },
      });
      if (!contact) throw new NotFoundException('Contact not found');
    }

    const tone = 'Direct';
    const cost = this.configService.get<number>('app.generateCreditCost') ?? 1;

    let result;
    try {
      result = await this.llm.generateOutreach({
        profile: {
          name: profile.role,
          role: profile.role,
          company: profile.company,
          services: profile.services,
          portfolioUrl: profile.portfolioUrl,
          targetCustomers: profile.targetCustomers,
          valueProposition: profile.valueProposition,
        },
        company: {
          name: company.name,
          domain: company.domain,
          summary: company.summary,
          industry: company.industry,
          techStack: company.techStack ?? [],
          mission: company.mission,
        },
        hook: hook
          ? {
              title: hook.title,
              description: hook.description,
              sourceUrl: hook.sourceUrl,
            }
          : undefined,
        recipient: contact
          ? {
              name: contact.name,
              title: contact.title,
              email: contact.email,
            }
          : undefined,
        tone: dto.tone ?? tone,
      });
    } catch (error) {
      this.logger.error('Outreach generation failed', error);
      const message =
        error instanceof Error ? error.message : 'Outreach generation failed';
      throw new BadGatewayException({
        message: `AI generation failed: ${message}`,
        code: 'GENERATION_FAILED',
      });
    }

    await this.creditsService.consume(
      userId,
      cost,
      CreditReason.GENERATE,
      'company',
      dto.companyId,
      plan,
    );

    const selectedTone = dto.tone ?? tone;
    const activeVariant =
      result.variants?.find((v) => v.tone === selectedTone) ??
      result.variants?.[0] ??
      result;

    const generation = await this.prisma.generation.create({
      data: {
        userId,
        companyId: dto.companyId,
        hookId: dto.hookId,
        contactId: dto.contactId,
        tone: activeVariant.tone ?? selectedTone,
        email: activeVariant.email,
        linkedInDm: activeVariant.linkedInDm,
        connectionNote: activeVariant.connectionNote,
        subjectLines: activeVariant.subjectLines,
        followUp1: activeVariant.followUp1,
        followUp2: activeVariant.followUp2,
        variants: result.variants
          ? (result.variants as unknown as Prisma.InputJsonValue)
          : undefined,
      },
      include: {
        company: { select: { id: true, name: true, domain: true } },
        hook: { select: { id: true, title: true } },
        contact: {
          select: { id: true, name: true, title: true, email: true },
        },
      },
    });

    return generation;
  }
}
