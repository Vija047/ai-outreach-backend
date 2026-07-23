import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AnalysisJobStep,
  AnalysisJobStatus,
  CreditReason,
  HookSourceType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { SCRAPER_PORT } from '../scraper/scraper.port';
import { FirecrawlScraperService } from '../scraper/firecrawl.scraper';
import { NEWS_PORT } from '../enrich/news.port';
import { TavilyNewsService } from '../enrich/tavily.news';
import { LLM_PORT, CompanyAnalysisResult } from '../../ai/llm.port';
import { OpenAiService } from '../../ai/openai.service';
import { CreditsService } from '../../credits/credits.service';
import {
  AnalysisError,
  MIN_SCRAPED_CONTENT_LENGTH,
} from '../../common/errors/analysis.error';
import {
  extractDomain,
  normalizeAnalyzeUrl,
} from '../../common/utils/url.utils';
import { ContactDiscoveryService } from '../../contacts/contact-discovery.service';

@Injectable()
export class CompanyAnalysisService {
  private readonly logger = new Logger(CompanyAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
    private readonly creditsService: CreditsService,
    private readonly contactDiscovery: ContactDiscoveryService,
    @Inject(SCRAPER_PORT) private readonly scraper: FirecrawlScraperService,
    @Inject(NEWS_PORT) private readonly news: TavilyNewsService,
    @Inject(LLM_PORT) private readonly llm: OpenAiService,
  ) {}

  normalizeDomain(url: string): string {
    try {
      return extractDomain(normalizeAnalyzeUrl(url));
    } catch {
      throw new Error('Invalid URL');
    }
  }

  async getCachedCompanyId(domain: string): Promise<string | null> {
    const cached = await this.redis.get(`company:analysis:${domain}`);
    if (cached) return cached;

    const company = await this.prisma.company.findUnique({
      where: { domain },
      select: { id: true },
    });
    if (company) {
      await this.cacheCompanyId(domain, company.id);
      return company.id;
    }

    return null;
  }

  async cacheCompanyId(domain: string, companyId: string) {
    await this.redis.set(`company:analysis:${domain}`, companyId, 86400);
  }

  private async setJobStep(jobId: string, step: AnalysisJobStep) {
    await this.prisma.analysisJob.update({
      where: { id: jobId },
      data: { step },
    });
  }

  private normalizeHookSourceType(value?: string): HookSourceType {
    if (value === 'news') return HookSourceType.NEWS;
    return HookSourceType.WEBSITE;
  }

  private enrichHooks(hooks: CompanyAnalysisResult['hooks'], jobUrl: string) {
    return hooks.map((hook) => {
      const sourceType = this.normalizeHookSourceType(hook.sourceType);
      const sourceUrl =
        hook.sourceUrl ??
        (sourceType === HookSourceType.WEBSITE ? jobUrl : null);

      return {
        title: hook.title,
        description: hook.description,
        confidence: hook.confidence,
        sourceUrl,
        sourceType,
        excerpt: hook.excerpt?.trim() || hook.description.slice(0, 200),
      };
    });
  }

  private async refundAnalyzeCredit(userId: string, jobId: string) {
    const cost = this.configService.get<number>('app.analyzeCreditCost') ?? 1;
    await this.creditsService.grant(
      userId,
      cost,
      CreditReason.ADMIN_GRANT,
      'analysis_refund',
      jobId,
    );
  }

