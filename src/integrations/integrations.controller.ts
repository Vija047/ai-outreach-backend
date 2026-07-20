import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('status')
  getStatus() {
    return this.integrationsService.getStatus();
  }
}
