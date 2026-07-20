import { Module } from '@nestjs/common';
import { GenerateService } from './generate.service';
import { GenerateController } from './generate.controller';
import { ProfileModule } from '../profile/profile.module';
import { CreditsModule } from '../credits/credits.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [ProfileModule, CreditsModule, AiModule],
  controllers: [GenerateController],
  providers: [GenerateService],
})
export class GenerateModule {}
