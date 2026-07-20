import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { AnalysisJobStatus, CreditReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';
import { CompanyAnalysisService } from './analysis/company-analysis.service';
import { COMPANY_ANALYSIS_QUEUE } from './analysis/company-analysis.processor';
import { AnalyzeCompanyDto } from './dto/company.dto';
import {
  extractDomain,
  normalizeAnalyzeUrl,
} from '../common/utils/url.utils';

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
    private readonly analysisService: CompanyAnalysisService,
    private readonly configService: ConfigService,
    @InjectQueue(COMPANY_ANALYSIS_QUEUE) private readonly queue: Queue,
  ) {}

  async analyze(userId: string, plan: string, dto: AnalyzeCompanyDto) {
    let normalizedUrl: string;
    let domain: string;
    try {
      normalizedUrl = normalizeAnalyzeUrl(dto.url);
      domain = extractDomain(normalizedUrl);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    const cachedId = await this.analysisService.getCachedCompanyId(domain);
    const skipCharge = !!cachedId;

    if (!skipCharge) {
      const cost =
        this.configService.get<number>('app.analyzeCreditCost') ?? 1;
      await this.creditsService.consume(
        userId,
        cost,
        CreditReason.ANALYZE,
        'url',
        normalizedUrl,
        plan,
      );
    }

    const job = await this.prisma.analysisJob.create({
      data: {
        userId,
        url: normalizedUrl,
        domain,
        status: AnalysisJobStatus.QUEUED,
        ...(cachedId ? { companyId: cachedId, status: AnalysisJobStatus.DONE } : {}),
      },
    });

    if (!cachedId) {
      await this.queue.add('analyze', { jobId: job.id });
    }

    return {
      jobId: job.id,
      status: job.status,
      ...(job.companyId ? { companyId: job.companyId } : {}),
    };
  }

  getCompany(id: string) {
    return this.analysisService.getCompany(id);
  }

  getHooks(companyId: string) {
    return this.analysisService.getHooks(companyId);
  }

  getJob(jobId: string, userId: string) {
    return this.analysisService.getJob(jobId, userId);
  }
}
