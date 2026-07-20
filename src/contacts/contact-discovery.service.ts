import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContactSource, EmailStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContactMergeService } from './contact-merge.service';
import {
  ContactDiscoveryResult,
  MergedContact,
  RawPersonRecord,
} from './contacts.types';
import { HunterClient, splitFullName } from './hunter.client';
import { RocketReachClient } from './rocketreach.client';

@Injectable()
export class ContactDiscoveryService {
  private readonly logger = new Logger(ContactDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly rocketReach: RocketReachClient,
    private readonly hunter: HunterClient,
    private readonly mergeService: ContactMergeService,
  ) {}

  isCacheFresh(contactsFetchedAt: Date | null | undefined): boolean {
    if (!contactsFetchedAt) return false;
    const cacheDays =
      this.configService.get<number>('app.contactsCacheDays') ?? 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - cacheDays);
    return contactsFetchedAt > cutoff;
  }

  async discoverIfNeeded(
    companyId: string,
    domain: string,
    options: { force?: boolean } = {},
  ): Promise<ContactDiscoveryResult | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { contactsFetchedAt: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    if (!options.force && this.isCacheFresh(company.contactsFetchedAt)) {
      return null;
    }

    return this.discover(companyId, domain);
  }

  async discover(
    companyId: string,
    domain: string,
  ): Promise<ContactDiscoveryResult> {
    this.hunter.resetQuotaCache();
    this.rocketReach.resetQuotaCache();
    const warnings: string[] = [];
    const rawRecords: RawPersonRecord[] = [];

    let linkedinCompanyUrl: string | null = null;

    if (this.rocketReach.isConfigured()) {
      try {
        const searchResult = await this.rocketReach.searchDecisionMakers(domain);
        linkedinCompanyUrl = searchResult.linkedinCompanyUrl;

        const enrichedProfiles =
          await this.rocketReach.enrichProfilesWithLookups(
            searchResult.profiles,
          );

        rawRecords.push(
          ...this.mergeService.fromRocketReachProfiles(enrichedProfiles),
        );
      } catch (error) {
        this.logger.error('RocketReach contact discovery failed', error);
        warnings.push('Could not load decision makers from RocketReach.');
      }
    }

    if (this.hunter.isConfigured()) {
      try {
        const domainEmails = await this.hunter.domainSearch(domain);
        rawRecords.push(
          ...this.mergeService.fromHunterDomainEmails(domainEmails),
        );
      } catch (error) {
        this.logger.error('Hunter domain search failed', error);
        warnings.push('Could not search emails via Hunter.');
      }
    }

    let merged = this.mergeService.merge(rawRecords);

    if (this.hunter.isConfigured()) {
      merged = await this.enrichWithHunterEmails(domain, merged, warnings);
    }

    await this.persistContacts(companyId, merged, linkedinCompanyUrl);

    return { contacts: merged, linkedinCompanyUrl, warnings };
  }

  private async enrichWithHunterEmails(
    domain: string,
    contacts: MergedContact[],
    warnings: string[],
  ): Promise<MergedContact[]> {
    const updated: MergedContact[] = [];

    for (const contact of contacts) {
      if (contact.email) {
        if (contact.source === ContactSource.ROCKETREACH) {
          updated.push(contact);
          continue;
        }

        try {
          const verified = await this.hunter.verifyEmail(contact.email);
          updated.push(
            this.mergeService.applyVerifiedEmail(
              contact,
              contact.email,
              verified.confidence ?? contact.emailConfidence,
              verified.status,
            ),
          );
        } catch {
          updated.push(contact);
        }
        continue;
      }

      const { firstName, lastName } = splitFullName(contact.name);
      if (!firstName) {
        updated.push(contact);
        continue;
      }

      try {
        const found = await this.hunter.findEmail(domain, firstName, lastName);
        updated.push(
          this.mergeService.applyEmailLookup(
            contact,
            found.email,
            found.confidence,
            found.status,
          ),
        );
      } catch (error) {
        this.logger.warn(`Hunter email lookup failed for ${contact.name}`, error);
        warnings.push('Some email lookups were skipped due to Hunter limits.');
        updated.push(contact);
      }
    }

    return updated.sort(
      (a, b) => b.rankScore - a.rankScore || a.name.localeCompare(b.name),
    );
  }

  private async persistContacts(
    companyId: string,
    contacts: MergedContact[],
    linkedinCompanyUrl: string | null,
  ) {
    await this.prisma.$transaction([
      this.prisma.companyContact.deleteMany({ where: { companyId } }),
      ...(contacts.length
        ? [
            this.prisma.companyContact.createMany({
              data: contacts.map((contact) => ({
                companyId,
                name: contact.name,
                title: contact.title,
                linkedinUrl: contact.linkedinUrl,
                profilePicUrl: contact.profilePicUrl,
                email: contact.email,
                emailConfidence: contact.emailConfidence,
                emailStatus: contact.emailStatus ?? EmailStatus.unknown,
                source: contact.source,
                sourceNote: contact.sourceNote,
                rankScore: contact.rankScore,
              })),
            }),
          ]
        : []),
      this.prisma.company.update({
        where: { id: companyId },
        data: {
          contactsFetchedAt: new Date(),
          ...(linkedinCompanyUrl ? { linkedinCompanyUrl } : {}),
        },
      }),
    ]);
  }
}
