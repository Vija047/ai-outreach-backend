import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScraperPort, ScrapedPage } from './scraper.port';

@Injectable()
export class FirecrawlScraperService implements ScraperPort {
  private readonly logger = new Logger(FirecrawlScraperService.name);

  constructor(private readonly configService: ConfigService) {}

  async scrape(url: string): Promise<ScrapedPage[]> {
    const apiKey = this.configService.get<string>('app.firecrawlApiKey');
    if (!apiKey) {
      this.logger.warn('FIRECRAWL_API_KEY not set, using fallback fetch');
      return this.fallbackFetch(url);
    }

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(
          `Firecrawl failed (${response.status}), using fallback fetch`,
        );
        return this.fallbackFetch(url, text);
      }

      const data = (await response.json()) as {
        data?: { markdown?: string; metadata?: { sourceURL?: string } };
      };

      const markdown = data.data?.markdown?.trim();
      if (!markdown) {
        return this.fallbackFetch(url);
      }

      return [
        {
          url: data.data?.metadata?.sourceURL ?? url,
          markdown,
        },
      ];
    } catch (error) {
      this.logger.warn('Firecrawl error, using fallback fetch', error);
      return this.fallbackFetch(url);
    }
  }

  private async fallbackFetch(
    url: string,
    firecrawlError?: string,
  ): Promise<ScrapedPage[]> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; AIOutreachBot/1.0; +https://ai-outreach.local)',
        },
      });
      const html = await response.text();
      const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
      const description = html
        .match(
          /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
        )?.[1]
        ?.trim();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 15000);

      const markdown = [
        `# ${title ?? url}`,
        description ? `Description: ${description}` : null,
        firecrawlError ? `Note: Firecrawl unavailable` : null,
        '',
        text,
      ]
        .filter(Boolean)
        .join('\n');

      return [{ url, markdown }];
    } catch {
      throw new Error('UNREACHABLE_URL');
    }
  }
}
