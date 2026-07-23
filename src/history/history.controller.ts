import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Query,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { HistoryService } from './history.service';
import { UpdateGenerationDto } from './dto/update-generation.dto';
import {
  CurrentUser,
  AuthUserPayload,
} from '../common/decorators/current-user.decorator';

@ApiTags('history')
@ApiBearerAuth()
@Controller('history')
export class HistoryController {
  constructor(private readonly historyService: HistoryService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUserPayload,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.historyService.list(
      user.id,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthUserPayload, @Param('id') id: string) {
    return this.historyService.getOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateGenerationDto,
  ) {
    return this.historyService.update(user.id, id, dto);
  }

  @Post(':id/mark-sent')
  markSent(@CurrentUser() user: AuthUserPayload, @Param('id') id: string) {
    return this.historyService.markSent(user.id, id);
  }
}
