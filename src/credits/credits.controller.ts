import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreditsService } from './credits.service';
import { CurrentUser, AuthUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('credits')
@ApiBearerAuth()
@Controller('credits')
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  @Get()
  async getCredits(@CurrentUser() user: AuthUserPayload) {
    const [balance, ledger] = await Promise.all([
      this.creditsService.getBalance(user.id),
      this.creditsService.getLedger(user.id),
    ]);
    return { balance, ledger };
  }
}
