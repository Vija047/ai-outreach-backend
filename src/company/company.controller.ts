import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { ContactsService } from '../contacts/contacts.service';
import { AnalyzeCompanyDto } from './dto/company.dto';
import { CurrentUser, AuthUserPayload } from '../common/decorators/current-user.decorator';

@ApiTags('company')
@ApiBearerAuth()
@Controller('company')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly contactsService: ContactsService,
  ) {}

  @Post('analyze')
  analyze(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: AnalyzeCompanyDto,
  ) {
    return this.companyService.analyze(user.id, user.plan, dto);
  }

  @Get('jobs/:jobId')
  getJob(
    @CurrentUser() user: AuthUserPayload,
    @Param('jobId') jobId: string,
  ) {
    return this.companyService.getJob(jobId, user.id);
  }

  @Get(':id')
  getCompany(@Param('id') id: string) {
    return this.companyService.getCompany(id);
  }

  @Get(':id/hooks')
  getHooks(@Param('id') id: string) {
    return this.companyService.getHooks(id);
  }

  @Get(':id/contacts')
  getContacts(@Param('id') id: string) {
    return this.contactsService.getContacts(id);
  }

  @Post(':id/contacts/refresh')
  refreshContacts(@Param('id') id: string) {
    return this.contactsService.refreshContacts(id);
  }
}
