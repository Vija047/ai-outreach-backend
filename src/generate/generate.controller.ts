import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GenerateService } from './generate.service';
import { GenerateDto } from './dto/generate.dto';
import {
  CurrentUser,
  AuthUserPayload,
} from '../common/decorators/current-user.decorator';

@ApiTags('generate')
@ApiBearerAuth()
@Controller('generate')
export class GenerateController {
  constructor(private readonly generateService: GenerateService) {}

  @Post()
  generate(@CurrentUser() user: AuthUserPayload, @Body() dto: GenerateDto) {
    return this.generateService.generate(user.id, user.plan, dto);
  }
}
