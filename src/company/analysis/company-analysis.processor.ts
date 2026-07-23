import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Job } from 'bullmq';
import { CompanyAnalysisService } from '../analysis/company-analysis.service';

export const COMPANY_ANALYSIS_QUEUE = 'company-analysis';

@Processor(COMPANY_ANALYSIS_QUEUE)
@Injectable()
export class CompanyAnalysisProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  constructor(private readonly companyAnalysisService: CompanyAnalysisService) {
    super();
  }

  async process(job: Job<{ jobId: string }>) {
    await this.companyAnalysisService.processJob(job.data.jobId);
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }
}
