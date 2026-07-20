import { Module } from '@nestjs/common';
import { OpenAiService } from './openai.service';
import { LLM_PORT } from './llm.port';

@Module({
  providers: [
    OpenAiService,
    { provide: LLM_PORT, useExisting: OpenAiService },
  ],
  exports: [LLM_PORT, OpenAiService],
})
export class AiModule {}