  async processJob(jobId: string) {
    const job = await this.prisma.analysisJob.findUnique({
      where: { id: jobId },
    });
    if (!job) return;

    await this.prisma.analysisJob.update({
      where: { id: jobId },
      data: {
        status: AnalysisJobStatus.RUNNING,
        step: AnalysisJobStep.SCRAPING,
      },
    });

    try {
      const cachedId = await this.getCachedCompanyId(job.domain);
      if (cachedId) {
        const company = await this.prisma.company.findUnique({
          where: { id: cachedId },
          include: { hooks: true },
        });
        if (company) {
          await this.prisma.analysisJob.update({
            where: { id: jobId },
            data: {
              status: AnalysisJobStatus.DONE,
              companyId: company.id,
              step: AnalysisJobStep.SAVING,
            },
          });
          return;
        }
      }

      const existingByDomain = await this.prisma.company.findUnique({
        where: { domain: job.domain },
        select: { id: true },
      });
      if (existingByDomain) {
        await this.cacheCompanyId(job.domain, existingByDomain.id);
        await this.prisma.analysisJob.update({
          where: { id: jobId },
          data: {
            status: AnalysisJobStatus.DONE,
            companyId: existingByDomain.id,
            step: AnalysisJobStep.SAVING,
          },
        });
        return;
      }

      let pages;
      try {
        pages = await this.scraper.scrape(job.url);
      } catch (error) {
        if (error instanceof Error && error.message === 'UNREACHABLE_URL') {
          throw new AnalysisError(
            'UNREACHABLE_URL',
            'Could not reach this website',
          );
        }
        throw error;
      }
      const websiteContent = pages
        .map((p) => p.markdown)
        .join('\n\n')
        .trim();

      if (websiteContent.length < MIN_SCRAPED_CONTENT_LENGTH) {
        throw new AnalysisError(
          'EMPTY_CONTENT',
          'Website had too little content to analyze',
        );
      }

      await this.setJobStep(jobId, AnalysisJobStep.ENRICHING);

      const companyNameGuess = job.domain.split('.')[0];
      const newsResults = await this.news.search(companyNameGuess, job.domain);
      const newsContent = newsResults
        .map((n) => `${n.title}: ${n.content} (${n.url})`)
        .join('\n');

      await this.setJobStep(jobId, AnalysisJobStep.ANALYZING);

      const analysis = await this.llm.analyzeCompany(
        websiteContent,
        newsContent,
        job.domain,
      );

      const enrichedHooks = this.enrichHooks(analysis.hooks, job.url);
      const rawMarkdown = websiteContent.slice(0, 50000);

      await this.setJobStep(jobId, AnalysisJobStep.SAVING);

      const company = await this.prisma.company.upsert({
        where: { domain: job.domain },
        create: {
          domain: job.domain,
          name: analysis.companyName,
          websiteUrl: job.url,
          summary: analysis.summary,
          industry: analysis.industry,
          techStack: analysis.techStack,
          mission: analysis.mission,
          rawMarkdown,
          hooks: {
            create: enrichedHooks,
          },
        },
        update: {
          name: analysis.companyName,
          websiteUrl: job.url,
          summary: analysis.summary,
          industry: analysis.industry,
          techStack: analysis.techStack,
          mission: analysis.mission,
          rawMarkdown,
          analyzedAt: new Date(),
        },
        include: { hooks: true },
      });

      if (enrichedHooks.length > 0) {
        await this.prisma.companyHook.deleteMany({
          where: { companyId: company.id },
        });
        await this.prisma.companyHook.createMany({
          data: enrichedHooks.map((hook) => ({
            companyId: company.id,
            ...hook,
          })),
        });
      }

      await this.cacheCompanyId(job.domain, company.id);

      await this.setJobStep(jobId, AnalysisJobStep.DISCOVERING_CONTACTS);
      try {
        await this.contactDiscovery.discoverIfNeeded(company.id, job.domain);
      } catch (error) {
        this.logger.warn(`Contact discovery failed for ${job.domain}`, error);
      }

      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: {
          status: AnalysisJobStatus.DONE,
          companyId: company.id,
          step: AnalysisJobStep.SAVING,
        },
      });
    } catch (error) {
      this.logger.error(`Analysis job ${jobId} failed`, error);

      const errorCode =
        error instanceof AnalysisError ? error.code : 'ANALYSIS_FAILED';
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.prisma.analysisJob.update({
        where: { id: jobId },
        data: {
          status: AnalysisJobStatus.FAILED,
          error: errorMessage,
          errorCode,
        },
      });

      await this.refundAnalyzeCredit(job.userId, jobId);
    }
  }

  async getCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { hooks: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async getHooks(companyId: string) {
    return this.prisma.companyHook.findMany({
      where: { companyId },
      orderBy: { confidence: 'desc' },
    });
  }

  async getJob(jobId: string, userId: string) {
    const job = await this.prisma.analysisJob.findFirst({
      where: { id: jobId, userId },
      include: {
        company: { include: { hooks: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }
}
