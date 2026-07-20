import { Injectable } from '@nestjs/common';
import { ContactSource, EmailStatus } from '@prisma/client';
import {
  HunterDomainEmail,
  MergedContact,
  RawPersonRecord,
  RocketReachProfile,
} from './contacts.types';
import { mapHunterEmailStatus } from './hunter.client';

@Injectable()
export class ContactMergeService {
  normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  computeRankScore(title: string, role?: string): number {
    const haystack = `${title} ${role ?? ''}`.toLowerCase();
    if (/(co[- ]?founder|founder)/.test(haystack)) return 100;
    if (/\bceo\b|chief executive/.test(haystack)) return 95;
    if (/\bcto\b|chief technology/.test(haystack)) return 85;
    if (/\bcfo\b|chief financial/.test(haystack)) return 80;
    if (/\bcmo\b|chief marketing/.test(haystack)) return 75;
    if (/\bcoo\b|chief operating/.test(haystack)) return 75;
    if (/president|chairman/.test(haystack)) return 65;
    if (/vice president|\bvp\b/.test(haystack)) return 55;
    return 40;
  }

  buildSourceNote(source: ContactSource, verifiedToday = true): string {
    const when = verifiedToday ? 'today' : 'recently';
    switch (source) {
      case ContactSource.NINJAPEARL:
        return `Found via executive data, analyzed ${when}`;
      case ContactSource.ROCKETREACH:
        return `Found via RocketReach, verified ${when}`;
      case ContactSource.HUNTER:
        return `Found via Hunter domain search, verified ${when}`;
      case ContactSource.BOTH:
        return `Matched RocketReach + Hunter, verified ${when}`;
      default:
        return `Discovered ${when}`;
    }
  }

  fromRocketReachProfiles(
    profiles: RocketReachProfile[],
  ): RawPersonRecord[] {
    return profiles
      .filter((profile) => profile.name?.trim())
      .map((profile) => ({
        name: profile.name.trim(),
        title: profile.title?.trim() || 'Executive',
        linkedinUrl: profile.linkedinUrl ?? null,
        profilePicUrl: profile.profilePicUrl ?? null,
        email: profile.email ?? null,
        emailConfidence: profile.emailConfidence ?? null,
        emailStatus: profile.emailStatus ?? EmailStatus.unknown,
        source: ContactSource.ROCKETREACH,
        sourceNote: this.buildSourceNote(ContactSource.ROCKETREACH),
        rankScore: this.computeRankScore(profile.title ?? ''),
      }));
  }

  /** @deprecated kept for legacy records/tests */
  fromNinjaPearExecutives(
    executives: { name: string; title: string; role?: string }[],
  ): RawPersonRecord[] {
    return executives
      .filter((exec) => exec.name?.trim())
      .map((exec) => ({
        name: exec.name.trim(),
        title: exec.title?.trim() || exec.role || 'Executive',
        linkedinUrl: null,
        profilePicUrl: null,
        email: null,
        emailConfidence: null,
        emailStatus: EmailStatus.unknown,
        source: ContactSource.NINJAPEARL,
        sourceNote: this.buildSourceNote(ContactSource.NINJAPEARL),
        rankScore: this.computeRankScore(exec.title ?? '', exec.role),
      }));
  }

  fromHunterDomainEmails(emails: HunterDomainEmail[]): RawPersonRecord[] {
    return emails
      .filter((entry) => entry.first_name || entry.last_name || entry.value)
      .map((entry) => {
        const name =
          [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim() ||
          entry.value.split('@')[0]?.replace(/[._]/g, ' ') ||
          'Unknown';

        return {
          name,
          title: entry.position?.trim() || 'Team member',
          linkedinUrl: entry.linkedin ?? null,
          profilePicUrl: null,
          email: entry.value ?? null,
          emailConfidence: entry.confidence ?? null,
          emailStatus: EmailStatus.unknown,
          source: ContactSource.HUNTER,
          sourceNote: this.buildSourceNote(ContactSource.HUNTER),
          rankScore: this.computeRankScore(entry.position ?? ''),
        };
      });
  }

  merge(records: RawPersonRecord[]): MergedContact[] {
    const byName = new Map<string, RawPersonRecord>();

    for (const record of records) {
      const key = this.normalizeName(record.name);
      if (!key) continue;

      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { ...record });
        continue;
      }

      byName.set(key, this.mergePair(existing, record));
    }

    return Array.from(byName.values())
      .map((record) => ({
        name: record.name,
        title: record.title,
        linkedinUrl: record.linkedinUrl ?? null,
        profilePicUrl: record.profilePicUrl ?? null,
        email: record.email ?? null,
        emailConfidence: record.emailConfidence ?? null,
        emailStatus: record.emailStatus ?? EmailStatus.unknown,
        source: record.source,
        sourceNote: record.sourceNote,
        rankScore: record.rankScore,
      }))
      .sort((a, b) => b.rankScore - a.rankScore || a.name.localeCompare(b.name));
  }

  applyEmailLookup(
    contact: MergedContact,
    email: string | null,
    confidence: number | null,
    status: EmailStatus,
  ): MergedContact {
    if (!email) return contact;

    return {
      ...contact,
      email,
      emailConfidence: confidence,
      emailStatus: status,
      sourceNote:
        contact.source === ContactSource.ROCKETREACH ||
        contact.source === ContactSource.NINJAPEARL
          ? this.buildSourceNote(ContactSource.BOTH)
          : contact.sourceNote,
      source:
        contact.source === ContactSource.ROCKETREACH ||
        contact.source === ContactSource.NINJAPEARL
          ? ContactSource.BOTH
          : contact.source,
    };
  }

  applyVerifiedEmail(
    contact: MergedContact,
    email: string,
    confidence: number | null,
    status: string | undefined,
  ): MergedContact {
    const emailStatus = mapHunterEmailStatus(status);
    return {
      ...contact,
      email: emailStatus === EmailStatus.invalid ? null : email,
      emailConfidence: confidence,
      emailStatus,
    };
  }

  private mergePair(a: RawPersonRecord, b: RawPersonRecord): RawPersonRecord {
    const sources = new Set([a.source, b.source]);
    const source =
      sources.size > 1 ? ContactSource.BOTH : (a.source ?? b.source);

    const pickTitle = (left: string, right: string) => {
      if (left.length >= right.length) return left;
      return right;
    };

    return {
      name: a.name.length >= b.name.length ? a.name : b.name,
      title: pickTitle(a.title, b.title),
      linkedinUrl: a.linkedinUrl ?? b.linkedinUrl ?? null,
      profilePicUrl: a.profilePicUrl ?? b.profilePicUrl ?? null,
      email: a.email ?? b.email ?? null,
      emailConfidence: a.emailConfidence ?? b.emailConfidence ?? null,
      emailStatus:
        a.emailStatus !== EmailStatus.unknown
          ? a.emailStatus
          : b.emailStatus ?? EmailStatus.unknown,
      source,
      sourceNote: this.buildSourceNote(source),
      rankScore: Math.max(a.rankScore, b.rankScore),
    };
  }
}
