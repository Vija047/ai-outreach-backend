import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContactDiscoveryService } from './contact-discovery.service';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: ContactDiscoveryService,
  ) {}

  private async assertUserCanAccessCompany(userId: string, companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, domain: true, contactsFetchedAt: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    const access = await this.prisma.analysisJob.findFirst({
      where: { userId, companyId },
      select: { id: true },
    });
    if (!access) {
      throw new ForbiddenException('You do not have access to this company');
    }

    return company;
  }

  async getContacts(companyId: string, userId: string) {
    const company = await this.assertUserCanAccessCompany(userId, companyId);

    const contacts = await this.prisma.companyContact.findMany({
      where: { companyId },
      orderBy: [{ rankScore: 'desc' }, { name: 'asc' }],
    });

    return {
      contacts,
      fetchedAt: company.contactsFetchedAt,
      stale: company.contactsFetchedAt
        ? !this.discovery.isCacheFresh(company.contactsFetchedAt)
        : true,
    };
  }

  async refreshContacts(companyId: string, userId: string) {
    const company = await this.assertUserCanAccessCompany(userId, companyId);

    const result = await this.discovery.discover(companyId, company.domain);
    const contacts = await this.prisma.companyContact.findMany({
      where: { companyId },
      orderBy: [{ rankScore: 'desc' }, { name: 'asc' }],
    });

    return {
      contacts,
      fetchedAt: new Date(),
      stale: false,
      warnings: result.warnings,
    };
  }
}
