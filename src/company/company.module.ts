import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyAnalysisService } from './analysis/company-analysis.service';
import {
  CompanyAnalysisProcessor,
  COMPANY_ANALYSIS_QUEUE,
} from './analysis/company-analysis.processor';
import { FirecrawlScraperService } from './scraper/firecrawl.scraper';
import { SCRAPER_PORT } from './scraper/scraper.port';
import { TavilyNewsService } from './enrich/tavily.news';
import { NEWS_PORT } from './enrich/news.port';
import { AiModule } from '../ai/ai.module';
import { CreditsModule } from '../credits/credits.module';
import { ContactsModule } from '../contacts/contacts.module';
import { buildRedisClientOptions } from '../common/redis/redis-options';

@Module({
  imports: [
    AiModule,
    CreditsModule,
    ContactsModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl =
          config.get<string>('app.redisUrl') ?? 'redis://localhost:6379';
        return {
          connection: {
            url: redisUrl,
            ...buildRedisClientOptions(redisUrl),
          },
        };
      },
    }),
    BullModule.registerQueue({ name: COMPANY_ANALYSIS_QUEUE }),
  ],
  controllers: [CompanyController],
  providers: [
    CompanyService,
    CompanyAnalysisService,
    CompanyAnalysisProcessor,
    FirecrawlScraperService,
    TavilyNewsService,
    { provide: SCRAPER_PORT, useExisting: FirecrawlScraperService },
    { provide: NEWS_PORT, useExisting: TavilyNewsService },
  ],
  exports: [CompanyService],
})
export class CompanyModule {}
