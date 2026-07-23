import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailStatus } from '@prisma/client';
import { HunterDomainEmail } from './contacts.types';

const BASE_URL = 'https://api.hunter.io/v2';
const REQUEST_TIMEOUT_MS = 15000;
const MIN_REMAINING_SEARCHES = 2;

@Injectable()
export class HunterClient {
  private readonly logger = new Logger(HunterClient.name);
  private remainingSearches: number | null = null;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.configService.get<string>('app.hunterApiKey'));
  }

  async getRemainingSearches(): Promise<number | null> {
    const apiKey = this.configService.get<string>('app.hunterApiKey');
    if (!apiKey) return null;

    try {
      const url = `${BASE_URL}/usage?api_key=${encodeURIComponent(apiKey)}`;
      const response = await this.fetchWithTimeout(url);
      if (!response.ok) return null;

      const body = (await response.json()) as {
        data?: {
          requests?: {
            credits?: { remaining?: number; available?: number; used?: number };
            searches?: {
              remaining?: number;
              available?: number;
              used?: number;
            };
          };
        };
      };

      const requests = body.data?.requests;
      if (requests?.credits?.remaining != null) {
        return requests.credits.remaining;
      }
      if (requests?.searches?.remaining != null) {
        return requests.searches.remaining;
      }
      if (
        requests?.searches?.available != null &&
        requests?.searches?.used != null
      ) {
        return requests.searches.available - requests.searches.used;
      }

      return null;
    } catch (error) {
      this.logger.warn('Hunter usage check failed', error);
      return null;
    }
  }

  async hasSearchQuota(): Promise<boolean> {
    if (this.remainingSearches == null) {
      this.remainingSearches = await this.getRemainingSearches();
    }
    if (this.remainingSearches == null) return true;
    return this.remainingSearches >= MIN_REMAINING_SEARCHES;
  }

  private consumeSearchCredit() {
    if (this.remainingSearches != null && this.remainingSearches > 0) {
      this.remainingSearches -= 1;
    }
  }

  async domainSearch(domain: string): Promise<HunterDomainEmail[]> {
    if (!(await this.hasSearchQuota())) {
      this.logger.warn('Hunter search quota too low, skipping domain search');
      return [];
    }

    const apiKey = this.configService.get<string>('app.hunterApiKey');
    if (!apiKey) return [];

    const url = new URL(`${BASE_URL}/domain-search`);
    url.searchParams.set('domain', domain);
    url.searchParams.set('limit', '10');
    url.searchParams.set('api_key', apiKey);

    const response = await this.fetchWithTimeout(url.toString());
    if (response.status === 403 || response.status === 429) {
      throw new Error('HUNTER_RATE_LIMIT');
    }
    if (!response.ok) {
      throw new Error(`HUNTER_HTTP_${response.status}`);
    }

    this.consumeSearchCredit();

    const body = (await response.json()) as {
      data?: { emails?: HunterDomainEmail[] };
    };

    return body.data?.emails ?? [];
  }

  async findEmail(
    domain: string,
    firstName: string,
    lastName: string,
  ): Promise<{
    email: string | null;
    confidence: number | null;
    status: EmailStatus;
  }> {
    if (!(await this.hasSearchQuota())) {
      return { email: null, confidence: null, status: EmailStatus.unknown };
    }

    const apiKey = this.configService.get<string>('app.hunterApiKey');
    if (!apiKey) {
      return { email: null, confidence: null, status: EmailStatus.unknown };
    }

    const url = new URL(`${BASE_URL}/email-finder`);
    url.searchParams.set('domain', domain);
    url.searchParams.set('first_name', firstName);
    url.searchParams.set('last_name', lastName);
    url.searchParams.set('api_key', apiKey);

    const response = await this.fetchWithTimeout(url.toString());
    if (response.status === 403 || response.status === 429) {
      throw new Error('HUNTER_RATE_LIMIT');
    }
    if (!response.ok) {
      return { email: null, confidence: null, status: EmailStatus.unknown };
    }

    this.consumeSearchCredit();

    const body = (await response.json()) as {
      data?: { email?: string | null; score?: number };
    };

    const email = body.data?.email ?? null;
    if (!email) {
      return { email: null, confidence: null, status: EmailStatus.unknown };
    }

    const verified = await this.verifyEmail(email);
    return {
      email: verified.status === EmailStatus.invalid ? null : email,
      confidence: body.data?.score ?? verified.confidence,
      status: verified.status,
    };
  }

  async verifyEmail(email: string): Promise<{
    status: EmailStatus;
    confidence: number | null;
  }> {
    if (!(await this.hasSearchQuota())) {
      return { status: EmailStatus.unknown, confidence: null };
    }

    const apiKey = this.configService.get<string>('app.hunterApiKey');
    if (!apiKey) {
      return { status: EmailStatus.unknown, confidence: null };
    }

    const url = new URL(`${BASE_URL}/email-verifier`);
    url.searchParams.set('email', email);
    url.searchParams.set('api_key', apiKey);

    const response = await this.fetchWithTimeout(url.toString());
    if (response.status === 403 || response.status === 429) {
      throw new Error('HUNTER_RATE_LIMIT');
    }
    if (!response.ok) {
      return { status: EmailStatus.unknown, confidence: null };
    }

    this.consumeSearchCredit();

    const body = (await response.json()) as {
      data?: { status?: string; score?: number };
    };

    return {
      status: mapHunterEmailStatus(body.data?.status),
      confidence: body.data?.score ?? null,
    };
  }

  resetQuotaCache() {
    this.remainingSearches = null;
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

export function mapHunterEmailStatus(status?: string): EmailStatus {
  switch (status?.toLowerCase()) {
    case 'valid':
      return EmailStatus.valid;
    case 'accept_all':
      return EmailStatus.accept_all;
    case 'risky':
      return EmailStatus.risky;
    case 'invalid':
      return EmailStatus.invalid;
    default:
      return EmailStatus.unknown;
  }
}

export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}
