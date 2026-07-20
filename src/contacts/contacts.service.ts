import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ContactDiscoveryService } from './contact-discovery.service';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discovery: ContactDiscoveryService,
  ) {}

  async getContacts(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, domain: true, contactsFetchedAt: true },
    });
    if (!company) throw new NotFoundException('Company not found');

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

  async refreshContacts(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, domain: true },
    });
    if (!company) throw new NotFoundException('Company not found');

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
