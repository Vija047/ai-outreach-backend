import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailStatus } from '@prisma/client';
import { RocketReachProfile } from './contacts.types';

const BASE_URL = 'https://api.rocketreach.co/api/v2';
const REQUEST_TIMEOUT_MS = 20000;
const MIN_REMAINING_LOOKUPS = 1;
const MAX_LOOKUPS_PER_DISCOVERY = 4;

const DECISION_MAKER_TITLES = [
  'CEO',
  'Chief Executive Officer',
  'Founder',
  'Co-Founder',
  'Co Founder',
  'CTO',
  'Chief Technology Officer',
  'President',
  'Owner',
];

interface RocketReachEmail {
  email?: string;
  smtp_valid?: string | null;
  grade?: string | null;
  type?: string | null;
}

interface RocketReachLookupResult {
  id?: number;
  status?: string;
  name?: string | null;
  current_title?: string | null;
  current_employer?: string | null;
  current_employer_domain?: string | null;
  current_employer_linkedin_url?: string | null;
  linkedin_url?: string | null;
  profile_pic?: string | null;
  recommended_professional_email?: string | null;
  current_work_email?: string | null;
  emails?: RocketReachEmail[];
}

@Injectable()
export class RocketReachClient {
  private readonly logger = new Logger(RocketReachClient.name);
  private remainingLookups: number | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<string>('app.rocketreachApiKey'));
  }

  resetQuotaCache() {
    this.remainingLookups = null;
  }

  async getRemainingLookups(): Promise<number | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    if (this.remainingLookups != null) {
      return this.remainingLookups;
    }

    try {
      const response = await this.fetchWithTimeout(`${BASE_URL}/account/`, {
        headers: this.authHeaders(apiKey),
      });

      if (!response.ok) return null;

      const body = (await response.json()) as Record<string, unknown>;
      const remaining = this.extractRemainingLookups(body);
      this.remainingLookups = remaining;
      return remaining;
    } catch (error) {
      this.logger.warn('RocketReach account check failed', error);
      return null;
    }
  }

  async hasLookupQuota(): Promise<boolean> {
    const remaining = await this.getRemainingLookups();
    if (remaining == null) return true;
    return remaining >= MIN_REMAINING_LOOKUPS;
  }

  async searchDecisionMakers(domain: string): Promise<{
    profiles: RocketReachProfile[];
    linkedinCompanyUrl: string | null;
  }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { profiles: [], linkedinCompanyUrl: null };
    }

    const normalizedDomain = domain.replace(/^https?:\/\//, '').split('/')[0];
    const companyGuess =
      normalizedDomain.split('.')[0].charAt(0).toUpperCase() +
      normalizedDomain.split('.')[0].slice(1);

    const response = await this.fetchWithTimeout(`${BASE_URL}/person/search`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(apiKey),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: {
          current_employer: [companyGuess],
          current_title: DECISION_MAKER_TITLES,
        },
        page_size: 10,
        order_by: 'popularity',
      }),
    });

    if (response.status === 403) {
      throw new Error('ROCKETREACH_HTTP_403');
    }

    if (response.status === 429) {
      throw new Error('ROCKETREACH_RATE_LIMIT');
    }

    if (!response.ok) {
      throw new Error(`ROCKETREACH_HTTP_${response.status}`);
    }

    let body = (await response.json()) as unknown;
    let rows = this.extractSearchProfiles(body);

    if (rows.length === 0) {
      const domainResponse = await this.fetchWithTimeout(
        `${BASE_URL}/person/search`,
        {
          method: 'POST',
          headers: {
            ...this.authHeaders(apiKey),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: {
              keyword: [companyGuess],
              current_title: DECISION_MAKER_TITLES,
            },
            page_size: 10,
            order_by: 'popularity',
          }),
        },
      );

      if (domainResponse.ok) {
        body = (await domainResponse.json()) as unknown;
        rows = this.extractSearchProfiles(body);
      }
    }

    const profiles: RocketReachProfile[] = [];
    let linkedinCompanyUrl: string | null = null;

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const record = row;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      if (!name) continue;

      const title =
        (typeof record.current_title === 'string' && record.current_title) ||
        'Executive';

      const linkedinUrl =
        (typeof record.linkedin_url === 'string' && record.linkedin_url) ||
        null;

      const profilePic =
        (typeof record.profile_pic === 'string' && record.profile_pic) || null;

      const employerLinkedin =
        (typeof record.current_employer_linkedin_url === 'string' &&
          record.current_employer_linkedin_url) ||
        null;

      if (!linkedinCompanyUrl && employerLinkedin) {
        linkedinCompanyUrl = employerLinkedin;
      }

      const teaser = record.teaser as Record<string, unknown> | undefined;
      const teaserEmail =
        this.firstString(teaser?.professional_emails) ??
        this.firstString(teaser?.emails);

      profiles.push({
        id: typeof record.id === 'number' ? record.id : undefined,
        name,
        title,
        linkedinUrl,
        profilePicUrl: profilePic,
        email: teaserEmail,
        emailConfidence: teaserEmail ? 70 : null,
        emailStatus: EmailStatus.unknown,
      });
    }

    return { profiles, linkedinCompanyUrl };
  }

  async enrichProfilesWithLookups(
    profiles: RocketReachProfile[],
  ): Promise<RocketReachProfile[]> {
    if (!(await this.hasLookupQuota())) {
      this.logger.warn('RocketReach lookup quota too low, skipping lookups');
      return profiles;
    }

    const enriched: RocketReachProfile[] = [];
    let lookupsUsed = 0;

    for (const profile of profiles) {
      if (lookupsUsed >= MAX_LOOKUPS_PER_DISCOVERY) {
        enriched.push(profile);
        continue;
      }

      if (profile.email) {
        enriched.push(profile);
        continue;
      }

      const lookup = await this.lookupPerson(profile);
      if (lookup) {
        lookupsUsed += 1;
        if (this.remainingLookups != null && this.remainingLookups > 0) {
          this.remainingLookups -= 1;
        }
        enriched.push(lookup);
      } else {
        enriched.push(profile);
      }
    }

    return enriched;
  }

  private async lookupPerson(
    profile: RocketReachProfile,
  ): Promise<RocketReachProfile | null> {
    const apiKey = this.getApiKey();
    if (!apiKey) return null;

    const url = new URL(`${BASE_URL}/person/lookup`);
    if (profile.id) {
      url.searchParams.set('id', String(profile.id));
    } else if (profile.linkedinUrl) {
      url.searchParams.set('linkedin_url', profile.linkedinUrl);
    } else {
      url.searchParams.set('name', profile.name);
      if (profile.title) {
        url.searchParams.set('current_title', profile.title);
      }
    }

    try {
      const response = await this.fetchWithTimeout(url.toString(), {
        headers: this.authHeaders(apiKey),
      });

      if (response.status === 404) return null;
      if (response.status === 429) {
        throw new Error('ROCKETREACH_RATE_LIMIT');
      }
      if (!response.ok) return null;

      const body = (await response.json()) as RocketReachLookupResult;
      const picked = this.pickBestEmail(body);

      if (body.status && body.status !== 'complete' && !picked.email) {
        return this.mergeLookupProfile(
          profile,
          body,
          null,
          EmailStatus.unknown,
        );
      }

      return this.mergeLookupProfile(
        profile,
        body,
        picked.email,
        picked.status,
        picked.confidence,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'ROCKETREACH_RATE_LIMIT'
      ) {
        throw error;
      }
      this.logger.warn(`RocketReach lookup failed for ${profile.name}`, error);
      return null;
    }
  }

  private mergeLookupProfile(
    profile: RocketReachProfile,
    lookup: RocketReachLookupResult,
    email: string | null,
    emailStatus: EmailStatus,
    emailConfidence?: number | null,
  ): RocketReachProfile {
    return {
      id: lookup.id ?? profile.id,
      name: lookup.name?.trim() || profile.name,
      title: lookup.current_title?.trim() || profile.title,
      linkedinUrl: lookup.linkedin_url ?? profile.linkedinUrl,
      profilePicUrl: lookup.profile_pic ?? profile.profilePicUrl,
      email: email ?? profile.email,
      emailConfidence: emailConfidence ?? profile.emailConfidence,
      emailStatus: email ? emailStatus : profile.emailStatus,
    };
  }

  private pickBestEmail(lookup: RocketReachLookupResult): {
    email: string | null;
    status: EmailStatus;
    confidence: number | null;
  } {
    const direct =
      lookup.recommended_professional_email ??
      lookup.current_work_email ??
      null;

    if (direct) {
      const matched = lookup.emails?.find((entry) => entry.email === direct);
      return {
        email: direct,
        status: mapRocketReachSmtpStatus(matched?.smtp_valid),
        confidence: gradeToConfidence(matched?.grade),
      };
    }

    const professional =
      lookup.emails?.find((entry) => entry.type === 'professional') ??
      lookup.emails?.[0];

    if (professional?.email) {
      return {
        email: professional.email,
        status: mapRocketReachSmtpStatus(professional.smtp_valid),
        confidence: gradeToConfidence(professional.grade),
      };
    }

    return { email: null, status: EmailStatus.unknown, confidence: null };
  }

  private extractRemainingLookups(
    body: Record<string, unknown>,
  ): number | null {
    const creditUsage = body.credit_usage;
    if (Array.isArray(creditUsage)) {
      for (const entry of creditUsage) {
        if (
          entry &&
          typeof entry === 'object' &&
          (entry as { credit_type?: string }).credit_type ===
            'standard_lookup' &&
          typeof (entry as { remaining?: unknown }).remaining === 'number'
        ) {
          return (entry as { remaining: number }).remaining;
        }
      }
    }

    const candidates = [
      body.lookup_count_remaining,
      body.lookups_remaining,
      body.remaining_lookups,
      body.lookup_remaining,
    ];

    for (const value of candidates) {
      if (typeof value === 'number') return value;
    }

    const credits = body.credits as Record<string, unknown> | undefined;
    if (credits) {
      for (const key of [
        'lookup_remaining',
        'lookups_remaining',
        'remaining',
      ]) {
        if (typeof credits[key] === 'number') {
          return credits[key];
        }
      }
    }

    return null;
  }

  private extractSearchProfiles(body: unknown): Record<string, unknown>[] {
    if (Array.isArray(body)) {
      return body.filter(
        (row): row is Record<string, unknown> =>
          !!row && typeof row === 'object',
      );
    }

    const wrapped = body as { profiles?: unknown[] };
    if (Array.isArray(wrapped.profiles)) {
      return wrapped.profiles.filter(
        (row): row is Record<string, unknown> =>
          !!row && typeof row === 'object',
      );
    }

    return [];
  }

  private getApiKey(): string | undefined {
    return this.configService.get<string>('app.rocketreachApiKey') || undefined;
  }

  private authHeaders(apiKey: string): Record<string, string> {
    return { 'Api-Key': apiKey };
  }

  private firstString(value: unknown): string | null {
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
    return null;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

export function mapRocketReachSmtpStatus(status?: string | null): EmailStatus {
  switch (status?.toLowerCase()) {
    case 'valid':
      return EmailStatus.valid;
    case 'accept-all':
    case 'accept_all':
      return EmailStatus.accept_all;
    case 'invalid':
      return EmailStatus.invalid;
    case 'risky':
      return EmailStatus.risky;
    default:
      return EmailStatus.unknown;
  }
}

export function gradeToConfidence(grade?: string | null): number | null {
  switch (grade) {
    case 'A':
      return 95;
    case 'A-':
      return 85;
    case 'B':
      return 70;
    case 'B-':
      return 60;
    default:
      return null;
  }
}
